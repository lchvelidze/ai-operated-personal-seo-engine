import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { FastifyInstance } from "fastify";
import { recordAutomationSchedulerTickEvent } from "../src/lib/automation-observability.js";
import { prisma } from "../src/lib/prisma.js";
import { authHeader, createTestApp, registerUser, requestJson, resetDatabase } from "./helpers.js";

let app: FastifyInstance;

async function waitFor<T>(fn: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 5000, intervalMs = 75) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await fn();
    if (predicate(value)) {
      return value;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out after ${timeoutMs}ms`);
}

before(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await app.close();
});

test("phase 11 automation: owner-scoped job lifecycle + run history", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "automation-owner-a@local.dev", password);
  const ownerB = await registerUser(app, "automation-owner-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;
  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Automation Project A"
    }
  });

  const projectB = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenB!),
    payload: {
      name: "Automation Project B"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  assert.equal(projectB.response.statusCode, 201);

  const projectAId = projectA.body?.data.id;
  const projectBId = projectB.body?.data.id;
  assert.ok(projectAId);
  assert.ok(projectBId);

  const createJob = await requestJson<{
    data: {
      id: string;
      cadence: string;
      type: string;
      nextRunAt: string | null;
    };
  }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      name: "Weekly backlink export",
      type: "ANALYTICS_EXPORT",
      cadence: "WEEKLY",
      dayOfWeek: 4,
      runAtHour: 8,
      runAtMinute: 0,
      timezone: "UTC",
      config: {
        dataset: "backlinkOpportunities",
        format: "json",
        limit: 100
      },
      startAt: "2026-02-12T07:00:00.000Z"
    }
  });

  assert.equal(createJob.response.statusCode, 201);
  const jobId = createJob.body?.data.id;
  assert.ok(jobId);
  assert.equal(createJob.body?.data.cadence, "WEEKLY");
  assert.equal(createJob.body?.data.type, "ANALYTICS_EXPORT");
  assert.ok(createJob.body?.data.nextRunAt);

  const listJobs = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/automation/jobs",
    headers: authHeader(tokenA!)
  });

  assert.equal(listJobs.response.statusCode, 200);
  assert.equal(listJobs.body?.meta.total, 1);
  assert.equal(listJobs.body?.data[0]?.id, jobId);

  const scopedDenied = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${jobId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(scopedDenied.response.statusCode, 404);
  assert.equal(scopedDenied.body?.error.code, "NOT_FOUND");

  const patchJob = await requestJson<{
    data: {
      id: string;
      cadence: string;
      dayOfWeek: number | null;
      type: string;
      config: Record<string, unknown> | null;
    };
  }>(app, {
    method: "PATCH",
    url: `/v1/automation/jobs/${jobId}`,
    headers: authHeader(tokenA!),
    payload: {
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 9,
      runAtMinute: 30,
      config: {
        windowDays: 14
      },
      recomputeFrom: "2026-02-12T09:00:00.000Z"
    }
  });

  assert.equal(patchJob.response.statusCode, 200);
  assert.equal(patchJob.body?.data.cadence, "DAILY");
  assert.equal(patchJob.body?.data.dayOfWeek, null);
  assert.equal(patchJob.body?.data.type, "ANALYTICS_SNAPSHOT");
  assert.equal(patchJob.body?.data.config?.windowDays, 14);

  const triggerNow = await requestJson<{
    data: {
      id: string;
      status: string;
      trigger: string;
      scheduledJobId: string | null;
      outputSummary: string | null;
    };
  }>(app, {
    method: "POST",
    url: `/v1/automation/jobs/${jobId}/trigger`,
    headers: authHeader(tokenA!)
  });

  assert.equal(triggerNow.response.statusCode, 200);
  assert.equal(triggerNow.body?.data.status, "SUCCESS");
  assert.equal(triggerNow.body?.data.trigger, "MANUAL");
  assert.equal(triggerNow.body?.data.scheduledJobId, jobId);
  assert.match(triggerNow.body?.data.outputSummary ?? "", /Snapshot:/);

  const listRuns = await requestJson<{
    data: Array<{ id: string; status: string; trigger: string; outputSummary: string | null }>;
    meta: { total: number };
  }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${jobId}/runs`,
    headers: authHeader(tokenA!)
  });

  assert.equal(listRuns.response.statusCode, 200);
  assert.equal(listRuns.body?.meta.total, 1);
  assert.equal(listRuns.body?.data[0]?.status, "SUCCESS");
  assert.equal(listRuns.body?.data[0]?.trigger, "MANUAL");
  assert.ok(listRuns.body?.data[0]?.outputSummary);

  const listRunsDenied = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${jobId}/runs`,
    headers: authHeader(tokenB!)
  });

  assert.equal(listRunsDenied.response.statusCode, 404);
  assert.equal(listRunsDenied.body?.error.code, "NOT_FOUND");

  const deleteJob = await requestJson(app, {
    method: "DELETE",
    url: `/v1/automation/jobs/${jobId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(deleteJob.response.statusCode, 204);

  const getDeleted = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${jobId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(getDeleted.response.statusCode, 404);

  const verifyOwnerBProjectUnaffected = await requestJson<{ data: Array<{ projectId: string }> }>(app, {
    method: "GET",
    url: "/v1/automation/jobs",
    headers: authHeader(tokenB!)
  });

  assert.equal(verifyOwnerBProjectUnaffected.response.statusCode, 200);
  assert.equal(verifyOwnerBProjectUnaffected.body?.data.length, 0);
});

