import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { FastifyInstance } from "fastify";
import {
  AutomationAlertSeverity,
  AutomationAlertStatus,
  AutomationAlertType,
  JobStatus,
  JobType,
  ScheduledJobCadence,
  ScheduledJobStatus
} from "@prisma/client";
import { recordAutomationSchedulerTickEvent } from "../src/lib/automation-observability.js";
import { prisma } from "../src/lib/prisma.js";
import { authHeader, createTestApp, registerUser, requestJson, resetDatabase } from "./helpers.js";

let app: FastifyInstance;

before(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await app.close();
});

async function createProject(token: string, name: string) {
  const response = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(token),
    payload: { name }
  });

  assert.equal(response.response.statusCode, 201);
  assert.ok(response.body?.data.id);
  return response.body!.data.id;
}

async function createAutomationJob(token: string, projectId: string, name: string, overrides: Record<string, unknown> = {}) {
  const response = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token),
    payload: {
      projectId,
      name,
      type: "ANALYTICS_EXPORT",
      cadence: "DAILY",
      runAtHour: 8,
      runAtMinute: 0,
      timezone: "UTC",
      retryMaxAttempts: 1,
      retryBackoffSeconds: 1,
      retryMaxBackoffSeconds: 1,
      config: {
        dataset: "kpis",
        format: "json"
      },
      startAt: "2026-02-12T07:30:00.000Z",
      ...overrides
    }
  });

  assert.equal(response.response.statusCode, 201);
  assert.ok(response.body?.data.id);
  return response.body!.data.id;
}

