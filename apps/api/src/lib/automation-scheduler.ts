import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "./prisma.js";
import {
  AUTOMATION_SCHEDULER_LOCK_NAME,
  markAutomationSchedulerStarted,
  markAutomationSchedulerStopped,
  markAutomationSchedulerTickContention,
  markAutomationSchedulerTickError,
  markAutomationSchedulerTickOverlapSkip,
  markAutomationSchedulerTickStart,
  markAutomationSchedulerTickSuccess,
  type SchedulerTickReason,
  setAutomationSchedulerRuntimeConfig
} from "./automation-scheduler-state.js";
import { recordAutomationSchedulerTickEvent } from "./automation-observability.js";
import { processDueAutomationJobs } from "../routes/v1.phase11.js";

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseEnabled(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export type AutomationSchedulerConfig = {
  enabled: boolean;
  intervalMs: number;
  batchLimit: number;
  lockLeaseMs: number;
};

export function getAutomationSchedulerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AutomationSchedulerConfig {
  const enabledByDefault = env.NODE_ENV !== "test";
  const intervalMs = parsePositiveInt(env.AUTOMATION_SCHEDULER_INTERVAL_MS, 30_000);

  return {
    enabled: parseEnabled(env.AUTOMATION_SCHEDULER_ENABLED, enabledByDefault),
    intervalMs,
    batchLimit: parsePositiveInt(env.AUTOMATION_SCHEDULER_BATCH_LIMIT, 10),
    lockLeaseMs: parsePositiveInt(env.AUTOMATION_SCHEDULER_LOCK_LEASE_MS, Math.max(120_000, intervalMs * 4))
  };
}

type SchedulerLease = {
  token: string;
  name: string;
};

async function acquireLease(name: string, leaseMs: number): Promise<SchedulerLease | null> {
  const token = randomUUID();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + leaseMs);

  await prisma.schedulerLock.upsert({
    where: { name },
    create: { name },
    update: {}
  });

  const claimed = await prisma.schedulerLock.updateMany({
    where: {
      name,
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }, { ownerToken: token }]
    },
    data: {
      ownerToken: token,
      lockedUntil
    }
  });

  if (claimed.count !== 1) {
    return null;
  }

  return {
    token,
    name
  };
}

async function releaseLease(lease: SchedulerLease | null) {
  if (!lease) {
    return;
  }

  await prisma.schedulerLock.updateMany({
    where: {
      name: lease.name,
      ownerToken: lease.token
    },
    data: {
      ownerToken: null,
      lockedUntil: null
    }
  });
}

export function createAutomationScheduler(logger: FastifyBaseLogger, config = getAutomationSchedulerConfigFromEnv()) {
  let timer: NodeJS.Timeout | null = null;
  let runningTick: Promise<void> | null = null;

  setAutomationSchedulerRuntimeConfig(config);

  const persistTickEvent = async (event: ReturnType<typeof markAutomationSchedulerTickSuccess>) => {
    try {
      await recordAutomationSchedulerTickEvent(event);
    } catch (error) {
      logger.error({ err: error, event }, "failed to persist automation scheduler tick event");
    }
  };

  const runTick = async (reason: SchedulerTickReason) => {
    if (runningTick) {
      const event = markAutomationSchedulerTickOverlapSkip(reason);
      await persistTickEvent(event);
      return;
    }

    const tickStartedAt = new Date();
    markAutomationSchedulerTickStart();

    runningTick = (async () => {
      const lease = await acquireLease(AUTOMATION_SCHEDULER_LOCK_NAME, config.lockLeaseMs);
      if (!lease) {
        const event = markAutomationSchedulerTickContention(reason, tickStartedAt);
        await persistTickEvent(event);
        return;
      }

      try {
        const now = new Date();
        const result = await processDueAutomationJobs({
          runRequestedAt: now,
          limit: config.batchLimit
        });

        if (result.runs.length > 0) {
          logger.info(
            {
              reason,
              processed: result.runs.length,
              remainingDue: result.remainingDue,
              at: now.toISOString()
            },
            "automation scheduler tick processed due jobs"
          );
        }

        const event = markAutomationSchedulerTickSuccess({
          reason,
          startedAt: tickStartedAt,
          finishedAt: new Date(),
          processed: result.runs.length,
          remainingDue: result.remainingDue
        });
        await persistTickEvent(event);
      } catch (error) {
        logger.error({ err: error, reason }, "automation scheduler tick failed");
        const event = markAutomationSchedulerTickError({
          reason,
          startedAt: tickStartedAt,
          finishedAt: new Date(),
          error: error instanceof Error ? error.message : "Unknown scheduler error"
        });
        await persistTickEvent(event);
      } finally {
        await releaseLease(lease);
      }
    })().finally(() => {
      runningTick = null;
    });

    await runningTick;
  };

  const start = () => {
    if (!config.enabled) {
      logger.info({ config }, "automation scheduler disabled");
      return;
    }

    if (timer) {
      return;
    }

    logger.info({ config }, "automation scheduler starting");
    markAutomationSchedulerStarted();

    timer = setInterval(() => {
      void runTick("interval");
    }, config.intervalMs);
    timer.unref?.();

    void runTick("startup");
  };

  const stop = async () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (runningTick) {
      await runningTick;
    }

    markAutomationSchedulerStopped();
  };

  return {
    config,
    start,
    stop,
    runTick
  };
}