test("phase 11 automation: daily/weekly due processing semantics", async () => {
  const password = "change-me-12345";

  const owner = await registerUser(app, "automation-scheduler-owner@local.dev", password);
  const token = owner.body?.data.token;
  assert.ok(token);

  const project = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(token!),
    payload: {
      name: "Automation Scheduling Project"
    }
  });

  assert.equal(project.response.statusCode, 201);
  const projectId = project.body?.data.id;
  assert.ok(projectId);

  const createDaily = await requestJson<{ data: { id: string; nextRunAt: string | null } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "Daily KPI Snapshot",
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 8,
      runAtMinute: 0,
      timezone: "UTC",
      config: {
        windowDays: 7
      },
      startAt: "2026-02-12T07:30:00.000Z"
    }
  });

  const createWeekly = await requestJson<{ data: { id: string; nextRunAt: string | null } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "Weekly KPI Export",
      type: "ANALYTICS_EXPORT",
      cadence: "WEEKLY",
      dayOfWeek: 4,
      runAtHour: 8,
      runAtMinute: 0,
      timezone: "UTC",
      config: {
        dataset: "kpis",
        format: "json"
      },
      startAt: "2026-02-12T07:30:00.000Z"
    }
  });

  assert.equal(createDaily.response.statusCode, 201);
  assert.equal(createWeekly.response.statusCode, 201);

  const dailyJobId = createDaily.body?.data.id;
  const weeklyJobId = createWeekly.body?.data.id;
  assert.ok(dailyJobId);
  assert.ok(weeklyJobId);

  assert.equal(createDaily.body?.data.nextRunAt, "2026-02-12T08:00:00.000Z");
  assert.equal(createWeekly.body?.data.nextRunAt, "2026-02-12T08:00:00.000Z");

  const processDue = await requestJson<{
    data: {
      processed: number;
      remainingDue: number;
      runs: Array<{ scheduledJobId: string | null; trigger: string; status: string }>;
    };
  }>(app, {
    method: "POST",
    url: "/v1/automation/jobs/process-due",
    headers: authHeader(token!),
    payload: {
      now: "2026-02-12T08:05:00.000Z",
      limit: 10
    }
  });

  assert.equal(processDue.response.statusCode, 200);
  assert.equal(processDue.body?.data.processed, 2);
  assert.equal(processDue.body?.data.remainingDue, 0);
  assert.equal(processDue.body?.data.runs.length, 2);
  assert.equal(processDue.body?.data.runs.every((run) => run.trigger === "SCHEDULED"), true);
  assert.equal(processDue.body?.data.runs.every((run) => run.status === "SUCCESS"), true);

  const dailyAfter = await requestJson<{ data: { nextRunAt: string | null } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${dailyJobId}`,
    headers: authHeader(token!)
  });

  const weeklyAfter = await requestJson<{ data: { nextRunAt: string | null } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${weeklyJobId}`,
    headers: authHeader(token!)
  });

  assert.equal(dailyAfter.response.statusCode, 200);
  assert.equal(weeklyAfter.response.statusCode, 200);
  assert.equal(dailyAfter.body?.data.nextRunAt, "2026-02-13T08:00:00.000Z");
  assert.equal(weeklyAfter.body?.data.nextRunAt, "2026-02-19T08:00:00.000Z");

  const dailyRuns = await requestJson<{ meta: { total: number }; data: Array<{ trigger: string }> }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${dailyJobId}/runs`,
    headers: authHeader(token!)
  });

  const weeklyRuns = await requestJson<{ meta: { total: number }; data: Array<{ trigger: string }> }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${weeklyJobId}/runs`,
    headers: authHeader(token!)
  });

  assert.equal(dailyRuns.response.statusCode, 200);
  assert.equal(weeklyRuns.response.statusCode, 200);
  assert.equal(dailyRuns.body?.meta.total, 1);
  assert.equal(weeklyRuns.body?.meta.total, 1);
  assert.equal(dailyRuns.body?.data[0]?.trigger, "SCHEDULED");
  assert.equal(weeklyRuns.body?.data[0]?.trigger, "SCHEDULED");

  const processAgain = await requestJson<{ data: { processed: number; remainingDue: number } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs/process-due",
    headers: authHeader(token!),
    payload: {
      now: "2026-02-12T08:05:00.000Z",
      limit: 10
    }
  });

  assert.equal(processAgain.response.statusCode, 200);
  assert.equal(processAgain.body?.data.processed, 0);
  assert.equal(processAgain.body?.data.remainingDue, 0);
});