test("phase 11.4 bulk DLQ operations: partial-success lifecycle + owner scoping + idempotency", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "automation-phase11-4-bulk-a@local.dev", password);
  const ownerB = await registerUser(app, "automation-phase11-4-bulk-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;
  const ownerAId = ownerA.body?.data.user.id;
  assert.ok(tokenA);
  assert.ok(tokenB);
  assert.ok(ownerAId);

  const projectAId = await createProject(tokenA!, "Phase11.4 Bulk A");
  const projectBId = await createProject(tokenB!, "Phase11.4 Bulk B");

  const dlqA1 = await createAutomationJob(tokenA!, projectAId, "DLQ A1");
  const dlqA2 = await createAutomationJob(tokenA!, projectAId, "DLQ A2");
  const activeA3 = await createAutomationJob(tokenA!, projectAId, "Active A3", {
    type: "ANALYTICS_SNAPSHOT",
    enabled: false,
    config: {
      windowDays: 7
    }
  });

  const dlqB1 = await createAutomationJob(tokenB!, projectBId, "DLQ B1");

  await prisma.scheduledJob.update({
    where: { id: dlqA1 },
    data: { config: { dataset: "BROKEN_DATASET" } }
  });

  await prisma.scheduledJob.update({
    where: { id: dlqA2 },
    data: { config: { dataset: "BROKEN_DATASET" } }
  });

  await prisma.scheduledJob.update({
    where: { id: dlqB1 },
    data: { config: { dataset: "BROKEN_DATASET" } }
  });

  const deadLetterA = await requestJson<{ data: { processed: number } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs/process-due",
    headers: authHeader(tokenA!),
    payload: {
      now: "2026-02-12T08:05:00.000Z",
      limit: 20
    }
  });

  const deadLetterB = await requestJson<{ data: { processed: number } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs/process-due",
    headers: authHeader(tokenB!),
    payload: {
      now: "2026-02-12T08:05:00.000Z",
      limit: 20
    }
  });

  assert.equal(deadLetterA.response.statusCode, 200);
  assert.equal(deadLetterB.response.statusCode, 200);

  const bulkAck = await requestJson<{
    data: {
      requested: number;
      succeeded: number;
      failed: number;
      results: Array<{ jobId: string; ok: boolean; code?: string; alreadyAcknowledged?: boolean }>;
    };
  }>(app, {
    method: "POST",
    url: "/v1/automation/dlq/jobs/bulk/ack",
    headers: authHeader(tokenA!),
    payload: {
      jobIds: [dlqA1, dlqA2, activeA3, dlqB1, "missing-job-id", dlqA1]
    }
  });

  assert.equal(bulkAck.response.statusCode, 200);
  assert.equal(bulkAck.body?.data.requested, 6);
  assert.equal(bulkAck.body?.data.succeeded, 2);
  assert.equal(bulkAck.body?.data.failed, 4);
  assert.equal(
    (bulkAck.body?.data.results ?? []).some((item) => item.jobId === activeA3 && item.ok === false && item.code === "INVALID_STATUS"),
    true
  );
  assert.equal(
    (bulkAck.body?.data.results ?? []).some((item) => item.jobId === dlqB1 && item.ok === false && item.code === "NOT_FOUND"),
    true
  );
  assert.equal(
    (bulkAck.body?.data.results ?? []).some((item) => item.jobId === dlqA1 && item.ok === false && item.code === "DUPLICATE_JOB_ID"),
    true
  );

  const bulkAckAgain = await requestJson<{
    data: {
      succeeded: number;
      failed: number;
      results: Array<{ jobId: string; ok: boolean; alreadyAcknowledged?: boolean }>;
    };
  }>(app, {
    method: "POST",
    url: "/v1/automation/dlq/jobs/bulk/ack",
    headers: authHeader(tokenA!),
    payload: {
      jobIds: [dlqA1, dlqA2]
    }
  });

  assert.equal(bulkAckAgain.response.statusCode, 200);
  assert.equal(bulkAckAgain.body?.data.succeeded, 2);
  assert.equal(bulkAckAgain.body?.data.failed, 0);
  assert.equal((bulkAckAgain.body?.data.results ?? []).every((item) => item.alreadyAcknowledged === true), true);

  const ackEvents = await prisma.automationDlqEvent.count({
    where: {
      ownerId: ownerAId!,
      action: "ACKNOWLEDGED"
    }
  });
  assert.equal(ackEvents, 2);

  const bulkRequeue = await requestJson<{
    data: {
      succeeded: number;
      failed: number;
      results: Array<{ jobId: string; ok: boolean; code?: string; alreadyRequeued?: boolean }>;
    };
  }>(app, {
    method: "POST",
    url: "/v1/automation/dlq/jobs/bulk/requeue",
    headers: authHeader(tokenA!),
    payload: {
      jobIds: [dlqA1, "missing-job-id", dlqA1],
      recomputeFrom: "2026-02-12T09:00:00.000Z"
    }
  });

  assert.equal(bulkRequeue.response.statusCode, 200);
  assert.equal(bulkRequeue.body?.data.succeeded, 1);
  assert.equal(bulkRequeue.body?.data.failed, 2);
  assert.equal(
    (bulkRequeue.body?.data.results ?? []).some((item) => item.jobId === dlqA1 && item.ok === false && item.code === "DUPLICATE_JOB_ID"),
    true
  );

  const patchA2 = await requestJson<{ data: { id: string } }>(app, {
    method: "PATCH",
    url: `/v1/automation/jobs/${dlqA2}`,
    headers: authHeader(tokenA!),
    payload: {
      config: {
        dataset: "kpis",
        format: "json"
      },
      recomputeFrom: "2026-02-12T09:00:00.000Z"
    }
  });
  assert.equal(patchA2.response.statusCode, 200);

  const bulkRetryNow = await requestJson<{
    data: {
      succeeded: number;
      failed: number;
      results: Array<{ jobId: string; ok: boolean; code?: string; alreadyRetried?: boolean; run?: { status: string } }>;
    };
  }>(app, {
    method: "POST",
    url: "/v1/automation/dlq/jobs/bulk/retry-now",
    headers: authHeader(tokenA!),
    payload: {
      jobIds: [dlqA2, dlqA1, "missing-job-id"]
    }
  });

  assert.equal(bulkRetryNow.response.statusCode, 200);
  assert.equal(bulkRetryNow.body?.data.succeeded, 2);
  assert.equal(bulkRetryNow.body?.data.failed, 1);
  assert.equal(
    (bulkRetryNow.body?.data.results ?? []).some((item) => item.jobId === dlqA2 && item.ok && item.run?.status === "SUCCESS"),
    true
  );
  assert.equal(
    (bulkRetryNow.body?.data.results ?? []).some((item) => item.jobId === dlqA1 && item.ok && item.alreadyRetried === true),
    true
  );
});

