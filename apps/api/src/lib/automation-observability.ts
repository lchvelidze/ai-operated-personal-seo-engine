import {
  AutomationAlertSeverity,
  AutomationAlertStatus,
  AutomationAlertType,
  ScheduledJobStatus,
  JobStatus,
  Prisma
} from "@prisma/client";
import {
  createAutomationAlertNotifier,
  type AutomationAlertDeliveryAttempt
} from "./automation-alert-notifier.js";
import type { AutomationSchedulerTickEvent } from "./automation-scheduler-state.js";
import { prisma } from "./prisma.js";

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parsePositiveFloat(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type AutomationAlertThresholdConfig = {
  deadLetterGrowthThreshold: number;
  failureRateThresholdPct: number;
  failureRateMinRuns: number;
  consecutiveFailureThreshold: number;
  contentionSpikeThreshold: number;
  failureRateWindowMinutes: number;
  contentionWindowMinutes: number;
  dedupeWindowMinutes: number;
};

export function getAutomationAlertThresholdConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AutomationAlertThresholdConfig {
  return {
    deadLetterGrowthThreshold: parsePositiveInt(env.AUTOMATION_ALERT_DEAD_LETTER_GROWTH_THRESHOLD, 1),
    failureRateThresholdPct: parsePositiveFloat(env.AUTOMATION_ALERT_FAILURE_RATE_THRESHOLD_PCT, 50),
    failureRateMinRuns: parsePositiveInt(env.AUTOMATION_ALERT_FAILURE_RATE_MIN_RUNS, 5),
    consecutiveFailureThreshold: parsePositiveInt(env.AUTOMATION_ALERT_CONSECUTIVE_FAILURE_THRESHOLD, 3),
    contentionSpikeThreshold: parsePositiveInt(env.AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD, 3),
    failureRateWindowMinutes: parsePositiveInt(env.AUTOMATION_ALERT_FAILURE_RATE_WINDOW_MINUTES, 60),
    contentionWindowMinutes: parsePositiveInt(env.AUTOMATION_ALERT_CONTENTION_WINDOW_MINUTES, 60),
    dedupeWindowMinutes: parsePositiveInt(env.AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES, 30)
  };
}

function withDateOffset(base: Date, minutes: number) {
  return new Date(base.getTime() - minutes * 60_000);
}

type AlertDeliveryStatus = "SENT" | "FAILED" | "SKIPPED";

export type AlertDeliverySnapshot = {
  provider: string;
  status: AlertDeliveryStatus;
  attemptedAt: string | null;
  lastError: string | null;
  responseStatus: number | null;
  attemptCount: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
};

export function readAlertDeliverySnapshot(metadata: Prisma.JsonValue | null): AlertDeliverySnapshot | null {
  if (!isRecord(metadata) || !isRecord(metadata.delivery)) {
    return null;
  }

  const delivery = metadata.delivery;
  const statusRaw = delivery.status;
  const status: AlertDeliveryStatus | null =
    statusRaw === "SENT" || statusRaw === "FAILED" || statusRaw === "SKIPPED" ? statusRaw : null;

  if (!status) {
    return null;
  }

  const provider = typeof delivery.provider === "string" && delivery.provider ? delivery.provider : "unknown";

  const numberOrFallback = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return {
    provider,
    status,
    attemptedAt: typeof delivery.attemptedAt === "string" ? delivery.attemptedAt : null,
    lastError: typeof delivery.lastError === "string" ? delivery.lastError : null,
    responseStatus:
      typeof delivery.responseStatus === "number" && Number.isFinite(delivery.responseStatus)
        ? delivery.responseStatus
        : null,
    attemptCount: Math.max(0, Math.floor(numberOrFallback(delivery.attemptCount, 0))),
    successCount: Math.max(0, Math.floor(numberOrFallback(delivery.successCount, 0))),
    failureCount: Math.max(0, Math.floor(numberOrFallback(delivery.failureCount, 0))),
    skippedCount: Math.max(0, Math.floor(numberOrFallback(delivery.skippedCount, 0)))
  };
}

function mergeDeliveryMetadata(metadata: Prisma.JsonValue | null, attempt: AutomationAlertDeliveryAttempt) {
  const base = isRecord(metadata) ? { ...metadata } : {};
  const existingSnapshot = readAlertDeliverySnapshot(metadata);

  const nextAttemptCount = (existingSnapshot?.attemptCount ?? 0) + 1;
  const nextSuccessCount = (existingSnapshot?.successCount ?? 0) + (attempt.status === "SENT" ? 1 : 0);
  const nextFailureCount = (existingSnapshot?.failureCount ?? 0) + (attempt.status === "FAILED" ? 1 : 0);
  const nextSkippedCount = (existingSnapshot?.skippedCount ?? 0) + (attempt.status === "SKIPPED" ? 1 : 0);

  base.delivery = {
    provider: attempt.provider,
    status: attempt.status,
    attemptedAt: attempt.attemptedAt,
    responseStatus: attempt.responseStatus,
    lastError: attempt.error,
    attemptCount: nextAttemptCount,
    successCount: nextSuccessCount,
    failureCount: nextFailureCount,
    skippedCount: nextSkippedCount
  };

  return base as Prisma.InputJsonObject;
}

async function createAlertIfNeeded(params: {
  ownerId: string | null;
  projectId?: string;
  scheduledJobId?: string;
  jobRunId?: string;
  type: AutomationAlertType;
  severity: AutomationAlertSeverity;
  title: string;
  message: string;
  thresholdValue?: number;
  observedValue?: number;
  dedupeKey: string;
  metadata?: Prisma.InputJsonValue;
  now?: Date;
}) {
  const config = getAutomationAlertThresholdConfigFromEnv();
  const now = params.now ?? new Date();
  const dedupeFrom = withDateOffset(now, config.dedupeWindowMinutes);

  const existing = await prisma.automationAlertEvent.findFirst({
    where: {
      ownerId: params.ownerId,
      type: params.type,
      dedupeKey: params.dedupeKey,
      status: AutomationAlertStatus.OPEN,
      createdAt: {
        gte: dedupeFrom
      }
    },
    orderBy: [{ createdAt: "desc" }]
  });

  if (existing) {
    return existing;
  }

  const created = await prisma.automationAlertEvent.create({
    data: {
      ownerId: params.ownerId,
      projectId: params.projectId,
      scheduledJobId: params.scheduledJobId,
      jobRunId: params.jobRunId,
      type: params.type,
      severity: params.severity,
      status: AutomationAlertStatus.OPEN,
      title: params.title,
      message: params.message,
      thresholdValue: params.thresholdValue,
      observedValue: params.observedValue,
      dedupeKey: params.dedupeKey,
      metadata: params.metadata
    }
  });

  const notifier = createAutomationAlertNotifier();

  try {
    const attempt = await notifier.notify({
      id: created.id,
      ownerId: created.ownerId,
      projectId: created.projectId,
      scheduledJobId: created.scheduledJobId,
      jobRunId: created.jobRunId,
      type: created.type,
      severity: created.severity,
      status: created.status,
      title: created.title,
      message: created.message,
      thresholdValue: created.thresholdValue,
      observedValue: created.observedValue,
      metadata: created.metadata,
      createdAt: created.createdAt.toISOString()
    });

    const updated = await prisma.automationAlertEvent.update({
      where: {
        id: created.id
      },
      data: {
        metadata: mergeDeliveryMetadata(created.metadata, attempt)
      }
    });

    return updated;
  } catch {
    // Outbound delivery is best-effort and must not fail alert persistence.
    return created;
  }
}

export async function recordAutomationSchedulerTickEvent(event: AutomationSchedulerTickEvent) {
  const tickedAt = new Date(event.at);

  await prisma.automationSchedulerTickEvent.create({
    data: {
      reason: event.reason,
      outcome: event.outcome,
      durationMs: event.durationMs,
      processed: event.processed,
      remainingDue: event.remainingDue,
      errorSummary: event.error,
      isContention: event.outcome === "contention",
      isOverlapSkip: event.outcome === "skipped-overlap",
      tickedAt
    }
  });

  if (event.outcome !== "contention") {
    return;
  }

  const config = getAutomationAlertThresholdConfigFromEnv();
  const windowStart = withDateOffset(tickedAt, config.contentionWindowMinutes);
  const contentionCount = await prisma.automationSchedulerTickEvent.count({
    where: {
      outcome: "contention",
      tickedAt: {
        gte: windowStart
      }
    }
  });

  if (contentionCount < config.contentionSpikeThreshold) {
    return;
  }

  await createAlertIfNeeded({
    ownerId: null,
    type: AutomationAlertType.LOCK_CONTENTION_SPIKE,
    severity: AutomationAlertSeverity.WARNING,
    title: "Scheduler lock contention spike",
    message: `Detected ${contentionCount} contention ticks within the last ${config.contentionWindowMinutes} minute(s).`,
    thresholdValue: config.contentionSpikeThreshold,
    observedValue: contentionCount,
    dedupeKey: "global:lock-contention-spike",
    metadata: {
      windowMinutes: config.contentionWindowMinutes,
      contentionCount
    },
    now: tickedAt
  });
}

export async function evaluateAutomationFailureAlerts(params: {
  ownerId: string;
  projectId: string;
  scheduledJobId: string;
  jobRunId: string;
  consecutiveFailures: number;
  deadLettered: boolean;
  finishedAt?: Date;
}) {
  const config = getAutomationAlertThresholdConfigFromEnv();
  const finishedAt = params.finishedAt ?? new Date();

  if (params.consecutiveFailures >= config.consecutiveFailureThreshold) {
    await createAlertIfNeeded({
      ownerId: params.ownerId,
      projectId: params.projectId,
      scheduledJobId: params.scheduledJobId,
      jobRunId: params.jobRunId,
      type: AutomationAlertType.CONSECUTIVE_FAILURES,
      severity: AutomationAlertSeverity.WARNING,
      title: "Consecutive automation failures threshold exceeded",
      message: `Job has failed ${params.consecutiveFailures} consecutive time(s).`,
      thresholdValue: config.consecutiveFailureThreshold,
      observedValue: params.consecutiveFailures,
      dedupeKey: `owner:${params.ownerId}:consecutive-failures:${params.scheduledJobId}`,
      metadata: {
        consecutiveFailures: params.consecutiveFailures
      },
      now: finishedAt
    });
  }

  const failureRateWindowStart = withDateOffset(finishedAt, config.failureRateWindowMinutes);
  const [totalRuns, failedRuns] = await prisma.$transaction([
    prisma.jobRun.count({
      where: {
        status: {
          in: [JobStatus.SUCCESS, JobStatus.FAILED]
        },
        createdAt: {
          gte: failureRateWindowStart
        },
        project: {
          ownerId: params.ownerId
        }
      }
    }),
    prisma.jobRun.count({
      where: {
        status: JobStatus.FAILED,
        createdAt: {
          gte: failureRateWindowStart
        },
        project: {
          ownerId: params.ownerId
        }
      }
    })
  ]);

  if (totalRuns >= config.failureRateMinRuns) {
    const failureRatePct = totalRuns === 0 ? 0 : (failedRuns / totalRuns) * 100;

    if (failureRatePct >= config.failureRateThresholdPct) {
      await createAlertIfNeeded({
        ownerId: params.ownerId,
        projectId: params.projectId,
        scheduledJobId: params.scheduledJobId,
        jobRunId: params.jobRunId,
        type: AutomationAlertType.FAILURE_RATE,
        severity: AutomationAlertSeverity.WARNING,
        title: "Automation failure-rate threshold exceeded",
        message: `Failure rate is ${Math.round(failureRatePct * 100) / 100}% over the last ${config.failureRateWindowMinutes} minute(s).`,
        thresholdValue: config.failureRateThresholdPct,
        observedValue: Math.round(failureRatePct * 100) / 100,
        dedupeKey: `owner:${params.ownerId}:failure-rate`,
        metadata: {
          totalRuns,
          failedRuns,
          windowMinutes: config.failureRateWindowMinutes
        },
        now: finishedAt
      });
    }
  }

  if (!params.deadLettered) {
    return;
  }

  const deadLetterCount = await prisma.scheduledJob.count({
    where: {
      status: ScheduledJobStatus.DEAD_LETTER,
      project: {
        ownerId: params.ownerId
      }
    }
  });

  if (deadLetterCount < config.deadLetterGrowthThreshold) {
    return;
  }

  await createAlertIfNeeded({
    ownerId: params.ownerId,
    projectId: params.projectId,
    scheduledJobId: params.scheduledJobId,
    jobRunId: params.jobRunId,
    type: AutomationAlertType.DEAD_LETTER_GROWTH,
    severity: AutomationAlertSeverity.CRITICAL,
    title: "Dead-letter queue growth threshold exceeded",
    message: `Owner has ${deadLetterCount} dead-letter automation job(s).`,
    thresholdValue: config.deadLetterGrowthThreshold,
    observedValue: deadLetterCount,
    dedupeKey: `owner:${params.ownerId}:dead-letter-growth`,
    metadata: {
      deadLetterCount
    },
    now: finishedAt
  });
}