test("phase 11.1 automation hardening: overlapping process-due requests do not double-create runs", async () => {
  const password = "change-me-12345";

  const owner = await registerUser(app, "automation-hardening-concurrency@local.dev", password);
  const token = owner.body?.data.token;
  assert.ok(token);

  const project = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(token!),
    payload: {
      name: "Automation Concurrency Project"
    }
  });

  assert.equal(project.response.statusCode, 201);
  const projectId = project.body?.data.id;
  assert.ok(projectId);

  const createJob = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "Concurrent Due Job",
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 8,
      runAtMinute: 0,
      timezone: "UTC",
      config: {
        windowDays: 7
      },
      startAt: "2026-02-12T07:30:00.000Z"
    }
  });

  assert.equal(createJob.response.statusCode, 201);
  const jobId = createJob.body?.data.id;
  assert.ok(jobId);

  const [processA, processB] = await Promise.all([
    requestJson<{ data: { processed: number; runs: Array<{ id: string }> } }>(app, {
      method: "POST",
      url: "/v1/automation/jobs/process-due",
      headers: authHeader(token!),
      payload: {
        now: "2026-02-12T08:05:00.000Z",
        limit: 10
      }
    }),
    requestJson<{ data: { processed: number; runs: Array<{ id: string }> } }>(app, {
      method: "POST",
      url: "/v1/automation/jobs/process-due",
      headers: authHeader(token!),
      payload: {
        now: "2026-02-12T08:05:00.000Z",
        limit: 10
      }
    })
  ]);

  assert.equal(processA.response.statusCode, 200);
  assert.equal(processB.response.statusCode, 200);

  const totalProcessed = (processA.body?.data.processed ?? 0) + (processB.body?.data.processed ?? 0);
  assert.equal(totalProcessed, 1);

  const runs = await requestJson<{ meta: { total: number }; data: Array<{ trigger: string; status: string }> }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${jobId}/runs`,
    headers: authHeader(token!)
  });

  assert.equal(runs.response.statusCode, 200);
  assert.equal(runs.body?.meta.total, 1);
  assert.equal(runs.body?.data[0]?.trigger, "SCHEDULED");
  assert.equal(runs.body?.data[0]?.status, "SUCCESS");
});

test("phase 11.1 automation hardening: timezone-aware nextRunAt daily + weekly around local day boundaries", async () => {
  const password = "change-me-12345";

  const owner = await registerUser(app, "automation-hardening-timezone@local.dev", password);
  const token = owner.body?.data.token;
  assert.ok(token);

  const project = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(token!),
    payload: {
      name: "Automation Timezone Project"
    }
  });

  assert.equal(project.response.statusCode, 201);
  const projectId = project.body?.data.id;
  assert.ok(projectId);

  const dailyCreate = await requestJson<{ data: { id: string; nextRunAt: string | null } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "Daily NY midnight-ish",
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 0,
      runAtMinute: 10,
      timezone: "America/New_York",
      config: {
        windowDays: 3
      },
      startAt: "2026-02-12T04:55:00.000Z"
    }
  });

  const weeklyCreate = await requestJson<{ data: { id: string; nextRunAt: string | null } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "Weekly LA Monday 00:10",
      type: "ANALYTICS_EXPORT",
      cadence: "WEEKLY",
      dayOfWeek: 1,
      runAtHour: 0,
      runAtMinute: 10,
      timezone: "America/Los_Angeles",
      config: {
        dataset: "kpis",
        format: "json"
      },
      startAt: "2026-02-16T07:55:00.000Z"
    }
  });

  assert.equal(dailyCreate.response.statusCode, 201);
  assert.equal(weeklyCreate.response.statusCode, 201);
  assert.equal(dailyCreate.body?.data.nextRunAt, "2026-02-12T05:10:00.000Z");
  assert.equal(weeklyCreate.body?.data.nextRunAt, "2026-02-16T08:10:00.000Z");

  const dailyJobId = dailyCreate.body?.data.id;
  const weeklyJobId = weeklyCreate.body?.data.id;
  assert.ok(dailyJobId);
  assert.ok(weeklyJobId);

  const processDue = await requestJson<{ data: { processed: number } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs/process-due",
    headers: authHeader(token!),
    payload: {
      now: "2026-02-16T08:15:00.000Z",
      limit: 10
    }
  });

  assert.equal(processDue.response.statusCode, 200);
  assert.equal(processDue.body?.data.processed, 2);

  const dailyAfter = await requestJson<{ data: { nextRunAt: string | null } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${dailyJobId}`,
    headers: authHeader(token!)
  });

  const weeklyAfter = await requestJson<{ data: { nextRunAt: string | null } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${weeklyJobId}`,
    headers: authHeader(token!)
  });

  assert.equal(dailyAfter.response.statusCode, 200);
  assert.equal(weeklyAfter.response.statusCode, 200);
  assert.equal(dailyAfter.body?.data.nextRunAt, "2026-02-17T05:10:00.000Z");
  assert.equal(weeklyAfter.body?.data.nextRunAt, "2026-02-23T08:10:00.000Z");
});

test("phase 11.2 reliability: scheduler diagnostics endpoint is owner-safe and structured", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "automation-phase11-2-diagnostics-a@local.dev", password);
  const ownerB = await registerUser(app, "automation-phase11-2-diagnostics-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;
  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Diagnostics Owner A Project"
    }
  });

  const projectB = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenB!),
    payload: {
      name: "Diagnostics Owner B Project"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  assert.equal(projectB.response.statusCode, 201);

  const projectAId = projectA.body?.data.id;
  assert.ok(projectAId);

  const job = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      name: "Diagnostics Snapshot",
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 8,
      runAtMinute: 0,
      timezone: "UTC",
      startAt: "2026-02-12T07:30:00.000Z"
    }
  });

  assert.equal(job.response.statusCode, 201);
  const jobId = job.body?.data.id;
  assert.ok(jobId);

  const runNow = await requestJson<{ data: { status: string } }>(app, {
    method: "POST",
    url: `/v1/automation/jobs/${jobId}/trigger`,
    headers: authHeader(tokenA!)
  });

  assert.equal(runNow.response.statusCode, 200);
  assert.equal(runNow.body?.data.status, "SUCCESS");

  const diagnosticsA = await requestJson<{
    data: {
      scheduler: { enabled: boolean; recentTicks: unknown[] };
      lock: { isLocked: boolean };
      owner: { runStats: { total: number }; activeJobs: number };
    };
  }>(app, {
    method: "GET",
    url: "/v1/automation/scheduler/diagnostics",
    headers: authHeader(tokenA!)
  });

  const diagnosticsB = await requestJson<{
    data: {
      owner: { runStats: { total: number }; activeJobs: number };
    };
  }>(app, {
    method: "GET",
    url: "/v1/automation/scheduler/diagnostics",
    headers: authHeader(tokenB!)
  });

  assert.equal(diagnosticsA.response.statusCode, 200);
  assert.equal(typeof diagnosticsA.body?.data.scheduler.enabled, "boolean");
  assert.equal(Array.isArray(diagnosticsA.body?.data.scheduler.recentTicks), true);
  assert.equal(typeof diagnosticsA.body?.data.lock.isLocked, "boolean");
  assert.ok((diagnosticsA.body?.data.owner.runStats.total ?? 0) >= 1);
  assert.ok((diagnosticsA.body?.data.owner.activeJobs ?? 0) >= 1);

  assert.equal(diagnosticsB.response.statusCode, 200);
  assert.equal(diagnosticsB.body?.data.owner.runStats.total, 0);
  assert.equal(diagnosticsB.body?.data.owner.activeJobs, 0);
});

test("phase 11.2 reliability: retries progress with bounded backoff and dead-letter terminal state", async () => {
  const password = "change-me-12345";

  const owner = await registerUser(app, "automation-phase11-2-retry@local.dev", password);
  const token = owner.body?.data.token;
  assert.ok(token);

  const project = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(token!),
    payload: {
      name: "Retry Reliability Project"
    }
  });

  assert.equal(project.response.statusCode, 201);
  const projectId = project.body?.data.id;
  assert.ok(projectId);

  const createJob = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "Retry Dead-Letter Job",
      type: "ANALYTICS_EXPORT",
      cadence: "DAILY",
      runAtHour: 8,
      runAtMinute: 0,
      timezone: "UTC",
      retryMaxAttempts: 3,
      retryBackoffSeconds: 1,
      retryMaxBackoffSeconds: 2,
      config: {
        dataset: "kpis",
        format: "json"
      },
      startAt: "2026-02-12T07:30:00.000Z"
    }
  });

  assert.equal(createJob.response.statusCode, 201);
  const jobId = createJob.body?.data.id;
  assert.ok(jobId);

  await prisma.scheduledJob.update({
    where: { id: jobId! },
    data: {
      config: {
        dataset: "BROKEN_DATASET"
      }
    }
  });

  const retryTimelineStart = new Date();

  const attempt1 = await requestJson<{ data: { processed: number; runs: Array<{ attemptNumber: number; status: string; nextRetryAt: string | null }> } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs/process-due",
    headers: authHeader(token!),
    payload: {
      now: retryTimelineStart.toISOString(),
      limit: 10
    }
  });

  assert.equal(attempt1.response.statusCode, 200);
  assert.equal(attempt1.body?.data.processed, 1);
  assert.equal(attempt1.body?.data.runs[0]?.attemptNumber, 1);
  assert.equal(attempt1.body?.data.runs[0]?.status, "FAILED");
  assert.ok(attempt1.body?.data.runs[0]?.nextRetryAt);

  const attempt2 = await requestJson<{ data: { processed: number; runs: Array<{ attemptNumber: number; status: string; nextRetryAt: string | null }> } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs/process-due",
    headers: authHeader(token!),
    payload: {
      now: new Date(retryTimelineStart.getTime() + 12_000).toISOString(),
      limit: 10
    }
  });

  assert.equal(attempt2.response.statusCode, 200);
  assert.equal(attempt2.body?.data.processed, 2);
  assert.deepEqual(
    attempt2.body?.data.runs.map((run) => run.attemptNumber),
    [2, 3]
  );
  assert.equal(attempt2.body?.data.runs[0]?.status, "FAILED");
  assert.ok(attempt2.body?.data.runs[0]?.nextRetryAt);
  assert.equal(attempt2.body?.data.runs[1]?.status, "FAILED");
  assert.equal(attempt2.body?.data.runs[1]?.nextRetryAt, null);

  const jobAfter = await requestJson<{
    data: {
      status: string;
      nextRunAt: string | null;
      health: { consecutiveFailures: number; lastError: string | null; deadLetteredAt: string | null };
      retryState: { nextAttemptNumber: number | null };
    };
  }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${jobId}`,
    headers: authHeader(token!)
  });

  assert.equal(jobAfter.response.statusCode, 200);
  assert.equal(jobAfter.body?.data.status, "DEAD_LETTER");
  assert.equal(jobAfter.body?.data.nextRunAt, null);
  assert.equal(jobAfter.body?.data.retryState.nextAttemptNumber, null);
  assert.equal(jobAfter.body?.data.health.consecutiveFailures, 3);
  assert.ok(jobAfter.body?.data.health.lastError);
  assert.ok(jobAfter.body?.data.health.deadLetteredAt);

  const runs = await requestJson<{ meta: { total: number }; data: Array<{ attemptNumber: number; status: string }> }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${jobId}/runs?page=1&limit=10`,
    headers: authHeader(token!)
  });

  assert.equal(runs.response.statusCode, 200);
  assert.equal(runs.body?.meta.total, 3);
  assert.deepEqual(
    runs.body?.data.map((run) => run.attemptNumber),
    [3, 2, 1]
  );
  assert.equal(runs.body?.data.every((run) => run.status === "FAILED"), true);
});

test("phase 11.2 reliability: catch-up + DST policies are deterministic", async () => {
  const password = "change-me-12345";

  const owner = await registerUser(app, "automation-phase11-2-policy@local.dev", password);
  const token = owner.body?.data.token;
  assert.ok(token);

  const project = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(token!),
    payload: {
      name: "Policy Semantics Project"
    }
  });

  assert.equal(project.response.statusCode, 201);
  const projectId = project.body?.data.id;
  assert.ok(projectId);

  const skipMissed = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "Skip missed daily",
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 8,
      runAtMinute: 0,
      timezone: "UTC",
      catchUpMode: "skip-missed",
      startAt: "2026-02-10T07:00:00.000Z"
    }
  });

  const replayMissed = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "Replay missed daily",
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 8,
      runAtMinute: 0,
      timezone: "UTC",
      catchUpMode: "replay-missed",
      startAt: "2026-02-10T07:00:00.000Z"
    }
  });

  assert.equal(skipMissed.response.statusCode, 201);
  assert.equal(replayMissed.response.statusCode, 201);
  const skipJobId = skipMissed.body?.data.id;
  const replayJobId = replayMissed.body?.data.id;
  assert.ok(skipJobId);
  assert.ok(replayJobId);

  const processDue = await requestJson<{ data: { processed: number } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs/process-due",
    headers: authHeader(token!),
    payload: {
      now: "2026-02-12T08:05:00.000Z",
      limit: 10
    }
  });

  assert.equal(processDue.response.statusCode, 200);
  assert.equal(processDue.body?.data.processed, 4);

  const skipRuns = await requestJson<{ meta: { total: number } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${skipJobId}/runs`,
    headers: authHeader(token!)
  });

  const replayRuns = await requestJson<{ meta: { total: number } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${replayJobId}/runs`,
    headers: authHeader(token!)
  });

  assert.equal(skipRuns.response.statusCode, 200);
  assert.equal(replayRuns.response.statusCode, 200);
  assert.equal(skipRuns.body?.meta.total, 1);
  assert.equal(replayRuns.body?.meta.total, 3);

  const replayJobAfter = await requestJson<{ data: { nextRunAt: string | null } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${replayJobId}`,
    headers: authHeader(token!)
  });

  assert.equal(replayJobAfter.response.statusCode, 200);
  assert.equal(replayJobAfter.body?.data.nextRunAt, "2026-02-13T08:00:00.000Z");

  const dstShiftForward = await requestJson<{ data: { nextRunAt: string | null } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "NY 02:30 shift-forward",
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 2,
      runAtMinute: 30,
      timezone: "America/New_York",
      dstInvalidTimePolicy: "shift-forward",
      startAt: "2026-03-08T06:00:00.000Z"
    }
  });

  const dstSkip = await requestJson<{ data: { nextRunAt: string | null } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "NY 02:30 skip-missing",
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 2,
      runAtMinute: 30,
      timezone: "America/New_York",
      dstInvalidTimePolicy: "skip",
      startAt: "2026-03-08T06:00:00.000Z"
    }
  });

  const dstEarlier = await requestJson<{ data: { nextRunAt: string | null } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "NY 01:30 ambiguous earlier",
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 1,
      runAtMinute: 30,
      timezone: "America/New_York",
      dstAmbiguousTimePolicy: "earlier-offset",
      startAt: "2026-11-01T04:00:00.000Z"
    }
  });

  const dstLater = await requestJson<{ data: { nextRunAt: string | null } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "NY 01:30 ambiguous later",
      type: "ANALYTICS_SNAPSHOT",
      cadence: "DAILY",
      runAtHour: 1,
      runAtMinute: 30,
      timezone: "America/New_York",
      dstAmbiguousTimePolicy: "later-offset",
      startAt: "2026-11-01T04:00:00.000Z"
    }
  });

  assert.equal(dstShiftForward.response.statusCode, 201);
  assert.equal(dstSkip.response.statusCode, 201);
  assert.equal(dstEarlier.response.statusCode, 201);
  assert.equal(dstLater.response.statusCode, 201);

  assert.equal(dstShiftForward.body?.data.nextRunAt, "2026-03-08T07:00:00.000Z");
  assert.equal(dstSkip.body?.data.nextRunAt, "2026-03-09T06:30:00.000Z");
  assert.equal(dstEarlier.body?.data.nextRunAt, "2026-11-01T05:30:00.000Z");
  assert.equal(dstLater.body?.data.nextRunAt, "2026-11-01T06:30:00.000Z");
});