test("phase 11.4 outbound notifier: webhook success persists delivery metadata", async () => {
  const previous = {
    enabled: process.env.AUTOMATION_ALERT_WEBHOOK_ENABLED,
    url: process.env.AUTOMATION_ALERT_WEBHOOK_URL,
    timeoutMs: process.env.AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS,
    contentionThreshold: process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD,
    dedupe: process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES
  };

  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; method: string }> = [];

  process.env.AUTOMATION_ALERT_WEBHOOK_ENABLED = "true";
  process.env.AUTOMATION_ALERT_WEBHOOK_URL = "https://alerts.local/webhook";
  process.env.AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS = "2000";
  process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD = "1";
  process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES = "1";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      url: String(input),
      method: init?.method ?? "GET"
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    await recordAutomationSchedulerTickEvent({
      at: new Date().toISOString(),
      reason: "interval",
      outcome: "contention",
      durationMs: 5,
      processed: 0,
      remainingDue: 0,
      error: null
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.url, "https://alerts.local/webhook");
    assert.equal(fetchCalls[0]?.method, "POST");

    const alert = await prisma.automationAlertEvent.findFirst({
      where: {
        type: AutomationAlertType.LOCK_CONTENTION_SPIKE
      },
      orderBy: [{ createdAt: "desc" }]
    });

    assert.ok(alert);
    const metadata = alert?.metadata as Record<string, unknown>;
    const delivery = metadata.delivery as Record<string, unknown>;

    assert.equal(delivery.status, "SENT");
    assert.equal(delivery.responseStatus, 202);
    assert.equal(delivery.attemptCount, 1);
    assert.equal(delivery.successCount, 1);
    assert.equal(delivery.failureCount, 0);
  } finally {
    globalThis.fetch = originalFetch;

    if (previous.enabled === undefined) delete process.env.AUTOMATION_ALERT_WEBHOOK_ENABLED;
    else process.env.AUTOMATION_ALERT_WEBHOOK_ENABLED = previous.enabled;

    if (previous.url === undefined) delete process.env.AUTOMATION_ALERT_WEBHOOK_URL;
    else process.env.AUTOMATION_ALERT_WEBHOOK_URL = previous.url;

    if (previous.timeoutMs === undefined) delete process.env.AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS;
    else process.env.AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS = previous.timeoutMs;

    if (previous.contentionThreshold === undefined) delete process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD;
    else process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD = previous.contentionThreshold;

    if (previous.dedupe === undefined) delete process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES;
    else process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES = previous.dedupe;
  }
});

