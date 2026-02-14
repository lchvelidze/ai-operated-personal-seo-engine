export const AUTOMATION_SCHEDULER_LOCK_NAME = "phase11.automation.scheduler";

export type SchedulerTickReason = "startup" | "interval";
export type SchedulerTickOutcome = "processed" | "idle" | "contention" | "error" | "skipped-overlap";

export type AutomationSchedulerTickEvent = {
  at: string;
  reason: SchedulerTickReason;
  outcome: SchedulerTickOutcome;
  durationMs: number;
  processed: number;
  remainingDue: number;
  error: string | null;
};

export type AutomationSchedulerRuntimeState = {
  enabled: boolean;
  intervalMs: number;
  batchLimit: number;
  lockLeaseMs: number;
  startedAt: string | null;
  stoppedAt: string | null;
  runningTick: boolean;
  lastTickAt: string | null;
  lastTickReason: SchedulerTickReason | null;
  lastTickOutcome: SchedulerTickOutcome | null;
  lastTickDurationMs: number | null;
  lastTickError: string | null;
  overlapSkips: number;
  contentionCount: number;
  totalTicks: number;
  successfulTicks: number;
  failedTicks: number;
  totalRunsProcessed: number;
  recentTicks: AutomationSchedulerTickEvent[];
};

const MAX_RECENT_TICKS = 20;

const runtimeState: AutomationSchedulerRuntimeState = {
  enabled: false,
  intervalMs: 30_000,
  batchLimit: 10,
  lockLeaseMs: 120_000,
  startedAt: null,
  stoppedAt: null,
  runningTick: false,
  lastTickAt: null,
  lastTickReason: null,
  lastTickOutcome: null,
  lastTickDurationMs: null,
  lastTickError: null,
  overlapSkips: 0,
  contentionCount: 0,
  totalTicks: 0,
  successfulTicks: 0,
  failedTicks: 0,
  totalRunsProcessed: 0,
  recentTicks: []
};

function pushTick(event: AutomationSchedulerTickEvent) {
  runtimeState.recentTicks.unshift(event);
  if (runtimeState.recentTicks.length > MAX_RECENT_TICKS) {
    runtimeState.recentTicks.length = MAX_RECENT_TICKS;
  }
}

export function setAutomationSchedulerRuntimeConfig(config: {
  enabled: boolean;
  intervalMs: number;
  batchLimit: number;
  lockLeaseMs: number;
}) {
  runtimeState.enabled = config.enabled;
  runtimeState.intervalMs = config.intervalMs;
  runtimeState.batchLimit = config.batchLimit;
  runtimeState.lockLeaseMs = config.lockLeaseMs;
}

export function markAutomationSchedulerStarted() {
  runtimeState.startedAt = new Date().toISOString();
  runtimeState.stoppedAt = null;
}

export function markAutomationSchedulerStopped() {
  runtimeState.stoppedAt = new Date().toISOString();
  runtimeState.runningTick = false;
}

export function markAutomationSchedulerTickOverlapSkip(reason: SchedulerTickReason) {
  runtimeState.overlapSkips += 1;

  const now = new Date();
  const event: AutomationSchedulerTickEvent = {
    at: now.toISOString(),
    reason,
    outcome: "skipped-overlap",
    durationMs: 0,
    processed: 0,
    remainingDue: 0,
    error: null
  };

  runtimeState.lastTickAt = event.at;
  runtimeState.lastTickReason = reason;
  runtimeState.lastTickOutcome = event.outcome;
  runtimeState.lastTickDurationMs = 0;
  runtimeState.lastTickError = null;
  pushTick(event);

  return event;
}

export function markAutomationSchedulerTickStart() {
  runtimeState.runningTick = true;
}

function markAutomationSchedulerTickEnd(event: AutomationSchedulerTickEvent) {
  runtimeState.runningTick = false;
  runtimeState.totalTicks += 1;
  runtimeState.lastTickAt = event.at;
  runtimeState.lastTickReason = event.reason;
  runtimeState.lastTickOutcome = event.outcome;
  runtimeState.lastTickDurationMs = event.durationMs;
  runtimeState.lastTickError = event.error;

  if (event.outcome === "error") {
    runtimeState.failedTicks += 1;
  } else {
    runtimeState.successfulTicks += 1;
  }

  runtimeState.totalRunsProcessed += event.processed;

  pushTick(event);

  return event;
}

export function markAutomationSchedulerTickContention(reason: SchedulerTickReason, startedAt: Date, finishedAt = new Date()) {
  runtimeState.contentionCount += 1;

  const event: AutomationSchedulerTickEvent = {
    at: finishedAt.toISOString(),
    reason,
    outcome: "contention",
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    processed: 0,
    remainingDue: 0,
    error: null
  };

  return markAutomationSchedulerTickEnd(event);
}

export function markAutomationSchedulerTickSuccess(params: {
  reason: SchedulerTickReason;
  startedAt: Date;
  finishedAt?: Date;
  processed: number;
  remainingDue: number;
}) {
  const finishedAt = params.finishedAt ?? new Date();

  const event: AutomationSchedulerTickEvent = {
    at: finishedAt.toISOString(),
    reason: params.reason,
    outcome: params.processed > 0 ? "processed" : "idle",
    durationMs: finishedAt.getTime() - params.startedAt.getTime(),
    processed: params.processed,
    remainingDue: params.remainingDue,
    error: null
  };

  return markAutomationSchedulerTickEnd(event);
}

export function markAutomationSchedulerTickError(params: {
  reason: SchedulerTickReason;
  startedAt: Date;
  finishedAt?: Date;
  error: string;
}) {
  const finishedAt = params.finishedAt ?? new Date();

  const event: AutomationSchedulerTickEvent = {
    at: finishedAt.toISOString(),
    reason: params.reason,
    outcome: "error",
    durationMs: finishedAt.getTime() - params.startedAt.getTime(),
    processed: 0,
    remainingDue: 0,
    error: params.error
  };

  return markAutomationSchedulerTickEnd(event);
}

export function getAutomationSchedulerRuntimeState(): AutomationSchedulerRuntimeState {
  return {
    ...runtimeState,
    recentTicks: runtimeState.recentTicks.map((tick) => ({ ...tick }))
  };
}