test("phase 11.2 reliability: overlapping retry processing does not duplicate retry attempts", async () => {
  const password = "change-me-12345";

  const owner = await registerUser(app, "automation-phase11-2-retry-overlap@local.dev", password);
  const token = owner.body?.data.token;
  assert.ok(token);

  const project = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(token!),
    payload: {
      name: "Retry Overlap Project"
    }
  });

  assert.equal(project.response.statusCode, 201);
  const projectId = project.body?.data.id;
  assert.ok(projectId);

  const createJob = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(token!),
    payload: {
      projectId,
      name: "Overlap Retry Job",
      type: "ANALYTICS_EXPORT",
      cadence: "DAILY",
      runAtHour: 8,
      runAtMinute: 0,
      timezone: "UTC",
      retryMaxAttempts: 2,
      retryBackoffSeconds: 1,
      retryMaxBackoffSeconds: 1,
      config: {
        dataset: "kpis",
        format: "json"
      },
      startAt: "2026-02-12T07:30:00.000Z"
    }
  });

  assert.equal(createJob.response.statusCode, 201);
  const jobId = createJob.body?.data.id;
  assert.ok(jobId);

  await prisma.scheduledJob.update({
    where: { id: jobId! },
    data: {
      config: {
        dataset: "BROKEN_DATASET"
      }
    }
  });

  const overlapRetryStart = new Date();

  const firstAttempt = await requestJson<{ data: { processed: number } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs/process-due",
    headers: authHeader(token!),
    payload: {
      now: overlapRetryStart.toISOString(),
      limit: 10
    }
  });

  assert.equal(firstAttempt.response.statusCode, 200);
  assert.equal(firstAttempt.body?.data.processed, 1);

  const [retryA, retryB] = await Promise.all([
    requestJson<{ data: { processed: number } }>(app, {
      method: "POST",
      url: "/v1/automation/jobs/process-due",
      headers: authHeader(token!),
      payload: {
        now: new Date(overlapRetryStart.getTime() + 5_000).toISOString(),
        limit: 10
      }
    }),
    requestJson<{ data: { processed: number } }>(app, {
      method: "POST",
      url: "/v1/automation/jobs/process-due",
      headers: authHeader(token!),
      payload: {
        now: new Date(overlapRetryStart.getTime() + 5_000).toISOString(),
        limit: 10
      }
    })
  ]);

  assert.equal(retryA.response.statusCode, 200);
  assert.equal(retryB.response.statusCode, 200);
  assert.equal((retryA.body?.data.processed ?? 0) + (retryB.body?.data.processed ?? 0), 1);

  const runs = await requestJson<{ meta: { total: number }; data: Array<{ attemptNumber: number; status: string }> }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${jobId}/runs?page=1&limit=10`,
    headers: authHeader(token!)
  });

  assert.equal(runs.response.statusCode, 200);
  assert.equal(runs.body?.meta.total, 2);
  assert.deepEqual(
    runs.body?.data.map((run) => run.attemptNumber),
    [2, 1]
  );
  assert.equal(runs.body?.data[0]?.status, "FAILED");

  const jobAfter = await requestJson<{ data: { status: string } }>(app, {
    method: "GET",
    url: `/v1/automation/jobs/${jobId}`,
    headers: authHeader(token!)
  });

  assert.equal(jobAfter.response.statusCode, 200);
  assert.equal(jobAfter.body?.data.status, "DEAD_LETTER");
});

test("phase 11.1 automation hardening: background scheduler tick uses same due-processing path as manual endpoint", async () => {
  const previous = {
    enabled: process.env.AUTOMATION_SCHEDULER_ENABLED,
    intervalMs: process.env.AUTOMATION_SCHEDULER_INTERVAL_MS,
    batchLimit: process.env.AUTOMATION_SCHEDULER_BATCH_LIMIT,
    lockLeaseMs: process.env.AUTOMATION_SCHEDULER_LOCK_LEASE_MS
  };

  process.env.AUTOMATION_SCHEDULER_ENABLED = "true";
  process.env.AUTOMATION_SCHEDULER_INTERVAL_MS = "50";
  process.env.AUTOMATION_SCHEDULER_BATCH_LIMIT = "10";
  process.env.AUTOMATION_SCHEDULER_LOCK_LEASE_MS = "5000";

  const schedulerApp = await createTestApp();

  try {
    await resetDatabase();

    const password = "change-me-12345";
    const owner = await registerUser(schedulerApp, "automation-hardening-scheduler@local.dev", password);
    const token = owner.body?.data.token;
    assert.ok(token);

    const project = await requestJson<{ data: { id: string } }>(schedulerApp, {
      method: "POST",
      url: "/v1/projects",
      headers: authHeader(token!),
      payload: {
        name: "Scheduler Parity Project"
      }
    });

    assert.equal(project.response.statusCode, 201);
    const projectId = project.body?.data.id;
    assert.ok(projectId);

    const createJob = await requestJson<{ data: { id: string } }>(schedulerApp, {
      method: "POST",
      url: "/v1/automation/jobs",
      headers: authHeader(token!),
      payload: {
        projectId,
        name: "Scheduler-owned due job",
        type: "ANALYTICS_SNAPSHOT",
        cadence: "DAILY",
        runAtHour: 0,
        runAtMinute: 0,
        timezone: "UTC",
        config: {
          windowDays: 3
        },
        startAt: "2020-01-01T00:00:00.000Z"
      }
    });

    assert.equal(createJob.response.statusCode, 201);
    const jobId = createJob.body?.data.id;
    assert.ok(jobId);

    const runsAfterScheduler = await waitFor(
      async () =>
        requestJson<{ meta: { total: number }; data: Array<{ trigger: string; status: string }> }>(schedulerApp, {
          method: "GET",
          url: `/v1/automation/jobs/${jobId}/runs?page=1&limit=20`,
          headers: authHeader(token!)
        }),
      (result) => (result.body?.meta.total ?? 0) >= 1,
      6000,
      100
    );

    assert.equal(runsAfterScheduler.response.statusCode, 200);
    assert.equal(runsAfterScheduler.body?.meta.total, 1);
    assert.equal(runsAfterScheduler.body?.data[0]?.trigger, "SCHEDULED");
    assert.equal(runsAfterScheduler.body?.data[0]?.status, "SUCCESS");

    const processDueManual = await requestJson<{ data: { processed: number; remainingDue: number } }>(schedulerApp, {
      method: "POST",
      url: "/v1/automation/jobs/process-due",
      headers: authHeader(token!),
      payload: {
        now: new Date().toISOString(),
        limit: 10
      }
    });

    assert.equal(processDueManual.response.statusCode, 200);
    assert.equal(processDueManual.body?.data.processed, 0);
    assert.equal(processDueManual.body?.data.remainingDue, 0);
  } finally {
    await schedulerApp.close();

    if (previous.enabled === undefined) delete process.env.AUTOMATION_SCHEDULER_ENABLED;
    else process.env.AUTOMATION_SCHEDULER_ENABLED = previous.enabled;

    if (previous.intervalMs === undefined) delete process.env.AUTOMATION_SCHEDULER_INTERVAL_MS;
    else process.env.AUTOMATION_SCHEDULER_INTERVAL_MS = previous.intervalMs;

    if (previous.batchLimit === undefined) delete process.env.AUTOMATION_SCHEDULER_BATCH_LIMIT;
    else process.env.AUTOMATION_SCHEDULER_BATCH_LIMIT = previous.batchLimit;

    if (previous.lockLeaseMs === undefined) delete process.env.AUTOMATION_SCHEDULER_LOCK_LEASE_MS;
    else process.env.AUTOMATION_SCHEDULER_LOCK_LEASE_MS = previous.lockLeaseMs;
  }
});

test("phase 11.3 diagnostics history: persisted tick events are queryable with filters", async () => {
  const password = "change-me-12345";

  const owner = await registerUser(app, "automation-phase11-3-diagnostics@local.dev", password);
  const token = owner.body?.data.token;
  assert.ok(token);

  const now = new Date();
  const processedAt = new Date(now.getTime() - 120_000);
  const errorAt = new Date(now.getTime() - 30_000);

  await recordAutomationSchedulerTickEvent({
    at: processedAt.toISOString(),
    reason: "interval",
    outcome: "processed",
    durationMs: 145,
    processed: 3,
    remainingDue: 1,
    error: null
  });

  await recordAutomationSchedulerTickEvent({
    at: errorAt.toISOString(),
    reason: "startup",
    outcome: "error",
    durationMs: 25,
    processed: 0,
    remainingDue: 0,
    error: "diagnostics-test-error"
  });

  const processedHistory = await requestJson<{
    data: Array<{ outcome: string; processed: number; error: string | null; tickedAt: string }>;
    meta: { total: number };
  }>(app, {
    method: "GET",
    url: "/v1/automation/scheduler/diagnostics/history?page=1&limit=10&outcome=processed",
    headers: authHeader(token!)
  });

  assert.equal(processedHistory.response.statusCode, 200);
  assert.ok((processedHistory.body?.meta.total ?? 0) >= 1);
  assert.equal(processedHistory.body?.data[0]?.outcome, "processed");
  assert.ok((processedHistory.body?.data[0]?.processed ?? 0) >= 1);

  const rangedErrors = await requestJson<{
    data: Array<{ outcome: string; error: string | null; tickedAt: string }>;
    meta: { total: number };
  }>(app, {
    method: "GET",
    url: `/v1/automation/scheduler/diagnostics/history?page=1&limit=10&outcome=error&from=${encodeURIComponent(
      new Date(now.getTime() - 60_000).toISOString()
    )}&to=${encodeURIComponent(now.toISOString())}`,
    headers: authHeader(token!)
  });

  assert.equal(rangedErrors.response.statusCode, 200);
  assert.equal(rangedErrors.body?.meta.total, 1);
  assert.equal(rangedErrors.body?.data[0]?.outcome, "error");
  assert.equal(rangedErrors.body?.data[0]?.error, "diagnostics-test-error");
});

test("phase 11.3 DLQ operations: list/ack/requeue/retry-now enforce owner scope and idempotent semantics", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "automation-phase11-3-dlq-a@local.dev", password);
  const ownerB = await registerUser(app, "automation-phase11-3-dlq-b@local.dev", password);
  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;
  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "DLQ Ops Project A"
    }
  });

  const projectB = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenB!),
    payload: {
      name: "DLQ Ops Project B"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  assert.equal(projectB.response.statusCode, 201);

  const projectAId = projectA.body?.data.id;
  assert.ok(projectAId);

  const createDlqJobA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      name: "DLQ Job A",
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
      startAt: "2026-02-12T07:30:00.000Z"
    }
  });

  const createDlqJobB = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      name: "DLQ Job B",
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
      startAt: "2026-02-12T07:30:00.000Z"
    }
  });

  assert.equal(createDlqJobA.response.statusCode, 201);
  assert.equal(createDlqJobB.response.statusCode, 201);

  const dlqJobAId = createDlqJobA.body?.data.id;
  const dlqJobBId = createDlqJobB.body?.data.id;
  assert.ok(dlqJobAId);
  assert.ok(dlqJobBId);

  await prisma.scheduledJob.update({
    where: { id: dlqJobAId! },
    data: {
      config: {
        dataset: "BROKEN_DATASET"
      }
    }
  });

  await prisma.scheduledJob.update({
    where: { id: dlqJobBId! },
    data: {
      config: {
        dataset: "BROKEN_DATASET"
      }
    }
  });

  const deadLetter = await requestJson<{ data: { processed: number } }>(app, {
    method: "POST",
    url: "/v1/automation/jobs/process-due",
    headers: authHeader(tokenA!),
    payload: {
      now: "2026-02-12T08:05:00.000Z",
      limit: 10
    }
  });

  assert.equal(deadLetter.response.statusCode, 200);
  assert.equal(deadLetter.body?.data.processed, 2);

  const dlqJobsA = await requestJson<{ meta: { total: number }; data: Array<{ id: string }> }>(app, {
    method: "GET",
    url: "/v1/automation/dlq/jobs?page=1&limit=20",
    headers: authHeader(tokenA!)
  });

  const dlqJobsB = await requestJson<{ meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/automation/dlq/jobs?page=1&limit=20",
    headers: authHeader(tokenB!)
  });

  assert.equal(dlqJobsA.response.statusCode, 200);
  assert.equal(dlqJobsA.body?.meta.total, 2);
  assert.equal(dlqJobsB.response.statusCode, 200);
  assert.equal(dlqJobsB.body?.meta.total, 0);

  const crossOwnerAck = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: `/v1/automation/dlq/jobs/${dlqJobAId}/ack`,
    headers: authHeader(tokenB!),
    payload: {}
  });

  assert.equal(crossOwnerAck.response.statusCode, 404);
  assert.equal(crossOwnerAck.body?.error.code, "NOT_FOUND");

  const ackOnce = await requestJson<{ data: { alreadyAcknowledged: boolean } }>(app, {
    method: "POST",
    url: `/v1/automation/dlq/jobs/${dlqJobAId}/ack`,
    headers: authHeader(tokenA!),
    payload: {
      note: "Investigating"
    }
  });

  const ackAgain = await requestJson<{ data: { alreadyAcknowledged: boolean } }>(app, {
    method: "POST",
    url: `/v1/automation/dlq/jobs/${dlqJobAId}/ack`,
    headers: authHeader(tokenA!),
    payload: {}
  });

  assert.equal(ackOnce.response.statusCode, 200);
  assert.equal(ackOnce.body?.data.alreadyAcknowledged, false);
  assert.equal(ackAgain.response.statusCode, 200);
  assert.equal(ackAgain.body?.data.alreadyAcknowledged, true);

  const requeue = await requestJson<{ data: { alreadyRequeued: boolean; job: { status: string } } }>(app, {
    method: "POST",
    url: `/v1/automation/dlq/jobs/${dlqJobAId}/requeue`,
    headers: authHeader(tokenA!),
    payload: {
      recomputeFrom: "2026-02-12T09:00:00.000Z"
    }
  });

  assert.equal(requeue.response.statusCode, 200);
  assert.equal(requeue.body?.data.alreadyRequeued, false);
  assert.equal(requeue.body?.data.job.status, "ACTIVE");

  const patchSecondJobConfig = await requestJson<{ data: { id: string } }>(app, {
    method: "PATCH",
    url: `/v1/automation/jobs/${dlqJobBId}`,
    headers: authHeader(tokenA!),
    payload: {
      config: {
        dataset: "kpis",
        format: "json"
      },
      recomputeFrom: "2026-02-12T09:00:00.000Z"
    }
  });

  assert.equal(patchSecondJobConfig.response.statusCode, 200);

  const retryNow = await requestJson<{ data: { alreadyRetried: boolean; run: { status: string } } }>(app, {
    method: "POST",
    url: `/v1/automation/dlq/jobs/${dlqJobBId}/retry-now`,
    headers: authHeader(tokenA!),
    payload: {}
  });

  assert.equal(retryNow.response.statusCode, 200);
  assert.equal(retryNow.body?.data.alreadyRetried, false);
  assert.equal(retryNow.body?.data.run.status, "SUCCESS");

  const remainingDlq = await requestJson<{ meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/automation/dlq/jobs?page=1&limit=20",
    headers: authHeader(tokenA!)
  });

  assert.equal(remainingDlq.response.statusCode, 200);
  assert.equal(remainingDlq.body?.meta.total, 0);
});

test("phase 11.3 alerting hooks: threshold breaches persist alert events and support acknowledge flow", async () => {
  const previous = {
    deadLetter: process.env.AUTOMATION_ALERT_DEAD_LETTER_GROWTH_THRESHOLD,
    failureRate: process.env.AUTOMATION_ALERT_FAILURE_RATE_THRESHOLD_PCT,
    failureMinRuns: process.env.AUTOMATION_ALERT_FAILURE_RATE_MIN_RUNS,
    consecutive: process.env.AUTOMATION_ALERT_CONSECUTIVE_FAILURE_THRESHOLD,
    contention: process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD,
    contentionWindow: process.env.AUTOMATION_ALERT_CONTENTION_WINDOW_MINUTES,
    dedupeWindow: process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES
  };

  process.env.AUTOMATION_ALERT_DEAD_LETTER_GROWTH_THRESHOLD = "1";
  process.env.AUTOMATION_ALERT_FAILURE_RATE_THRESHOLD_PCT = "1";
  process.env.AUTOMATION_ALERT_FAILURE_RATE_MIN_RUNS = "1";
  process.env.AUTOMATION_ALERT_CONSECUTIVE_FAILURE_THRESHOLD = "1";
  process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD = "2";
  process.env.AUTOMATION_ALERT_CONTENTION_WINDOW_MINUTES = "60";
  process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES = "1";

  try {
    const password = "change-me-12345";

    const owner = await registerUser(app, "automation-phase11-3-alerts@local.dev", password);
    const token = owner.body?.data.token;
    assert.ok(token);

    const project = await requestJson<{ data: { id: string } }>(app, {
      method: "POST",
      url: "/v1/projects",
      headers: authHeader(token!),
      payload: {
        name: "Alert Threshold Project"
      }
    });

    assert.equal(project.response.statusCode, 201);
    const projectId = project.body?.data.id;
    assert.ok(projectId);

    const createJob = await requestJson<{ data: { id: string } }>(app, {
      method: "POST",
      url: "/v1/automation/jobs",
      headers: authHeader(token!),
      payload: {
        projectId,
        name: "Alert Trigger Job",
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
        startAt: "2026-02-12T07:30:00.000Z"
      }
    });

    assert.equal(createJob.response.statusCode, 201);
    const jobId = createJob.body?.data.id;
    assert.ok(jobId);

    await prisma.scheduledJob.update({
      where: { id: jobId! },
      data: {
        config: {
          dataset: "BROKEN_DATASET"
        }
      }
    });

    const failToDeadLetter = await requestJson<{ data: { processed: number } }>(app, {
      method: "POST",
      url: "/v1/automation/jobs/process-due",
      headers: authHeader(token!),
      payload: {
        now: "2026-02-12T08:05:00.000Z",
        limit: 10
      }
    });

    assert.equal(failToDeadLetter.response.statusCode, 200);
    assert.equal(failToDeadLetter.body?.data.processed, 1);

    const contentionAt = new Date();
    await recordAutomationSchedulerTickEvent({
      at: contentionAt.toISOString(),
      reason: "interval",
      outcome: "contention",
      durationMs: 5,
      processed: 0,
      remainingDue: 0,
      error: null
    });

    await recordAutomationSchedulerTickEvent({
      at: new Date(contentionAt.getTime() + 1000).toISOString(),
      reason: "interval",
      outcome: "contention",
      durationMs: 7,
      processed: 0,
      remainingDue: 0,
      error: null
    });

    const alerts = await requestJson<{
      data: Array<{ id: string; type: string; status: string }>;
      meta: { total: number };
    }>(app, {
      method: "GET",
      url: "/v1/automation/alerts?page=1&limit=50",
      headers: authHeader(token!)
    });

    assert.equal(alerts.response.statusCode, 200);
    assert.ok((alerts.body?.meta.total ?? 0) >= 4);

    const types = new Set((alerts.body?.data ?? []).map((alert) => alert.type));
    assert.equal(types.has("CONSECUTIVE_FAILURES"), true);
    assert.equal(types.has("FAILURE_RATE"), true);
    assert.equal(types.has("DEAD_LETTER_GROWTH"), true);
    assert.equal(types.has("LOCK_CONTENTION_SPIKE"), true);

    const firstOpenAlert = (alerts.body?.data ?? []).find((alert) => alert.status === "OPEN");
    assert.ok(firstOpenAlert);

    const ack = await requestJson<{ data: { id: string; status: string; acknowledgedAt: string | null } }>(app, {
      method: "POST",
      url: `/v1/automation/alerts/${firstOpenAlert!.id}/ack`,
      headers: authHeader(token!),
      payload: {
        note: "acked in test"
      }
    });

    assert.equal(ack.response.statusCode, 200);
    assert.equal(ack.body?.data.status, "ACKNOWLEDGED");
    assert.ok(ack.body?.data.acknowledgedAt);
  } finally {
    if (previous.deadLetter === undefined) delete process.env.AUTOMATION_ALERT_DEAD_LETTER_GROWTH_THRESHOLD;
    else process.env.AUTOMATION_ALERT_DEAD_LETTER_GROWTH_THRESHOLD = previous.deadLetter;

    if (previous.failureRate === undefined) delete process.env.AUTOMATION_ALERT_FAILURE_RATE_THRESHOLD_PCT;
    else process.env.AUTOMATION_ALERT_FAILURE_RATE_THRESHOLD_PCT = previous.failureRate;

    if (previous.failureMinRuns === undefined) delete process.env.AUTOMATION_ALERT_FAILURE_RATE_MIN_RUNS;
    else process.env.AUTOMATION_ALERT_FAILURE_RATE_MIN_RUNS = previous.failureMinRuns;

    if (previous.consecutive === undefined) delete process.env.AUTOMATION_ALERT_CONSECUTIVE_FAILURE_THRESHOLD;
    else process.env.AUTOMATION_ALERT_CONSECUTIVE_FAILURE_THRESHOLD = previous.consecutive;

    if (previous.contention === undefined) delete process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD;
    else process.env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD = previous.contention;

    if (previous.contentionWindow === undefined) delete process.env.AUTOMATION_ALERT_CONTENTION_WINDOW_MINUTES;
    else process.env.AUTOMATION_ALERT_CONTENTION_WINDOW_MINUTES = previous.contentionWindow;

    if (previous.dedupeWindow === undefined) delete process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES;
    else process.env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES = previous.dedupeWindow;
  }
});