test("phase 11.4 outbound notifier: webhook failure does not block alert persistence", async () => {
  const previous = {
    enabled: process.env.AUTOMATION_ALERT_WEBHOOK_ENABLED,
    url: process.env.AUTOMATION_ALERT_WEBHOOK_URL,
    timeoutMs: process.env.AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS,
    contentionThreshold: process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD,
    dedupe: process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES
  };

  const originalFetch = globalThis.fetch;

  process.env.AUTOMATION_ALERT_WEBHOOK_ENABLED = "true";
  process.env.AUTOMATION_ALERT_WEBHOOK_URL = "https://alerts.local/webhook";
  process.env.AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS = "2000";
  process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD = "1";
  process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES = "1";

  globalThis.fetch = (async () => {
    throw new Error("simulated webhook outage");
  }) as typeof fetch;

  try {
    await recordAutomationSchedulerTickEvent({
      at: new Date().toISOString(),
      reason: "interval",
      outcome: "contention",
      durationMs: 5,
      processed: 0,
      remainingDue: 0,
      error: null
    });

    const alert = await prisma.automationAlertEvent.findFirst({
      where: {
        type: AutomationAlertType.LOCK_CONTENTION_SPIKE
      },
      orderBy: [{ createdAt: "desc" }]
    });

    assert.ok(alert);
    const metadata = alert?.metadata as Record<string, unknown>;
    const delivery = metadata.delivery as Record<string, unknown>;

    assert.equal(delivery.status, "FAILED");
    assert.equal(String(delivery.lastError).includes("simulated webhook outage"), true);
    assert.equal(delivery.attemptCount, 1);
    assert.equal(delivery.failureCount, 1);
  } finally {
    globalThis.fetch = originalFetch;

    if (previous.enabled === undefined) delete process.env.AUTOMATION_ALERT_WEBHOOK_ENABLED;
    else process.env.AUTOMATION_ALERT_WEBHOOK_ENABLED = previous.enabled;

    if (previous.url === undefined) delete process.env.AUTOMATION_ALERT_WEBHOOK_URL;
    else process.env.AUTOMATION_ALERT_WEBHOOK_URL = previous.url;

    if (previous.timeoutMs === undefined) delete process.env.AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS;
    else process.env.AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS = previous.timeoutMs;

    if (previous.contentionThreshold === undefined) delete process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD;
    else process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD = previous.contentionThreshold;

    if (previous.dedupe === undefined) delete process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES;
    else process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES = previous.dedupe;
  }
});

test("phase 11.4 diagnostics: extended KPI payload shape and baseline counters", async () => {
  const password = "change-me-12345";

  const owner = await registerUser(app, "automation-phase11-4-diagnostics@local.dev", password);
  const token = owner.body?.data.token;
  const ownerId = owner.body?.data.user.id;
  assert.ok(token);
  assert.ok(ownerId);

  const projectId = await createProject(token!, "Phase11.4 Diagnostics");

  const now = new Date();
  const iso = (value: Date) => value.toISOString();

  await prisma.automationAlertEvent.createMany({
    data: [
      {
        ownerId: ownerId!,
        projectId,
        type: AutomationAlertType.FAILURE_RATE,
        severity: AutomationAlertSeverity.WARNING,
        status: AutomationAlertStatus.OPEN,
        title: "owner sent",
        message: "owner sent",
        dedupeKey: `owner-sent-${now.getTime()}`,
        metadata: {
          delivery: {
            provider: "webhook",
            status: "SENT",
            attemptedAt: iso(new Date(now.getTime() - 10_000)),
            lastError: null,
            responseStatus: 202,
            attemptCount: 1,
            successCount: 1,
            failureCount: 0,
            skippedCount: 0
          }
        }
      },
      {
        ownerId: ownerId!,
        projectId,
        type: AutomationAlertType.CONSECUTIVE_FAILURES,
        severity: AutomationAlertSeverity.WARNING,
        status: AutomationAlertStatus.OPEN,
        title: "owner failed",
        message: "owner failed",
        dedupeKey: `owner-failed-${now.getTime()}`,
        metadata: {
          delivery: {
            provider: "webhook",
            status: "FAILED",
            attemptedAt: iso(new Date(now.getTime() - 5_000)),
            lastError: "receiver 500",
            responseStatus: 500,
            attemptCount: 1,
            successCount: 0,
            failureCount: 1,
            skippedCount: 0
          }
        }
      },
      {
        ownerId: null,
        projectId: null,
        type: AutomationAlertType.LOCK_CONTENTION_SPIKE,
        severity: AutomationAlertSeverity.WARNING,
        status: AutomationAlertStatus.OPEN,
        title: "global skipped",
        message: "global skipped",
        dedupeKey: `global-skipped-${now.getTime()}`,
        metadata: {
          delivery: {
            provider: "webhook",
            status: "SKIPPED",
            attemptedAt: iso(new Date(now.getTime() - 1_000)),
            lastError: "disabled",
            responseStatus: null,
            attemptCount: 1,
            successCount: 0,
            failureCount: 0,
            skippedCount: 1
          }
        }
      }
    ]
  });

  await prisma.scheduledJob.createMany({
    data: [
      {
        projectId,
        name: "dlq recent",
        type: JobType.ANALYTICS_SNAPSHOT,
        cadence: ScheduledJobCadence.DAILY,
        status: ScheduledJobStatus.DEAD_LETTER,
        deadLetteredAt: new Date(now.getTime() - 30 * 60 * 1000)
      },
      {
        projectId,
        name: "dlq previous",
        type: JobType.ANALYTICS_SNAPSHOT,
        cadence: ScheduledJobCadence.DAILY,
        status: ScheduledJobStatus.DEAD_LETTER,
        deadLetteredAt: new Date(now.getTime() - 25 * 60 * 60 * 1000)
      }
    ]
  });

  await prisma.automationSchedulerTickEvent.createMany({
    data: [
      {
        reason: "interval",
        outcome: "contention",
        durationMs: 4,
        processed: 0,
        remainingDue: 0,
        isContention: true,
        isOverlapSkip: false,
        tickedAt: new Date(now.getTime() - 20 * 60 * 1000)
      },
      {
        reason: "interval",
        outcome: "contention",
        durationMs: 5,
        processed: 0,
        remainingDue: 0,
        isContention: true,
        isOverlapSkip: false,
        tickedAt: new Date(now.getTime() - 80 * 60 * 1000)
      }
    ]
  });

  await prisma.jobRun.createMany({
    data: [
      {
        projectId,
        type: JobType.ANALYTICS_SNAPSHOT,
        status: JobStatus.FAILED,
        createdAt: new Date(now.getTime() - 15 * 60 * 1000),
        updatedAt: new Date(now.getTime() - 15 * 60 * 1000)
      },
      {
        projectId,
        type: JobType.ANALYTICS_SNAPSHOT,
        status: JobStatus.FAILED,
        createdAt: new Date(now.getTime() - 75 * 60 * 1000),
        updatedAt: new Date(now.getTime() - 75 * 60 * 1000)
      }
    ]
  });

  const diagnostics = await requestJson<{
    data: {
      owner: {
        openAlerts: number;
        trends: {
          deadLetter: { currentWindowCount: number; previousWindowCount: number; delta: number };
          contention: { currentWindowCount: number; previousWindowCount: number; delta: number };
          failures: { currentWindowCount: number; previousWindowCount: number; delta: number };
        };
        delivery: {
          totalAttempts: number;
          successCount: number;
          failureCount: number;
          skippedCount: number;
          successRate: number | null;
        };
      };
    };
  }>(app, {
    method: "GET",
    url: "/v1/automation/scheduler/diagnostics",
    headers: authHeader(token!)
  });

  assert.equal(diagnostics.response.statusCode, 200);
  assert.equal(diagnostics.body?.data.owner.openAlerts, 3);
  assert.equal(diagnostics.body?.data.owner.trends.deadLetter.currentWindowCount, 1);
  assert.equal(diagnostics.body?.data.owner.trends.deadLetter.previousWindowCount, 1);
  assert.equal(diagnostics.body?.data.owner.trends.deadLetter.delta, 0);
  assert.equal(diagnostics.body?.data.owner.trends.contention.currentWindowCount, 1);
  assert.equal(diagnostics.body?.data.owner.trends.contention.previousWindowCount, 1);
  assert.equal(diagnostics.body?.data.owner.trends.failures.currentWindowCount, 1);
  assert.equal(diagnostics.body?.data.owner.trends.failures.previousWindowCount, 1);
  assert.equal(diagnostics.body?.data.owner.delivery.totalAttempts, 3);
  assert.equal(diagnostics.body?.data.owner.delivery.successCount, 1);
  assert.equal(diagnostics.body?.data.owner.delivery.failureCount, 1);
  assert.equal(diagnostics.body?.data.owner.delivery.skippedCount, 1);
  assert.equal(diagnostics.body?.data.owner.delivery.successRate, 33.33);
});
