import {
  AutomationAlertStatus,
  AutomationAlertType,
  AutomationDlqAction,
  JobStatus,
  JobTrigger,
  JobType,
  LinkStatus,
  OutreachStatus,
  Prisma,
  ScheduledJobCadence,
  ScheduledJobCatchUpMode,
  ScheduledJobDstAmbiguousPolicy,
  ScheduledJobDstInvalidPolicy,
  ScheduledJobStatus,
  TaskStatus
} from "@prisma/client";
import { FastifyInstance, FastifyReply } from "fastify";
import { AUTOMATION_SCHEDULER_LOCK_NAME, getAutomationSchedulerRuntimeState } from "../lib/automation-scheduler-state.js";
import { evaluateAutomationFailureAlerts, readAlertDeliverySnapshot } from "../lib/automation-observability.js";
import { prisma } from "../lib/prisma.js";
import { requireAuthUser } from "../lib/request-auth.js";

type AutomationJobParams = {
  id: string;
};

type AutomationJobType = "ANALYTICS_SNAPSHOT" | "ANALYTICS_EXPORT";
type ExportDataset = "kpis" | "contentTasks" | "backlinkOpportunities" | "internalLinks";
type ExportFormat = "json" | "csv";
type CatchUpModeInput = "skip-missed" | "replay-missed";
type DstAmbiguousTimePolicyInput = "earlier-offset" | "later-offset";
type DstInvalidTimePolicyInput = "shift-forward" | "skip";

type AutomationJobConfig = {
  windowDays?: number;
  from?: string;
  to?: string;
  dataset?: ExportDataset;
  format?: ExportFormat;
  limit?: number;
  contentTaskStatus?: TaskStatus;
  outreachStatus?: OutreachStatus;
  linkStatus?: LinkStatus;
};

type CreateAutomationJobBody = {
  projectId: string;
  name: string;
  type: AutomationJobType;
  cadence: ScheduledJobCadence;
  dayOfWeek?: number;
  runAtHour?: number;
  runAtMinute?: number;
  timezone?: string;
  status?: ScheduledJobStatus;
  catchUpMode?: CatchUpModeInput;
  dstAmbiguousTimePolicy?: DstAmbiguousTimePolicyInput;
  dstInvalidTimePolicy?: DstInvalidTimePolicyInput;
  retryMaxAttempts?: number;
  retryBackoffSeconds?: number;
  retryMaxBackoffSeconds?: number;
  config?: Record<string, unknown> | null;
  startAt?: string;
};

type UpdateAutomationJobBody = {
  name?: string;
  type?: AutomationJobType;
  cadence?: ScheduledJobCadence;
  dayOfWeek?: number | null;
  runAtHour?: number;
  runAtMinute?: number;
  timezone?: string;
  status?: ScheduledJobStatus;
  catchUpMode?: CatchUpModeInput;
  dstAmbiguousTimePolicy?: DstAmbiguousTimePolicyInput;
  dstInvalidTimePolicy?: DstInvalidTimePolicyInput;
  retryMaxAttempts?: number;
  retryBackoffSeconds?: number;
  retryMaxBackoffSeconds?: number;
  config?: Record<string, unknown> | null;
  recomputeFrom?: string;
};

type ListAutomationJobsQuery = {
  page?: number;
  limit?: number;
  projectId?: string;
  status?: ScheduledJobStatus;
  cadence?: ScheduledJobCadence;
  type?: AutomationJobType;
};

type ListAutomationJobRunsQuery = {
  page?: number;
  limit?: number;
};

type ProcessDueJobsBody = {
  now?: string;
  limit?: number;
};

type ListSchedulerDiagnosticsHistoryQuery = {
  page?: number;
  limit?: number;
  reason?: "startup" | "interval";
  outcome?: "processed" | "idle" | "contention" | "error" | "skipped-overlap";
  from?: string;
  to?: string;
  contentionOnly?: boolean;
  overlapOnly?: boolean;
};

type ListDlqJobsQuery = {
  page?: number;
  limit?: number;
  projectId?: string;
  acknowledged?: boolean;
};

type ListDlqRunsQuery = {
  page?: number;
  limit?: number;
  projectId?: string;
  jobId?: string;
};

type DlqJobActionParams = {
  id: string;
};

type DlqAcknowledgeBody = {
  note?: string;
};

type DlqRequeueBody = {
  recomputeFrom?: string;
  note?: string;
};

type DlqRetryNowBody = {
  note?: string;
};

type DlqBulkActionBody = {
  jobIds: string[];
  note?: string;
  recomputeFrom?: string;
};

type DlqBulkAction = "ack" | "requeue" | "retry-now";

type DlqBulkActionResultItem = {
  jobId: string;
  ok: boolean;
  alreadyAcknowledged?: boolean;
  alreadyRequeued?: boolean;
  alreadyRetried?: boolean;
  job?: Record<string, unknown>;
  run?: Record<string, unknown> | null;
  code?: "NOT_FOUND" | "INVALID_STATUS" | "DUPLICATE_JOB_ID" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
  message?: string;
};

type ListAutomationAlertsQuery = {
  page?: number;
  limit?: number;
  status?: AutomationAlertStatus;
  type?: AutomationAlertType;
  from?: string;
  to?: string;
};

type AutomationAlertParams = {
  id: string;
};

type AckAutomationAlertBody = {
  note?: string;
};

const automationJobProjectSelect = {
  id: true,
  ownerId: true,
  name: true,
  slug: true,
  timezone: true
} as const;

type ScheduledJobWithProject = Prisma.ScheduledJobGetPayload<{
  include: {
    project: {
      select: typeof automationJobProjectSelect;
    };
  };
}>;

const jobRunInclude = {
  project: {
    select: {
      id: true,
      name: true,
      slug: true
    }
  },
  scheduledJob: {
    select: {
      id: true,
      name: true,
      cadence: true,
      status: true
    }
  }
} as const;

type JobRunWithRelations = Prisma.JobRunGetPayload<{
  include: typeof jobRunInclude;
}>;

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.status(statusCode).send({
    error: {
      code,
      message
    }
  });
}

function parseDateInput(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function buildDateRangeFilter(from: Date | null, to: Date | null): Prisma.DateTimeFilter | undefined {
  if (!from && !to) {
    return undefined;
  }

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAutomationJobType(value: string): AutomationJobType | null {
  if (value === JobType.ANALYTICS_SNAPSHOT || value === JobType.ANALYTICS_EXPORT) {
    return value;
  }

  return null;
}

function normalizeJobConfig(type: AutomationJobType, input: unknown): { config: AutomationJobConfig | null; error: string | null } {
  if (input === undefined || input === null) {
    return { config: null, error: null };
  }

  if (!isRecord(input)) {
    return { config: null, error: "config must be an object" };
  }

  const config: AutomationJobConfig = {};

  if (input.windowDays !== undefined) {
    if (!Number.isInteger(input.windowDays) || Number(input.windowDays) < 1 || Number(input.windowDays) > 365) {
      return { config: null, error: "config.windowDays must be an integer between 1 and 365" };
    }

    config.windowDays = Number(input.windowDays);
  }

  if (input.from !== undefined) {
    if (typeof input.from !== "string" || !parseDateInput(input.from)) {
      return { config: null, error: "config.from must be a valid ISO date-time string" };
    }

    config.from = input.from;
  }

  if (input.to !== undefined) {
    if (typeof input.to !== "string" || !parseDateInput(input.to)) {
      return { config: null, error: "config.to must be a valid ISO date-time string" };
    }

    config.to = input.to;
  }

  if (config.from && config.to) {
    const from = parseDateInput(config.from);
    const to = parseDateInput(config.to);

    if (!from || !to || from.getTime() > to.getTime()) {
      return { config: null, error: "config.from must be <= config.to" };
    }
  }

  if (input.dataset !== undefined) {
    if (
      input.dataset !== "kpis" &&
      input.dataset !== "contentTasks" &&
      input.dataset !== "backlinkOpportunities" &&
      input.dataset !== "internalLinks"
    ) {
      return { config: null, error: "config.dataset must be one of kpis/contentTasks/backlinkOpportunities/internalLinks" };
    }

    config.dataset = input.dataset;
  }

  if (input.format !== undefined) {
    if (input.format !== "json" && input.format !== "csv") {
      return { config: null, error: "config.format must be one of json/csv" };
    }

    config.format = input.format;
  }

  if (input.limit !== undefined) {
    if (!Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 500) {
      return { config: null, error: "config.limit must be an integer between 1 and 500" };
    }

    config.limit = Number(input.limit);
  }

  if (input.contentTaskStatus !== undefined) {
    if (!Object.values(TaskStatus).includes(input.contentTaskStatus as TaskStatus)) {
      return { config: null, error: "config.contentTaskStatus is invalid" };
    }

    config.contentTaskStatus = input.contentTaskStatus as TaskStatus;
  }

  if (input.outreachStatus !== undefined) {
    if (!Object.values(OutreachStatus).includes(input.outreachStatus as OutreachStatus)) {
      return { config: null, error: "config.outreachStatus is invalid" };
    }

    config.outreachStatus = input.outreachStatus as OutreachStatus;
  }

  if (input.linkStatus !== undefined) {
    if (!Object.values(LinkStatus).includes(input.linkStatus as LinkStatus)) {
      return { config: null, error: "config.linkStatus is invalid" };
    }

    config.linkStatus = input.linkStatus as LinkStatus;
  }

  if (type === JobType.ANALYTICS_SNAPSHOT) {
    if (config.dataset || config.format || config.limit || config.contentTaskStatus || config.outreachStatus || config.linkStatus) {
      return { config: null, error: "snapshot jobs only support config.windowDays/config.from/config.to" };
    }
  }

  if (type === JobType.ANALYTICS_EXPORT) {
    const dataset = config.dataset ?? "kpis";

    if (config.contentTaskStatus && dataset !== "contentTasks") {
      return { config: null, error: "config.contentTaskStatus is only valid for dataset=contentTasks" };
    }

    if (config.outreachStatus && dataset !== "backlinkOpportunities") {
      return { config: null, error: "config.outreachStatus is only valid for dataset=backlinkOpportunities" };
    }

    if (config.linkStatus && dataset !== "internalLinks") {
      return { config: null, error: "config.linkStatus is only valid for dataset=internalLinks" };
    }
  }

  return {
    config: Object.keys(config).length === 0 ? null : config,
    error: null
  };
}

function readStoredConfig(type: AutomationJobType, raw: Prisma.JsonValue | null): AutomationJobConfig {
  const normalized = normalizeJobConfig(type, raw);

  if (normalized.error) {
    throw new Error(`Stored automation config is invalid: ${normalized.error}`);
  }

  return normalized.config ?? {};
}

function normalizeDayOfWeek(raw: number | null | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  if (!Number.isInteger(raw)) return null;
  if (raw < 0 || raw > 6) return null;
  return raw;
}

function normalizeCatchUpMode(value: unknown): ScheduledJobCatchUpMode | null {
  if (value === undefined || value === null) {
    return ScheduledJobCatchUpMode.SKIP_MISSED;
  }

  if (value === "skip-missed") {
    return ScheduledJobCatchUpMode.SKIP_MISSED;
  }

  if (value === "replay-missed") {
    return ScheduledJobCatchUpMode.REPLAY_MISSED;
  }

  return null;
}

function toCatchUpModeResponse(value: ScheduledJobCatchUpMode) {
  return value === ScheduledJobCatchUpMode.REPLAY_MISSED ? "replay-missed" : "skip-missed";
}

function normalizeDstAmbiguousTimePolicy(value: unknown): ScheduledJobDstAmbiguousPolicy | null {
  if (value === undefined || value === null) {
    return ScheduledJobDstAmbiguousPolicy.EARLIER_OFFSET;
  }

  if (value === "earlier-offset") {
    return ScheduledJobDstAmbiguousPolicy.EARLIER_OFFSET;
  }

  if (value === "later-offset") {
    return ScheduledJobDstAmbiguousPolicy.LATER_OFFSET;
  }

  return null;
}

function toDstAmbiguousTimePolicyResponse(value: ScheduledJobDstAmbiguousPolicy) {
  return value === ScheduledJobDstAmbiguousPolicy.LATER_OFFSET ? "later-offset" : "earlier-offset";
}

function normalizeDstInvalidTimePolicy(value: unknown): ScheduledJobDstInvalidPolicy | null {
  if (value === undefined || value === null) {
    return ScheduledJobDstInvalidPolicy.SHIFT_FORWARD;
  }

  if (value === "shift-forward") {
    return ScheduledJobDstInvalidPolicy.SHIFT_FORWARD;
  }

  if (value === "skip") {
    return ScheduledJobDstInvalidPolicy.SKIP;
  }

  return null;
}

function toDstInvalidTimePolicyResponse(value: ScheduledJobDstInvalidPolicy) {
  return value === ScheduledJobDstInvalidPolicy.SKIP ? "skip" : "shift-forward";
}

function normalizeRetryPolicy(input: {
  retryMaxAttempts?: number;
  retryBackoffSeconds?: number;
  retryMaxBackoffSeconds?: number;
}): { retryMaxAttempts: number; retryBackoffSeconds: number; retryMaxBackoffSeconds: number; error: string | null } {
  const retryMaxAttempts = input.retryMaxAttempts ?? 3;
  const retryBackoffSeconds = input.retryBackoffSeconds ?? 60;
  const retryMaxBackoffSeconds = input.retryMaxBackoffSeconds ?? 900;

  if (!Number.isInteger(retryMaxAttempts) || retryMaxAttempts < 1 || retryMaxAttempts > 10) {
    return {
      retryMaxAttempts,
      retryBackoffSeconds,
      retryMaxBackoffSeconds,
      error: "retryMaxAttempts must be an integer between 1 and 10"
    };
  }

  if (!Number.isInteger(retryBackoffSeconds) || retryBackoffSeconds < 1 || retryBackoffSeconds > 86_400) {
    return {
      retryMaxAttempts,
      retryBackoffSeconds,
      retryMaxBackoffSeconds,
      error: "retryBackoffSeconds must be an integer between 1 and 86400"
    };
  }

  if (!Number.isInteger(retryMaxBackoffSeconds) || retryMaxBackoffSeconds < 1 || retryMaxBackoffSeconds > 86_400) {
    return {
      retryMaxAttempts,
      retryBackoffSeconds,
      retryMaxBackoffSeconds,
      error: "retryMaxBackoffSeconds must be an integer between 1 and 86400"
    };
  }

  if (retryMaxBackoffSeconds < retryBackoffSeconds) {
    return {
      retryMaxAttempts,
      retryBackoffSeconds,
      retryMaxBackoffSeconds,
      error: "retryMaxBackoffSeconds must be >= retryBackoffSeconds"
    };
  }

  return {
    retryMaxAttempts,
    retryBackoffSeconds,
    retryMaxBackoffSeconds,
    error: null
  };
}

const zonedDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const offsetFormatterCache = new Map<string, Intl.DateTimeFormat>();

type ScheduleComputationOptions = {
  dstAmbiguousTimePolicy: ScheduledJobDstAmbiguousPolicy;
  dstInvalidTimePolicy: ScheduledJobDstInvalidPolicy;
};

type NextRunScheduleInput = {
  cadence: ScheduledJobCadence;
  dayOfWeek: number | null;
  runAtHour: number;
  runAtMinute: number;
  timezone: string;
  dstAmbiguousTimePolicy: ScheduledJobDstAmbiguousPolicy;
  dstInvalidTimePolicy: ScheduledJobDstInvalidPolicy;
};

function isValidTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function resolveScheduleTimezone(timezone: string | null | undefined, fallbackTimezone?: string | null) {
  if (timezone && isValidTimeZone(timezone)) {
    return timezone;
  }

  if (fallbackTimezone && isValidTimeZone(fallbackTimezone)) {
    return fallbackTimezone;
  }

  return "UTC";
}

function getZonedDateTimeFormatter(timezone: string) {
  const cached = zonedDateTimeFormatterCache.get(timezone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  zonedDateTimeFormatterCache.set(timezone, formatter);
  return formatter;
}

function getOffsetFormatter(timezone: string) {
  const cached = offsetFormatterCache.get(timezone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "shortOffset",
    hourCycle: "h23"
  });

  offsetFormatterCache.set(timezone, formatter);
  return formatter;
}

function getOffsetMinutesAt(date: Date, timezone: string) {
  const formatter = getOffsetFormatter(timezone);
  const offsetPart = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT";

  if (offsetPart === "GMT" || offsetPart === "UTC") {
    return 0;
  }

  const match = offsetPart.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);

  return sign * (hours * 60 + minutes);
}

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function getLocalDateTimeParts(date: Date, timezone: string): LocalDateTimeParts {
  const formatter = getZonedDateTimeFormatter(timezone);
  const parts = formatter.formatToParts(date);

  const readPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: readPart("year"),
    month: readPart("month"),
    day: readPart("day"),
    hour: readPart("hour"),
    minute: readPart("minute")
  };
}

function sameLocalDateTime(a: LocalDateTimeParts, b: LocalDateTimeParts) {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute
  );
}

function compareLocalDateTime(a: LocalDateTimeParts, b: LocalDateTimeParts) {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  if (a.day !== b.day) return a.day - b.day;
  if (a.hour !== b.hour) return a.hour - b.hour;
  return a.minute - b.minute;
}

function addDaysToLocalDate(localDate: Pick<LocalDateTimeParts, "year" | "month" | "day">, days: number) {
  const shifted = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function resolveLocalDateTimeToUtc(
  localDateTime: LocalDateTimeParts,
  timezone: string,
  options: ScheduleComputationOptions
): Date | null {
  const naiveUtcMs = Date.UTC(
    localDateTime.year,
    localDateTime.month - 1,
    localDateTime.day,
    localDateTime.hour,
    localDateTime.minute,
    0,
    0
  );

  const offsetsToTry = new Set<number>([
    getOffsetMinutesAt(new Date(naiveUtcMs), timezone),
    getOffsetMinutesAt(new Date(naiveUtcMs - 6 * 60 * 60 * 1000), timezone),
    getOffsetMinutesAt(new Date(naiveUtcMs + 6 * 60 * 60 * 1000), timezone),
    getOffsetMinutesAt(new Date(naiveUtcMs - 24 * 60 * 60 * 1000), timezone),
    getOffsetMinutesAt(new Date(naiveUtcMs + 24 * 60 * 60 * 1000), timezone)
  ]);

  const candidates = Array.from(offsetsToTry)
    .map((offsetMinutes) => new Date(naiveUtcMs - offsetMinutes * 60_000))
    .filter((candidate, index, all) => all.findIndex((value) => value.getTime() === candidate.getTime()) === index)
    .filter((candidate) => sameLocalDateTime(getLocalDateTimeParts(candidate, timezone), localDateTime))
    .sort((a, b) => a.getTime() - b.getTime());

  if (candidates.length > 0) {
    if (candidates.length === 1 || options.dstAmbiguousTimePolicy === ScheduledJobDstAmbiguousPolicy.EARLIER_OFFSET) {
      return candidates[0];
    }

    return candidates[candidates.length - 1];
  }

  if (options.dstInvalidTimePolicy === ScheduledJobDstInvalidPolicy.SKIP) {
    return null;
  }

  const target = localDateTime;

  for (let minuteOffset = 0; minuteOffset <= 6 * 60; minuteOffset += 1) {
    const candidate = new Date(naiveUtcMs + minuteOffset * 60_000);
    const localCandidate = getLocalDateTimeParts(candidate, timezone);

    if (
      localCandidate.year === target.year &&
      localCandidate.month === target.month &&
      localCandidate.day === target.day &&
      compareLocalDateTime(localCandidate, target) > 0
    ) {
      return candidate;
    }
  }

  return null;
}

export function computeNextRunAt(schedule: NextRunScheduleInput, fromDate: Date) {
  const reference = new Date(fromDate.getTime());
  const timezone = resolveScheduleTimezone(schedule.timezone);
  const localReference = getLocalDateTimeParts(reference, timezone);

  const buildCandidate = (localDate: Pick<LocalDateTimeParts, "year" | "month" | "day">) =>
    resolveLocalDateTimeToUtc(
      {
        ...localDate,
        hour: schedule.runAtHour,
        minute: schedule.runAtMinute
      },
      timezone,
      {
        dstAmbiguousTimePolicy: schedule.dstAmbiguousTimePolicy,
        dstInvalidTimePolicy: schedule.dstInvalidTimePolicy
      }
    );

  const maxIterations = 370;

  if (schedule.cadence === ScheduledJobCadence.DAILY) {
    let candidateDate = {
      year: localReference.year,
      month: localReference.month,
      day: localReference.day
    };

    for (let i = 0; i < maxIterations; i += 1) {
      const candidate = buildCandidate(candidateDate);
      if (candidate && candidate.getTime() > reference.getTime()) {
        return candidate;
      }

      candidateDate = addDaysToLocalDate(candidateDate, 1);
    }

    throw new Error("Unable to compute next DAILY run within 370 iterations");
  }

  const weeklyDay = schedule.dayOfWeek ?? 0;
  const localWeekday = new Date(Date.UTC(localReference.year, localReference.month - 1, localReference.day)).getUTCDay();
  const dayDelta = (weeklyDay - localWeekday + 7) % 7;

  let candidateDate = addDaysToLocalDate(
    {
      year: localReference.year,
      month: localReference.month,
      day: localReference.day
    },
    dayDelta
  );

  for (let i = 0; i < maxIterations; i += 1) {
    const candidate = buildCandidate(candidateDate);
    if (candidate && candidate.getTime() > reference.getTime()) {
      return candidate;
    }

    candidateDate = addDaysToLocalDate(candidateDate, 7);
  }

  throw new Error("Unable to compute next WEEKLY run within 370 iterations");
}

function resolveWindow(config: AutomationJobConfig, now: Date) {
  if (config.from || config.to) {
    const from = config.from ? parseDateInput(config.from) : null;
    const to = config.to ? parseDateInput(config.to) : null;

    return {
      from,
      to
    };
  }

  if (typeof config.windowDays === "number") {
    const to = new Date(now.getTime());
    const from = new Date(now.getTime());
    from.setUTCDate(from.getUTCDate() - config.windowDays);

    return {
      from,
      to
    };
  }

  return {
    from: null,
    to: null
  };
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

async function generateSnapshotOutput(job: ScheduledJobWithProject, runAt: Date) {
  const config = readStoredConfig(job.type as AutomationJobType, job.config);
  const window = resolveWindow(config, runAt);

  const recordedAtFilter = buildDateRangeFilter(window.from, window.to);
  const createdAtFilter = buildDateRangeFilter(window.from, window.to);
  const completedAtFilter = buildDateRangeFilter(window.from, window.to);

  const [
    rankSnapshots,
    rankedSnapshotAggregate,
    contentTasksCreated,
    contentTasksDone,
    backlinksCreated,
    backlinksWon,
    internalLinksCreated
  ] = await Promise.all([
    prisma.rankSnapshot.count({
      where: {
        projectId: job.projectId,
        ...(recordedAtFilter ? { recordedAt: recordedAtFilter } : {})
      }
    }),
    prisma.rankSnapshot.aggregate({
      where: {
        projectId: job.projectId,
        ...(recordedAtFilter ? { recordedAt: recordedAtFilter } : {}),
        rank: {
          not: null
        }
      },
      _avg: {
        rank: true
      },
      _count: {
        rank: true
      }
    }),
    prisma.contentTask.count({
      where: {
        projectId: job.projectId,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
      }
    }),
    prisma.contentTask.count({
      where: {
        projectId: job.projectId,
        status: TaskStatus.DONE,
        ...(completedAtFilter ? { completedAt: completedAtFilter } : {})
      }
    }),
    prisma.backlinkOpportunity.count({
      where: {
        projectId: job.projectId,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
      }
    }),
    prisma.backlinkOpportunity.count({
      where: {
        projectId: job.projectId,
        status: OutreachStatus.WON,
        ...(createdAtFilter ? { updatedAt: createdAtFilter } : {})
      }
    }),
    prisma.internalLink.count({
      where: {
        projectId: job.projectId,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
      }
    })
  ]);

  const averageRank = rankedSnapshotAggregate._avg.rank === null ? null : Math.round(rankedSnapshotAggregate._avg.rank * 100) / 100;
  const top10Count = await prisma.rankSnapshot.count({
    where: {
      projectId: job.projectId,
      ...(recordedAtFilter ? { recordedAt: recordedAtFilter } : {}),
      rank: {
        lte: 10,
        not: null
      }
    }
  });

  const output = {
    generatedAt: runAt.toISOString(),
    source: "phase11-automation",
    projectId: job.projectId,
    projectSlug: job.project.slug,
    window: {
      from: window.from?.toISOString() ?? null,
      to: window.to?.toISOString() ?? null
    },
    metrics: {
      rankSnapshots,
      averageRank,
      top10Rate: formatPercent(top10Count, rankedSnapshotAggregate._count.rank),
      contentTasksCreated,
      contentTasksDone,
      contentTaskCompletionRate: formatPercent(contentTasksDone, contentTasksCreated),
      backlinksCreated,
      backlinksWon,
      backlinkWinRate: formatPercent(backlinksWon, backlinksCreated),
      internalLinksCreated
    }
  };

  const summary = `Snapshot: ${rankSnapshots} snapshots, tasks ${contentTasksDone}/${contentTasksCreated}, backlinks ${backlinksWon}/${backlinksCreated}`;

  return {
    output,
    summary
  };
}

async function generateExportOutput(job: ScheduledJobWithProject, runAt: Date) {
  const config = readStoredConfig(job.type as AutomationJobType, job.config);
  const window = resolveWindow(config, runAt);
  const createdAtFilter = buildDateRangeFilter(window.from, window.to);
  const dataset = config.dataset ?? "kpis";
  const format = config.format ?? "json";
  const limit = config.limit ?? 200;

  if (!["kpis", "contentTasks", "backlinkOpportunities", "internalLinks"].includes(dataset)) {
    throw new Error(`Unsupported export dataset in job config: ${dataset}`);
  }

  let records: Array<Record<string, unknown>> = [];

  if (dataset === "kpis") {
    const snapshot = await generateSnapshotOutput(job, runAt);
    records = [snapshot.output.metrics as Record<string, unknown>];
  }

  if (dataset === "contentTasks") {
    const rows = await prisma.contentTask.findMany({
      where: {
        projectId: job.projectId,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        ...(config.contentTaskStatus ? { status: config.contentTaskStatus } : {})
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit
    });

    records = rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      priority: row.priority,
      dueAt: row.dueAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      error: row.error
    }));
  }

  if (dataset === "backlinkOpportunities") {
    const rows = await prisma.backlinkOpportunity.findMany({
      where: {
        projectId: job.projectId,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        ...(config.outreachStatus ? { status: config.outreachStatus } : {})
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit
    });

    records = rows.map((row) => ({
      id: row.id,
      sourceDomain: row.sourceDomain,
      targetUrl: row.targetUrl,
      status: row.status,
      authorityScore: row.authorityScore,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  if (dataset === "internalLinks") {
    const rows = await prisma.internalLink.findMany({
      where: {
        projectId: job.projectId,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        ...(config.linkStatus ? { status: config.linkStatus } : {})
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      include: {
        sourcePage: {
          select: {
            path: true
          }
        },
        targetPage: {
          select: {
            path: true
          }
        }
      }
    });

    records = rows.map((row) => ({
      id: row.id,
      sourcePagePath: row.sourcePage.path,
      targetPagePath: row.targetPage.path,
      anchorText: row.anchorText,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  const output = {
    generatedAt: runAt.toISOString(),
    source: "phase11-automation",
    projectId: job.projectId,
    projectSlug: job.project.slug,
    dataset,
    format,
    limit,
    window: {
      from: window.from?.toISOString() ?? null,
      to: window.to?.toISOString() ?? null
    },
    rowCount: records.length,
    records
  };

  const summary = `Export: dataset=${dataset}, rows=${records.length}, format=${format}`;

  return {
    output,
    summary
  };
}

function buildScheduledRunIdempotencyKey(jobId: string, scheduledFor: Date, attemptNumber: number) {
  return `scheduled:${jobId}:${scheduledFor.toISOString()}:attempt:${attemptNumber}`;
}

function computeRetryBackoffSeconds(baseSeconds: number, maxBackoffSeconds: number, failedAttemptNumber: number) {
  const exponential = baseSeconds * 2 ** Math.max(0, failedAttemptNumber - 1);
  return Math.min(maxBackoffSeconds, exponential);
}

function isUniqueConstraintError(error: unknown, targetField?: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  if (!targetField) {
    return true;
  }

  const target = error.meta?.target;
  if (!target) {
    return false;
  }

  if (Array.isArray(target)) {
    return target.includes(targetField);
  }

  return target === targetField;
}

function buildScheduleInput(job: Pick<
  ScheduledJobWithProject,
  "cadence" | "dayOfWeek" | "runAtHour" | "runAtMinute" | "timezone" | "dstAmbiguousTimePolicy" | "dstInvalidTimePolicy"
>) {
  return {
    cadence: job.cadence,
    dayOfWeek: job.dayOfWeek,
    runAtHour: job.runAtHour,
    runAtMinute: job.runAtMinute,
    timezone: job.timezone,
    dstAmbiguousTimePolicy: job.dstAmbiguousTimePolicy,
    dstInvalidTimePolicy: job.dstInvalidTimePolicy
  };
}

function buildRunInput(
  job: ScheduledJobWithProject,
  runRequestedAt: Date,
  metadata?: { scheduledFor?: Date | null; attemptNumber?: number; maxAttempts?: number }
) {
  const timezone = resolveScheduleTimezone(job.timezone, job.project.timezone);

  return {
    schedule: {
      cadence: job.cadence,
      dayOfWeek: job.dayOfWeek,
      runAtHour: job.runAtHour,
      runAtMinute: job.runAtMinute,
      timezone,
      status: job.status,
      catchUpMode: toCatchUpModeResponse(job.catchUpMode),
      dstAmbiguousTimePolicy: toDstAmbiguousTimePolicyResponse(job.dstAmbiguousTimePolicy),
      dstInvalidTimePolicy: toDstInvalidTimePolicyResponse(job.dstInvalidTimePolicy)
    },
    retryPolicy: {
      maxAttempts: job.retryMaxAttempts,
      baseBackoffSeconds: job.retryBackoffSeconds,
      maxBackoffSeconds: job.retryMaxBackoffSeconds
    },
    config: job.config,
    requestedAt: runRequestedAt.toISOString(),
    ...(metadata?.scheduledFor ? { scheduledFor: metadata.scheduledFor.toISOString() } : {}),
    ...(metadata?.attemptNumber !== undefined ? { attemptNumber: metadata.attemptNumber } : {}),
    ...(metadata?.maxAttempts !== undefined ? { maxAttempts: metadata.maxAttempts } : {})
  };
}

function computeNextRunForClaim(job: ScheduledJobWithProject, runRequestedAt: Date, scheduledFor: Date) {
  const reference = job.catchUpMode === ScheduledJobCatchUpMode.REPLAY_MISSED ? scheduledFor : runRequestedAt;
  return computeNextRunAt(buildScheduleInput(job), reference);
}

async function executePreparedRun(
  job: ScheduledJobWithProject,
  run: JobRunWithRelations,
  runRequestedAt: Date,
  options: { updateNextRunAtOnFinish: boolean; allowScheduledRetry: boolean }
) {
  try {
    const generated =
      job.type === JobType.ANALYTICS_SNAPSHOT
        ? await generateSnapshotOutput(job, runRequestedAt)
        : await generateExportOutput(job, runRequestedAt);

    const finishedAt = new Date();
    const updatedRun = await prisma.jobRun.update({
      where: {
        id: run.id
      },
      data: {
        status: JobStatus.SUCCESS,
        output: generated.output as Prisma.InputJsonObject,
        outputSummary: generated.summary,
        finishedAt
      },
      include: jobRunInclude
    });

    await prisma.scheduledJob.update({
      where: {
        id: job.id
      },
      data: {
        lastRunAt: finishedAt,
        lastRunStatus: JobStatus.SUCCESS,
        lastRunId: updatedRun.id,
        successCount: {
          increment: 1
        },
        consecutiveFailures: 0,
        lastError: null,
        retryScheduledFor: null,
        retryAttempt: null,
        retryFromRunId: null,
        deadLetteredAt: job.status === ScheduledJobStatus.DEAD_LETTER ? job.deadLetteredAt : null,
        ...(options.updateNextRunAtOnFinish
          ? {
              nextRunAt:
                job.status === ScheduledJobStatus.ACTIVE
                  ? computeNextRunAt(buildScheduleInput(job), runRequestedAt)
                  : null
            }
          : {})
      }
    });

    return updatedRun;
  } catch (error) {
    const finishedAt = new Date();
    const errorMessage = error instanceof Error ? error.message : "Automation execution failed";

    const shouldRetryScheduledRun =
      options.allowScheduledRetry &&
      run.trigger === JobTrigger.SCHEDULED &&
      run.scheduledFor !== null &&
      run.attemptNumber < run.maxAttempts &&
      job.status === ScheduledJobStatus.ACTIVE;

    if (shouldRetryScheduledRun) {
      const retryBackoffSeconds = computeRetryBackoffSeconds(
        job.retryBackoffSeconds,
        job.retryMaxBackoffSeconds,
        run.attemptNumber
      );
      const nextRetryAt = new Date(finishedAt.getTime() + retryBackoffSeconds * 1000);

      const failedRun = await prisma.jobRun.update({
        where: {
          id: run.id
        },
        data: {
          status: JobStatus.FAILED,
          error: errorMessage,
          finishedAt,
          retryBackoffSeconds,
          nextRetryAt
        },
        include: jobRunInclude
      });

      await prisma.scheduledJob.update({
        where: {
          id: job.id
        },
        data: {
          lastRunAt: finishedAt,
          lastRunStatus: JobStatus.FAILED,
          lastRunId: failedRun.id,
          failureCount: {
            increment: 1
          },
          consecutiveFailures: {
            increment: 1
          },
          lastError: errorMessage,
          retryScheduledFor: run.scheduledFor,
          retryAttempt: run.attemptNumber + 1,
          retryFromRunId: failedRun.id,
          nextRunAt: nextRetryAt
        }
      });

      try {
        await evaluateAutomationFailureAlerts({
          ownerId: job.project.ownerId,
          projectId: job.projectId,
          scheduledJobId: job.id,
          jobRunId: failedRun.id,
          consecutiveFailures: job.consecutiveFailures + 1,
          deadLettered: false,
          finishedAt
        });
      } catch {
        // Alert persistence must not fail automation run state transitions.
      }

      return failedRun;
    }

    const shouldDeadLetterScheduledRun =
      options.allowScheduledRetry &&
      run.trigger === JobTrigger.SCHEDULED &&
      run.scheduledFor !== null &&
      run.attemptNumber >= run.maxAttempts &&
      job.status === ScheduledJobStatus.ACTIVE;

    const failedRun = await prisma.jobRun.update({
      where: {
        id: run.id
      },
      data: {
        status: JobStatus.FAILED,
        error: errorMessage,
        finishedAt
      },
      include: jobRunInclude
    });

    await prisma.scheduledJob.update({
      where: {
        id: job.id
      },
      data: {
        lastRunAt: finishedAt,
        lastRunStatus: JobStatus.FAILED,
        lastRunId: failedRun.id,
        failureCount: {
          increment: 1
        },
        consecutiveFailures: {
          increment: 1
        },
        lastError: errorMessage,
        retryScheduledFor: null,
        retryAttempt: null,
        retryFromRunId: null,
        ...(shouldDeadLetterScheduledRun
          ? {
              status: ScheduledJobStatus.DEAD_LETTER,
              deadLetteredAt: finishedAt,
              deadLetterAcknowledgedAt: null,
              deadLetterAcknowledgedByUserId: null,
              nextRunAt: null
            }
          : options.updateNextRunAtOnFinish
            ? {
                nextRunAt:
                  job.status === ScheduledJobStatus.ACTIVE
                    ? computeNextRunAt(buildScheduleInput(job), runRequestedAt)
                    : null
              }
            : {})
      }
    });

    try {
      await evaluateAutomationFailureAlerts({
        ownerId: job.project.ownerId,
        projectId: job.projectId,
        scheduledJobId: job.id,
        jobRunId: failedRun.id,
        consecutiveFailures: job.consecutiveFailures + 1,
        deadLettered: shouldDeadLetterScheduledRun,
        finishedAt
      });
    } catch {
      // Alert persistence must not fail automation run state transitions.
    }

    return failedRun;
  }
}

async function startManualRun(job: ScheduledJobWithProject, trigger: JobTrigger, runRequestedAt: Date) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.jobRun.create({
      data: {
        projectId: job.projectId,
        scheduledJobId: job.id,
        type: job.type,
        status: JobStatus.RUNNING,
        trigger,
        startedAt: runRequestedAt,
        scheduledFor: null,
        attemptNumber: 1,
        maxAttempts: 1,
        input: buildRunInput(job, runRequestedAt, {
          attemptNumber: 1,
          maxAttempts: 1
        }) as Prisma.InputJsonObject
      },
      include: jobRunInclude
    });

    await tx.scheduledJob.update({
      where: {
        id: job.id
      },
      data: {
        lastRunAt: runRequestedAt,
        lastRunStatus: JobStatus.RUNNING,
        lastRunId: run.id
      }
    });

    return run;
  });
}

async function claimDueRun(jobId: string, runRequestedAt: Date) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.scheduledJob.findUnique({
      where: {
        id: jobId
      },
      include: {
        project: {
          select: automationJobProjectSelect
        }
      }
    });

    if (!current) {
      return null;
    }

    if (current.status !== ScheduledJobStatus.ACTIVE || !current.nextRunAt || current.nextRunAt.getTime() > runRequestedAt.getTime()) {
      return null;
    }

    const scheduledFor = current.retryScheduledFor ?? current.nextRunAt;
    const attemptNumber = current.retryAttempt ?? 1;
    const maxAttempts = current.retryMaxAttempts;
    const retryOfRunId = current.retryFromRunId;
    const nextRunAt = computeNextRunForClaim(current, runRequestedAt, scheduledFor);

    const claimedUpdate = await tx.scheduledJob.updateMany({
      where: {
        id: current.id,
        status: ScheduledJobStatus.ACTIVE,
        nextRunAt: current.nextRunAt,
        retryScheduledFor: current.retryScheduledFor,
        retryAttempt: current.retryAttempt,
        retryFromRunId: current.retryFromRunId
      },
      data: {
        nextRunAt,
        lastRunAt: runRequestedAt,
        lastRunStatus: JobStatus.RUNNING
      }
    });

    if (claimedUpdate.count !== 1) {
      return null;
    }

    const idempotencyKey = buildScheduledRunIdempotencyKey(current.id, scheduledFor, attemptNumber);

    let run: JobRunWithRelations;
    try {
      run = await tx.jobRun.create({
        data: {
          projectId: current.projectId,
          scheduledJobId: current.id,
          type: current.type,
          status: JobStatus.RUNNING,
          trigger: JobTrigger.SCHEDULED,
          startedAt: runRequestedAt,
          idempotencyKey,
          scheduledFor,
          attemptNumber,
          maxAttempts,
          retryOfRunId,
          input: buildRunInput(current, runRequestedAt, {
            scheduledFor,
            attemptNumber,
            maxAttempts
          }) as Prisma.InputJsonObject
        },
        include: jobRunInclude
      });
    } catch (error) {
      if (isUniqueConstraintError(error, "idempotencyKey")) {
        return null;
      }

      throw error;
    }

    await tx.scheduledJob.update({
      where: {
        id: current.id
      },
      data: {
        lastRunId: run.id
      }
    });

    return {
      job: current,
      run
    };
  });
}

async function executeDueJob(jobId: string, runRequestedAt: Date) {
  const claimed = await claimDueRun(jobId, runRequestedAt);
  if (!claimed) {
    return null;
  }

  return executePreparedRun(claimed.job, claimed.run, runRequestedAt, {
    updateNextRunAtOnFinish: false,
    allowScheduledRetry: true
  });
}

export type ProcessDueAutomationJobsOptions = {
  runRequestedAt: Date;
  limit: number;
  ownerId?: string;
};

export type ProcessDueAutomationJobsResult = {
  runs: JobRunWithRelations[];
  remainingDue: number;
};

export async function processDueAutomationJobs(options: ProcessDueAutomationJobsOptions): Promise<ProcessDueAutomationJobsResult> {
  const where: Prisma.ScheduledJobWhereInput = {
    status: ScheduledJobStatus.ACTIVE,
    nextRunAt: {
      lte: options.runRequestedAt
    },
    ...(options.ownerId
      ? {
          project: {
            ownerId: options.ownerId
          }
        }
      : {})
  };

  const runs: JobRunWithRelations[] = [];
  let failedClaimsInRow = 0;

  while (runs.length < options.limit) {
    const candidate = await prisma.scheduledJob.findFirst({
      where,
      select: {
        id: true
      },
      orderBy: [{ nextRunAt: "asc" }, { createdAt: "asc" }]
    });

    if (!candidate) {
      break;
    }

    const run = await executeDueJob(candidate.id, options.runRequestedAt);
    if (run) {
      runs.push(run);
      failedClaimsInRow = 0;
      continue;
    }

    failedClaimsInRow += 1;
    if (failedClaimsInRow >= options.limit * 2) {
      break;
    }
  }

  const remainingDue = await prisma.scheduledJob.count({ where });

  return {
    runs,
    remainingDue
  };
}

async function executeScheduledJob(job: ScheduledJobWithProject, trigger: JobTrigger, runRequestedAt: Date) {
  const run = await startManualRun(job, trigger, runRequestedAt);

  return executePreparedRun(job, run, runRequestedAt, {
    updateNextRunAtOnFinish: true,
    allowScheduledRetry: false
  });
}

function toAutomationJobResponse(job: ScheduledJobWithProject) {
  const totalRuns = job.successCount + job.failureCount;

  return {
    id: job.id,
    projectId: job.projectId,
    project: {
      id: job.project.id,
      name: job.project.name,
      slug: job.project.slug,
      timezone: job.project.timezone
    },
    name: job.name,
    type: job.type,
    cadence: job.cadence,
    dayOfWeek: job.dayOfWeek,
    runAtHour: job.runAtHour,
    runAtMinute: job.runAtMinute,
    timezone: job.timezone,
    status: job.status,
    catchUpMode: toCatchUpModeResponse(job.catchUpMode),
    dstAmbiguousTimePolicy: toDstAmbiguousTimePolicyResponse(job.dstAmbiguousTimePolicy),
    dstInvalidTimePolicy: toDstInvalidTimePolicyResponse(job.dstInvalidTimePolicy),
    retryPolicy: {
      maxAttempts: job.retryMaxAttempts,
      backoffSeconds: job.retryBackoffSeconds,
      maxBackoffSeconds: job.retryMaxBackoffSeconds
    },
    retryState: {
      scheduledFor: job.retryScheduledFor?.toISOString() ?? null,
      nextAttemptNumber: job.retryAttempt,
      retryFromRunId: job.retryFromRunId
    },
    health: {
      totalRuns,
      successCount: job.successCount,
      failureCount: job.failureCount,
      successRate: totalRuns === 0 ? null : Math.round((job.successCount / totalRuns) * 10000) / 100,
      consecutiveFailures: job.consecutiveFailures,
      lastError: job.lastError,
      deadLetteredAt: job.deadLetteredAt?.toISOString() ?? null,
      deadLetterAcknowledgedAt: job.deadLetterAcknowledgedAt?.toISOString() ?? null,
      deadLetterAcknowledgedByUserId: job.deadLetterAcknowledgedByUserId
    },
    config: job.config,
    lastRunAt: job.lastRunAt?.toISOString() ?? null,
    lastRunStatus: job.lastRunStatus,
    lastRunId: job.lastRunId,
    nextRunAt: job.nextRunAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

function toJobRunResponse(run: JobRunWithRelations) {
  return {
    id: run.id,
    scheduledJobId: run.scheduledJobId,
    projectId: run.projectId,
    project: {
      id: run.project.id,
      name: run.project.name,
      slug: run.project.slug
    },
    scheduledJob: run.scheduledJob,
    type: run.type,
    status: run.status,
    trigger: run.trigger,
    scheduledFor: run.scheduledFor?.toISOString() ?? null,
    attemptNumber: run.attemptNumber,
    maxAttempts: run.maxAttempts,
    retryOfRunId: run.retryOfRunId,
    retryBackoffSeconds: run.retryBackoffSeconds,
    nextRetryAt: run.nextRetryAt?.toISOString() ?? null,
    input: run.input,
    output: run.output,
    outputSummary: run.outputSummary,
    error: run.error,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString()
  };
}

function toSchedulerTickHistoryResponse(tick: {
  id: string;
  reason: string;
  outcome: string;
  durationMs: number;
  processed: number;
  remainingDue: number;
  errorSummary: string | null;
  isContention: boolean;
  isOverlapSkip: boolean;
  tickedAt: Date;
  createdAt: Date;
}) {
  return {
    id: tick.id,
    reason: tick.reason,
    outcome: tick.outcome,
    durationMs: tick.durationMs,
    processed: tick.processed,
    remainingDue: tick.remainingDue,
    error: tick.errorSummary,
    contention: tick.isContention,
    overlapSkip: tick.isOverlapSkip,
    tickedAt: tick.tickedAt.toISOString(),
    createdAt: tick.createdAt.toISOString()
  };
}

function toAutomationAlertResponse(alert: {
  id: string;
  ownerId: string | null;
  projectId: string | null;
  scheduledJobId: string | null;
  jobRunId: string | null;
  type: AutomationAlertType;
  severity: string;
  status: AutomationAlertStatus;
  title: string;
  message: string;
  thresholdValue: number | null;
  observedValue: number | null;
  metadata: Prisma.JsonValue | null;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const delivery = readAlertDeliverySnapshot(alert.metadata);

  return {
    id: alert.id,
    ownerId: alert.ownerId,
    projectId: alert.projectId,
    scheduledJobId: alert.scheduledJobId,
    jobRunId: alert.jobRunId,
    type: alert.type,
    severity: alert.severity,
    status: alert.status,
    title: alert.title,
    message: alert.message,
    thresholdValue: alert.thresholdValue,
    observedValue: alert.observedValue,
    metadata: alert.metadata,
    delivery: delivery
      ? {
          provider: delivery.provider,
          status: delivery.status,
          attemptedAt: delivery.attemptedAt,
          lastError: delivery.lastError,
          responseStatus: delivery.responseStatus,
          attemptCount: delivery.attemptCount,
          successCount: delivery.successCount,
          failureCount: delivery.failureCount,
          skippedCount: delivery.skippedCount
        }
      : null,
    acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByUserId: alert.acknowledgedByUserId,
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString()
  };
}

function normalizeOptionalNote(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const note = value.trim();
  if (!note) {
    return null;
  }

  return note.slice(0, 500);
}

function normalizeBulkJobIds(rawJobIds: string[]) {
  const normalized: string[] = [];
  const duplicates = new Set<string>();
  const invalidIds: string[] = [];
  const seen = new Set<string>();

  for (const rawId of rawJobIds) {
    const jobId = rawId.trim();

    if (!jobId) {
      invalidIds.push(rawId);
      continue;
    }

    if (seen.has(jobId)) {
      duplicates.add(jobId);
      continue;
    }

    seen.add(jobId);
    normalized.push(jobId);
  }

  return {
    normalized,
    duplicates: Array.from(duplicates),
    invalidIds
  };
}

function toBulkDlqActionResponse(action: DlqBulkAction, requested: number, results: DlqBulkActionResultItem[]) {
  const succeeded = results.filter((item) => item.ok).length;
  const failed = results.length - succeeded;

  return {
    action,
    requested,
    succeeded,
    failed,
    results
  };
}

export function registerPhase11Routes(app: FastifyInstance) {
  app.post<{ Body: CreateAutomationJobBody }>(
    "/v1/automation/jobs",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "name", "type", "cadence"],
          properties: {
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            name: { type: "string", minLength: 1, maxLength: 120 },
            type: { type: "string", enum: ["ANALYTICS_SNAPSHOT", "ANALYTICS_EXPORT"] },
            cadence: { type: "string", enum: ["DAILY", "WEEKLY"] },
            dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
            runAtHour: { type: "integer", minimum: 0, maximum: 23 },
            runAtMinute: { type: "integer", minimum: 0, maximum: 59 },
            timezone: { type: "string", minLength: 1, maxLength: 80 },
            status: { type: "string", enum: ["ACTIVE", "PAUSED"] },
            catchUpMode: { type: "string", enum: ["skip-missed", "replay-missed"] },
            dstAmbiguousTimePolicy: { type: "string", enum: ["earlier-offset", "later-offset"] },
            dstInvalidTimePolicy: { type: "string", enum: ["shift-forward", "skip"] },
            retryMaxAttempts: { type: "integer", minimum: 1, maximum: 10 },
            retryBackoffSeconds: { type: "integer", minimum: 1, maximum: 86400 },
            retryMaxBackoffSeconds: { type: "integer", minimum: 1, maximum: 86400 },
            config: { type: ["object", "null"], additionalProperties: true },
            startAt: { type: "string", minLength: 1, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const projectId = request.body.projectId.trim();
      if (!projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId is required");
      }

      const name = request.body.name.trim();
      if (!name) {
        return sendError(reply, 400, "VALIDATION_ERROR", "name is required");
      }

      const dayOfWeek = normalizeDayOfWeek(request.body.dayOfWeek);
      if (request.body.dayOfWeek !== undefined && dayOfWeek === null) {
        return sendError(reply, 400, "VALIDATION_ERROR", "dayOfWeek must be an integer between 0 and 6");
      }

      const runAtHour = request.body.runAtHour ?? 0;
      const runAtMinute = request.body.runAtMinute ?? 0;

      const timezone = request.body.timezone?.trim() || "UTC";
      if (!isValidTimeZone(timezone)) {
        return sendError(reply, 400, "VALIDATION_ERROR", "timezone must be a valid IANA timezone (for example: UTC, America/New_York)");
      }

      const status = request.body.status ?? ScheduledJobStatus.ACTIVE;

      const catchUpMode = normalizeCatchUpMode(request.body.catchUpMode);
      if (!catchUpMode) {
        return sendError(reply, 400, "VALIDATION_ERROR", "catchUpMode must be skip-missed or replay-missed");
      }

      const dstAmbiguousTimePolicy = normalizeDstAmbiguousTimePolicy(request.body.dstAmbiguousTimePolicy);
      if (!dstAmbiguousTimePolicy) {
        return sendError(reply, 400, "VALIDATION_ERROR", "dstAmbiguousTimePolicy must be earlier-offset or later-offset");
      }

      const dstInvalidTimePolicy = normalizeDstInvalidTimePolicy(request.body.dstInvalidTimePolicy);
      if (!dstInvalidTimePolicy) {
        return sendError(reply, 400, "VALIDATION_ERROR", "dstInvalidTimePolicy must be shift-forward or skip");
      }

      const retryPolicy = normalizeRetryPolicy({
        retryMaxAttempts: request.body.retryMaxAttempts,
        retryBackoffSeconds: request.body.retryBackoffSeconds,
        retryMaxBackoffSeconds: request.body.retryMaxBackoffSeconds
      });
      if (retryPolicy.error) {
        return sendError(reply, 400, "VALIDATION_ERROR", retryPolicy.error);
      }

      if (request.body.cadence === ScheduledJobCadence.WEEKLY && dayOfWeek === null) {
        return sendError(reply, 400, "VALIDATION_ERROR", "dayOfWeek is required when cadence=WEEKLY");
      }

      const parsedStartAt = request.body.startAt ? parseDateInput(request.body.startAt) : new Date();
      if (!parsedStartAt) {
        return sendError(reply, 400, "VALIDATION_ERROR", "startAt must be a valid ISO date-time");
      }

      const normalizedType = normalizeAutomationJobType(request.body.type);
      if (!normalizedType) {
        return sendError(reply, 400, "VALIDATION_ERROR", "type must be ANALYTICS_SNAPSHOT or ANALYTICS_EXPORT");
      }

      const normalizedConfig = normalizeJobConfig(normalizedType, request.body.config);
      if (normalizedConfig.error) {
        return sendError(reply, 400, "VALIDATION_ERROR", normalizedConfig.error);
      }

      try {
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            ownerId: owner.id
          },
          select: {
            id: true
          }
        });

        if (!project) {
          return sendError(reply, 404, "NOT_FOUND", "Project not found");
        }

        const created = await prisma.scheduledJob.create({
          data: {
            projectId: project.id,
            name,
            type: normalizedType,
            cadence: request.body.cadence,
            dayOfWeek: request.body.cadence === ScheduledJobCadence.DAILY ? null : dayOfWeek,
            runAtHour,
            runAtMinute,
            timezone,
            status,
            catchUpMode,
            dstAmbiguousTimePolicy,
            dstInvalidTimePolicy,
            retryMaxAttempts: retryPolicy.retryMaxAttempts,
            retryBackoffSeconds: retryPolicy.retryBackoffSeconds,
            retryMaxBackoffSeconds: retryPolicy.retryMaxBackoffSeconds,
            config: normalizedConfig.config ? (normalizedConfig.config as Prisma.InputJsonObject) : Prisma.DbNull,
            nextRunAt:
              status === ScheduledJobStatus.ACTIVE
                ? computeNextRunAt(
                    {
                      cadence: request.body.cadence,
                      dayOfWeek: request.body.cadence === ScheduledJobCadence.WEEKLY ? dayOfWeek : null,
                      runAtHour,
                      runAtMinute,
                      timezone,
                      dstAmbiguousTimePolicy,
                      dstInvalidTimePolicy
                    },
                    parsedStartAt
                  )
                : null
          },
          include: {
            project: {
              select: automationJobProjectSelect
            }
          }
        });

        return reply.status(201).send({ data: toAutomationJobResponse(created) });
      } catch (error) {
        app.log.error({ err: error }, "automation job create failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create automation job");
      }
    }
  );

  app.get<{ Querystring: ListAutomationJobsQuery }>(
    "/v1/automation/jobs",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            status: { type: "string", enum: ["ACTIVE", "PAUSED", "DEAD_LETTER"] },
            cadence: { type: "string", enum: ["DAILY", "WEEKLY"] },
            type: { type: "string", enum: ["ANALYTICS_SNAPSHOT", "ANALYTICS_EXPORT"] }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const projectId = request.query.projectId?.trim();

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      try {
        const where: Prisma.ScheduledJobWhereInput = {
          project: {
            ownerId: owner.id,
            ...(projectId ? { id: projectId } : {})
          },
          ...(request.query.status ? { status: request.query.status } : {}),
          ...(request.query.cadence ? { cadence: request.query.cadence } : {}),
          ...(request.query.type ? { type: request.query.type } : {})
        };

        const [total, jobs] = await prisma.$transaction([
          prisma.scheduledJob.count({ where }),
          prisma.scheduledJob.findMany({
            where,
            include: {
              project: {
                select: automationJobProjectSelect
              }
            },
            orderBy: [{ createdAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit
          })
        ]);

        return reply.send({
          data: jobs.map(toAutomationJobResponse),
          meta: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "automation job list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load automation jobs");
      }
    }
  );

  app.post<{ Body: ProcessDueJobsBody }>(
    "/v1/automation/jobs/process-due",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            now: { type: "string", minLength: 1, maxLength: 64 },
            limit: { type: "integer", minimum: 1, maximum: 50, default: 10 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const runNow = request.body?.now ? parseDateInput(request.body.now) : new Date();
      if (!runNow) {
        return sendError(reply, 400, "VALIDATION_ERROR", "now must be a valid ISO date-time");
      }

      const limit = request.body?.limit ?? 10;

      try {
        const { runs, remainingDue } = await processDueAutomationJobs({
          runRequestedAt: runNow,
          limit,
          ownerId: owner.id
        });

        return reply.send({
          data: {
            now: runNow.toISOString(),
            processed: runs.length,
            remainingDue,
            runs: runs.map(toJobRunResponse)
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "automation due job processing failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to process due jobs");
      }
    }
  );

  app.get(
    "/v1/automation/scheduler/diagnostics",
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const runtime = getAutomationSchedulerRuntimeState();
        const now = new Date();
        const runWindowHours = 24;
        const trendWindowMinutes = 60;
        const deadLetterTrendWindowHours = 24;
        const deliveryWindowHours = 24;

        const runWindowStart = new Date(now.getTime() - runWindowHours * 60 * 60 * 1000);
        const trendCurrentStart = new Date(now.getTime() - trendWindowMinutes * 60 * 1000);
        const trendPreviousStart = new Date(now.getTime() - trendWindowMinutes * 2 * 60 * 1000);
        const deadLetterCurrentStart = new Date(now.getTime() - deadLetterTrendWindowHours * 60 * 60 * 1000);
        const deadLetterPreviousStart = new Date(now.getTime() - deadLetterTrendWindowHours * 2 * 60 * 60 * 1000);
        const deliveryWindowStart = new Date(now.getTime() - deliveryWindowHours * 60 * 60 * 1000);

        const [
          lock,
          ownerActiveJobs,
          ownerDueNow,
          ownerRetryingJobs,
          ownerDeadLetterJobs,
          ownerRunsTotal,
          ownerRunsSuccess,
          ownerRunsFailed,
          ownerRunsRunning,
          recentFailures,
          ownerOpenAlerts,
          deadLetterRecentCount,
          deadLetterPreviousCount,
          recentContentionCount,
          previousContentionCount,
          recentFailedRunsCount,
          previousFailedRunsCount,
          deliveryWindowAlerts
        ] = await prisma.$transaction([
          prisma.schedulerLock.findUnique({
            where: {
              name: AUTOMATION_SCHEDULER_LOCK_NAME
            }
          }),
          prisma.scheduledJob.count({
            where: {
              status: ScheduledJobStatus.ACTIVE,
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.scheduledJob.count({
            where: {
              status: ScheduledJobStatus.ACTIVE,
              nextRunAt: {
                lte: now
              },
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.scheduledJob.count({
            where: {
              status: ScheduledJobStatus.ACTIVE,
              retryAttempt: {
                not: null
              },
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.scheduledJob.count({
            where: {
              status: ScheduledJobStatus.DEAD_LETTER,
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.jobRun.count({
            where: {
              createdAt: {
                gte: runWindowStart
              },
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.jobRun.count({
            where: {
              status: JobStatus.SUCCESS,
              createdAt: {
                gte: runWindowStart
              },
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.jobRun.count({
            where: {
              status: JobStatus.FAILED,
              createdAt: {
                gte: runWindowStart
              },
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.jobRun.count({
            where: {
              status: JobStatus.RUNNING,
              createdAt: {
                gte: runWindowStart
              },
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.jobRun.findMany({
            where: {
              status: JobStatus.FAILED,
              project: {
                ownerId: owner.id
              }
            },
            orderBy: [{ createdAt: "desc" }],
            take: 5,
            select: {
              id: true,
              scheduledJobId: true,
              attemptNumber: true,
              maxAttempts: true,
              error: true,
              createdAt: true
            }
          }),
          prisma.automationAlertEvent.count({
            where: {
              status: AutomationAlertStatus.OPEN,
              OR: [{ ownerId: owner.id }, { ownerId: null }]
            }
          }),
          prisma.scheduledJob.count({
            where: {
              deadLetteredAt: {
                gte: deadLetterCurrentStart,
                lte: now
              },
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.scheduledJob.count({
            where: {
              deadLetteredAt: {
                gte: deadLetterPreviousStart,
                lt: deadLetterCurrentStart
              },
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.automationSchedulerTickEvent.count({
            where: {
              outcome: "contention",
              tickedAt: {
                gte: trendCurrentStart,
                lte: now
              }
            }
          }),
          prisma.automationSchedulerTickEvent.count({
            where: {
              outcome: "contention",
              tickedAt: {
                gte: trendPreviousStart,
                lt: trendCurrentStart
              }
            }
          }),
          prisma.jobRun.count({
            where: {
              status: JobStatus.FAILED,
              createdAt: {
                gte: trendCurrentStart,
                lte: now
              },
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.jobRun.count({
            where: {
              status: JobStatus.FAILED,
              createdAt: {
                gte: trendPreviousStart,
                lt: trendCurrentStart
              },
              project: {
                ownerId: owner.id
              }
            }
          }),
          prisma.automationAlertEvent.findMany({
            where: {
              createdAt: {
                gte: deliveryWindowStart,
                lte: now
              },
              OR: [{ ownerId: owner.id }, { ownerId: null }]
            },
            select: {
              metadata: true,
              createdAt: true
            }
          })
        ]);

        const deliverySummary = {
          windowHours: deliveryWindowHours,
          totalAttempts: 0,
          successCount: 0,
          failureCount: 0,
          skippedCount: 0,
          successRate: null as number | null,
          lastAttemptAt: null as string | null,
          lastError: null as string | null
        };

        for (const alert of deliveryWindowAlerts) {
          const delivery = readAlertDeliverySnapshot(alert.metadata);
          if (!delivery) {
            continue;
          }

          deliverySummary.totalAttempts += delivery.attemptCount > 0 ? delivery.attemptCount : 1;
          deliverySummary.successCount += delivery.successCount;
          deliverySummary.failureCount += delivery.failureCount;
          deliverySummary.skippedCount += delivery.skippedCount;

          if (
            delivery.attemptedAt &&
            (!deliverySummary.lastAttemptAt || delivery.attemptedAt > deliverySummary.lastAttemptAt)
          ) {
            deliverySummary.lastAttemptAt = delivery.attemptedAt;
            deliverySummary.lastError = delivery.lastError;
          }
        }

        if (deliverySummary.totalAttempts > 0) {
          deliverySummary.successRate =
            Math.round((deliverySummary.successCount / deliverySummary.totalAttempts) * 10000) / 100;
        }

        return reply.send({
          data: {
            scheduler: {
              enabled: runtime.enabled,
              intervalMs: runtime.intervalMs,
              batchLimit: runtime.batchLimit,
              lockLeaseMs: runtime.lockLeaseMs,
              startedAt: runtime.startedAt,
              stoppedAt: runtime.stoppedAt,
              runningTick: runtime.runningTick,
              lastTickAt: runtime.lastTickAt,
              lastTickReason: runtime.lastTickReason,
              lastTickOutcome: runtime.lastTickOutcome,
              lastTickDurationMs: runtime.lastTickDurationMs,
              lastTickError: runtime.lastTickError,
              overlapSkips: runtime.overlapSkips,
              contentionCount: runtime.contentionCount,
              totalTicks: runtime.totalTicks,
              successfulTicks: runtime.successfulTicks,
              failedTicks: runtime.failedTicks,
              totalRunsProcessed: runtime.totalRunsProcessed,
              recentTicks: runtime.recentTicks
            },
            lock: {
              name: AUTOMATION_SCHEDULER_LOCK_NAME,
              isLocked: Boolean(lock?.lockedUntil && lock.lockedUntil.getTime() > now.getTime()),
              lockedUntil: lock?.lockedUntil?.toISOString() ?? null,
              ownerTokenHint: lock?.ownerToken ? `${lock.ownerToken.slice(0, 8)}…` : null,
              updatedAt: lock?.updatedAt?.toISOString() ?? null
            },
            owner: {
              id: owner.id,
              activeJobs: ownerActiveJobs,
              dueNow: ownerDueNow,
              retryingJobs: ownerRetryingJobs,
              deadLetterJobs: ownerDeadLetterJobs,
              openAlerts: ownerOpenAlerts,
              runWindow: {
                from: runWindowStart.toISOString(),
                to: now.toISOString()
              },
              runStats: {
                total: ownerRunsTotal,
                success: ownerRunsSuccess,
                failed: ownerRunsFailed,
                running: ownerRunsRunning,
                successRate: ownerRunsTotal === 0 ? null : Math.round((ownerRunsSuccess / ownerRunsTotal) * 10000) / 100
              },
              trends: {
                deadLetter: {
                  windowHours: deadLetterTrendWindowHours,
                  currentWindowCount: deadLetterRecentCount,
                  previousWindowCount: deadLetterPreviousCount,
                  delta: deadLetterRecentCount - deadLetterPreviousCount
                },
                contention: {
                  windowMinutes: trendWindowMinutes,
                  currentWindowCount: recentContentionCount,
                  previousWindowCount: previousContentionCount,
                  delta: recentContentionCount - previousContentionCount
                },
                failures: {
                  windowMinutes: trendWindowMinutes,
                  currentWindowCount: recentFailedRunsCount,
                  previousWindowCount: previousFailedRunsCount,
                  delta: recentFailedRunsCount - previousFailedRunsCount
                }
              },
              delivery: deliverySummary,
              recentFailures: recentFailures.map((failedRun) => ({
                id: failedRun.id,
                scheduledJobId: failedRun.scheduledJobId,
                attemptNumber: failedRun.attemptNumber,
                maxAttempts: failedRun.maxAttempts,
                error: failedRun.error,
                createdAt: failedRun.createdAt.toISOString()
              }))
            }
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "automation scheduler diagnostics failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load scheduler diagnostics");
      }
    }
  );

  app.get<{ Querystring: ListSchedulerDiagnosticsHistoryQuery }>(
    "/v1/automation/scheduler/diagnostics/history",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            reason: { type: "string", enum: ["startup", "interval"] },
            outcome: { type: "string", enum: ["processed", "idle", "contention", "error", "skipped-overlap"] },
            from: { type: "string", minLength: 1, maxLength: 64 },
            to: { type: "string", minLength: 1, maxLength: 64 },
            contentionOnly: { type: "boolean" },
            overlapOnly: { type: "boolean" }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 50;

      const from = request.query.from ? parseDateInput(request.query.from) : null;
      const to = request.query.to ? parseDateInput(request.query.to) : null;

      if (request.query.from && !from) {
        return sendError(reply, 400, "VALIDATION_ERROR", "from must be a valid ISO date-time");
      }

      if (request.query.to && !to) {
        return sendError(reply, 400, "VALIDATION_ERROR", "to must be a valid ISO date-time");
      }

      if (from && to && from.getTime() > to.getTime()) {
        return sendError(reply, 400, "VALIDATION_ERROR", "from must be <= to");
      }

      try {
        const where: Prisma.AutomationSchedulerTickEventWhereInput = {
          ...(request.query.reason ? { reason: request.query.reason } : {}),
          ...(request.query.outcome ? { outcome: request.query.outcome } : {}),
          ...(request.query.contentionOnly ? { isContention: true } : {}),
          ...(request.query.overlapOnly ? { isOverlapSkip: true } : {}),
          ...(from || to
            ? {
                tickedAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {})
                }
              }
            : {})
        };

        const [total, ticks] = await prisma.$transaction([
          prisma.automationSchedulerTickEvent.count({ where }),
          prisma.automationSchedulerTickEvent.findMany({
            where,
            orderBy: [{ tickedAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit
          })
        ]);

        return reply.send({
          data: ticks.map(toSchedulerTickHistoryResponse),
          meta: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "automation scheduler diagnostics history failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load diagnostics history");
      }
    }
  );

  app.get<{ Querystring: ListAutomationAlertsQuery }>(
    "/v1/automation/alerts",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            status: { type: "string", enum: ["OPEN", "ACKNOWLEDGED"] },
            type: {
              type: "string",
              enum: ["DEAD_LETTER_GROWTH", "FAILURE_RATE", "CONSECUTIVE_FAILURES", "LOCK_CONTENTION_SPIKE"]
            },
            from: { type: "string", minLength: 1, maxLength: 64 },
            to: { type: "string", minLength: 1, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 50;

      const from = request.query.from ? parseDateInput(request.query.from) : null;
      const to = request.query.to ? parseDateInput(request.query.to) : null;

      if (request.query.from && !from) {
        return sendError(reply, 400, "VALIDATION_ERROR", "from must be a valid ISO date-time");
      }

      if (request.query.to && !to) {
        return sendError(reply, 400, "VALIDATION_ERROR", "to must be a valid ISO date-time");
      }

      if (from && to && from.getTime() > to.getTime()) {
        return sendError(reply, 400, "VALIDATION_ERROR", "from must be <= to");
      }

      try {
        const where: Prisma.AutomationAlertEventWhereInput = {
          OR: [{ ownerId: owner.id }, { ownerId: null }],
          ...(request.query.status ? { status: request.query.status } : {}),
          ...(request.query.type ? { type: request.query.type } : {}),
          ...(from || to
            ? {
                createdAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {})
                }
              }
            : {})
        };

        const [total, alerts] = await prisma.$transaction([
          prisma.automationAlertEvent.count({ where }),
          prisma.automationAlertEvent.findMany({
            where,
            orderBy: [{ createdAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit
          })
        ]);

        return reply.send({
          data: alerts.map(toAutomationAlertResponse),
          meta: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "automation alert list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load automation alerts");
      }
    }
  );

  app.post<{ Params: AutomationAlertParams; Body: AckAutomationAlertBody }>(
    "/v1/automation/alerts/:id/ack",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            note: { type: "string", minLength: 1, maxLength: 500 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const existing = await prisma.automationAlertEvent.findFirst({
          where: {
            id: request.params.id,
            OR: [{ ownerId: owner.id }, { ownerId: null }]
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Automation alert not found");
        }

        if (existing.status === AutomationAlertStatus.ACKNOWLEDGED) {
          return reply.send({ data: toAutomationAlertResponse(existing) });
        }

        const note = normalizeOptionalNote(request.body?.note);
        const metadataObject: Record<string, unknown> =
          existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
            ? { ...(existing.metadata as Record<string, unknown>) }
            : {};

        if (note) {
          metadataObject.ackNote = note;
        }

        const updated = await prisma.automationAlertEvent.update({
          where: {
            id: existing.id
          },
          data: {
            status: AutomationAlertStatus.ACKNOWLEDGED,
            acknowledgedAt: new Date(),
            acknowledgedByUserId: owner.id,
            metadata: metadataObject as Prisma.InputJsonObject
          }
        });

        return reply.send({ data: toAutomationAlertResponse(updated) });
      } catch (error) {
        app.log.error({ err: error }, "automation alert ack failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to acknowledge automation alert");
      }
    }
  );

  app.get<{ Querystring: ListDlqJobsQuery }>(
    "/v1/automation/dlq/jobs",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            acknowledged: { type: "boolean" }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const projectId = request.query.projectId?.trim();

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      try {
        const where: Prisma.ScheduledJobWhereInput = {
          status: ScheduledJobStatus.DEAD_LETTER,
          project: {
            ownerId: owner.id,
            ...(projectId ? { id: projectId } : {})
          },
          ...(request.query.acknowledged === undefined
            ? {}
            : request.query.acknowledged
              ? { deadLetterAcknowledgedAt: { not: null } }
              : { deadLetterAcknowledgedAt: null })
        };

        const [total, jobs] = await prisma.$transaction([
          prisma.scheduledJob.count({ where }),
          prisma.scheduledJob.findMany({
            where,
            include: {
              project: {
                select: automationJobProjectSelect
              }
            },
            orderBy: [{ deadLetteredAt: "desc" }, { updatedAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit
          })
        ]);

        return reply.send({
          data: jobs.map((job) => toAutomationJobResponse(job)),
          meta: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "automation dlq job list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load DLQ jobs");
      }
    }
  );

  app.get<{ Querystring: ListDlqRunsQuery }>(
    "/v1/automation/dlq/runs",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            jobId: { type: "string", minLength: 1, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const projectId = request.query.projectId?.trim();
      const jobId = request.query.jobId?.trim();

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      if (request.query.jobId !== undefined && !jobId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "jobId cannot be empty");
      }

      try {
        const where: Prisma.JobRunWhereInput = {
          status: JobStatus.FAILED,
          scheduledJob: {
            status: ScheduledJobStatus.DEAD_LETTER,
            project: {
              ownerId: owner.id,
              ...(projectId ? { id: projectId } : {})
            },
            ...(jobId ? { id: jobId } : {})
          }
        };

        const [total, runs] = await prisma.$transaction([
          prisma.jobRun.count({ where }),
          prisma.jobRun.findMany({
            where,
            include: jobRunInclude,
            orderBy: [{ createdAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit
          })
        ]);

        return reply.send({
          data: runs.map(toJobRunResponse),
          meta: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "automation dlq run list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load DLQ runs");
      }
    }
  );

  app.post<{ Params: DlqJobActionParams; Body: DlqAcknowledgeBody }>(
    "/v1/automation/dlq/jobs/:id/ack",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            note: { type: "string", minLength: 1, maxLength: 500 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const existing = await prisma.scheduledJob.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: automationJobProjectSelect
            }
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "DLQ job not found");
        }

        if (existing.status !== ScheduledJobStatus.DEAD_LETTER) {
          return sendError(reply, 409, "CONFLICT", "Job is not currently in DEAD_LETTER status");
        }

        if (existing.deadLetterAcknowledgedAt) {
          return reply.send({ data: { alreadyAcknowledged: true, job: toAutomationJobResponse(existing) } });
        }

        const acknowledgedAt = new Date();
        const note = normalizeOptionalNote(request.body?.note);

        const updated = await prisma.$transaction(async (tx) => {
          const job = await tx.scheduledJob.update({
            where: {
              id: existing.id
            },
            data: {
              deadLetterAcknowledgedAt: acknowledgedAt,
              deadLetterAcknowledgedByUserId: owner.id
            },
            include: {
              project: {
                select: automationJobProjectSelect
              }
            }
          });

          await tx.automationDlqEvent.create({
            data: {
              ownerId: owner.id,
              projectId: job.projectId,
              scheduledJobId: job.id,
              action: AutomationDlqAction.ACKNOWLEDGED,
              note,
              metadata: {
                deadLetteredAt: job.deadLetteredAt?.toISOString() ?? null
              },
              performedByUserId: owner.id
            }
          });

          return job;
        });

        return reply.send({ data: { alreadyAcknowledged: false, job: toAutomationJobResponse(updated) } });
      } catch (error) {
        app.log.error({ err: error }, "automation dlq ack failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to acknowledge DLQ job");
      }
    }
  );

  app.post<{ Params: DlqJobActionParams; Body: DlqRequeueBody }>(
    "/v1/automation/dlq/jobs/:id/requeue",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            recomputeFrom: { type: "string", minLength: 1, maxLength: 64 },
            note: { type: "string", minLength: 1, maxLength: 500 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const recomputeFrom = request.body?.recomputeFrom ? parseDateInput(request.body.recomputeFrom) : new Date();
      if (request.body?.recomputeFrom && !recomputeFrom) {
        return sendError(reply, 400, "VALIDATION_ERROR", "recomputeFrom must be a valid ISO date-time");
      }

      try {
        const existing = await prisma.scheduledJob.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: automationJobProjectSelect
            }
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "DLQ job not found");
        }

        if (existing.status === ScheduledJobStatus.ACTIVE && existing.deadLetteredAt === null) {
          return reply.send({ data: { alreadyRequeued: true, job: toAutomationJobResponse(existing) } });
        }

        if (existing.status !== ScheduledJobStatus.DEAD_LETTER) {
          return sendError(reply, 409, "CONFLICT", "Job is not currently in DEAD_LETTER status");
        }

        const note = normalizeOptionalNote(request.body?.note);

        const updated = await prisma.$transaction(async (tx) => {
          const job = await tx.scheduledJob.update({
            where: {
              id: existing.id
            },
            data: {
              status: ScheduledJobStatus.ACTIVE,
              deadLetteredAt: null,
              deadLetterAcknowledgedAt: null,
              deadLetterAcknowledgedByUserId: null,
              retryScheduledFor: null,
              retryAttempt: null,
              retryFromRunId: null,
              lastError: null,
              consecutiveFailures: 0,
              nextRunAt: computeNextRunAt(buildScheduleInput(existing), recomputeFrom!)
            },
            include: {
              project: {
                select: automationJobProjectSelect
              }
            }
          });

          await tx.automationDlqEvent.create({
            data: {
              ownerId: owner.id,
              projectId: job.projectId,
              scheduledJobId: job.id,
              action: AutomationDlqAction.REQUEUED,
              note,
              metadata: {
                recomputeFrom: recomputeFrom!.toISOString()
              },
              performedByUserId: owner.id
            }
          });

          return job;
        });

        return reply.send({ data: { alreadyRequeued: false, job: toAutomationJobResponse(updated) } });
      } catch (error) {
        app.log.error({ err: error }, "automation dlq requeue failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to requeue DLQ job");
      }
    }
  );

  app.post<{ Params: DlqJobActionParams; Body: DlqRetryNowBody }>(
    "/v1/automation/dlq/jobs/:id/retry-now",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            note: { type: "string", minLength: 1, maxLength: 500 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const note = normalizeOptionalNote(request.body?.note);
      const runRequestedAt = new Date();

      try {
        const claimed = await prisma.$transaction(async (tx) => {
          const current = await tx.scheduledJob.findFirst({
            where: {
              id: request.params.id,
              project: {
                ownerId: owner.id
              }
            },
            include: {
              project: {
                select: automationJobProjectSelect
              }
            }
          });

          if (!current) {
            return { kind: "not-found" as const };
          }

          if (current.status === ScheduledJobStatus.ACTIVE && current.deadLetteredAt === null) {
            return {
              kind: "already-active" as const,
              job: current
            };
          }

          if (current.status !== ScheduledJobStatus.DEAD_LETTER) {
            return {
              kind: "invalid-status" as const,
              status: current.status
            };
          }

          const updated = await tx.scheduledJob.update({
            where: {
              id: current.id
            },
            data: {
              status: ScheduledJobStatus.ACTIVE,
              deadLetteredAt: null,
              deadLetterAcknowledgedAt: null,
              deadLetterAcknowledgedByUserId: null,
              retryScheduledFor: null,
              retryAttempt: null,
              retryFromRunId: null,
              lastError: null,
              consecutiveFailures: 0,
              nextRunAt: computeNextRunAt(buildScheduleInput(current), runRequestedAt)
            },
            include: {
              project: {
                select: automationJobProjectSelect
              }
            }
          });

          return {
            kind: "claimed" as const,
            job: updated
          };
        });

        if (claimed.kind === "not-found") {
          return sendError(reply, 404, "NOT_FOUND", "DLQ job not found");
        }

        if (claimed.kind === "invalid-status") {
          return sendError(reply, 409, "CONFLICT", `Job is not retryable from status=${claimed.status}`);
        }

        if (claimed.kind === "already-active") {
          let lastRun: JobRunWithRelations | null = null;

          if (claimed.job.lastRunId) {
            lastRun = await prisma.jobRun.findFirst({
              where: {
                id: claimed.job.lastRunId,
                project: {
                  ownerId: owner.id
                }
              },
              include: jobRunInclude
            });
          }

          return reply.send({
            data: {
              alreadyRetried: true,
              job: toAutomationJobResponse(claimed.job),
              run: lastRun ? toJobRunResponse(lastRun) : null
            }
          });
        }

        const run = await executeScheduledJob(claimed.job, JobTrigger.MANUAL, runRequestedAt);

        await prisma.automationDlqEvent.create({
          data: {
            ownerId: owner.id,
            projectId: claimed.job.projectId,
            scheduledJobId: claimed.job.id,
            jobRunId: run.id,
            action: AutomationDlqAction.RETRIED_NOW,
            note,
            metadata: {
              runStatus: run.status,
              runRequestedAt: runRequestedAt.toISOString()
            },
            performedByUserId: owner.id
          }
        });

        const refreshedJob = await prisma.scheduledJob.findFirst({
          where: {
            id: claimed.job.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: automationJobProjectSelect
            }
          }
        });

        return reply.send({
          data: {
            alreadyRetried: false,
            job: refreshedJob ? toAutomationJobResponse(refreshedJob) : toAutomationJobResponse(claimed.job),
            run: toJobRunResponse(run)
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "automation dlq retry-now failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to retry DLQ job now");
      }
    }
  );

  app.post<{ Body: DlqBulkActionBody }>(
    "/v1/automation/dlq/jobs/bulk/ack",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["jobIds"],
          properties: {
            jobIds: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: { type: "string", minLength: 1, maxLength: 64 }
            },
            note: { type: "string", minLength: 1, maxLength: 500 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const note = normalizeOptionalNote(request.body?.note);
      const parsedIds = normalizeBulkJobIds(request.body.jobIds);
      const results: DlqBulkActionResultItem[] = [];

      for (const rawInvalidId of parsedIds.invalidIds) {
        results.push({
          jobId: rawInvalidId,
          ok: false,
          code: "VALIDATION_ERROR",
          message: "jobId cannot be empty"
        });
      }

      for (const duplicateId of parsedIds.duplicates) {
        results.push({
          jobId: duplicateId,
          ok: false,
          code: "DUPLICATE_JOB_ID",
          message: "jobId is duplicated in request"
        });
      }

      for (const jobId of parsedIds.normalized) {
        try {
          const existing = await prisma.scheduledJob.findFirst({
            where: {
              id: jobId,
              project: {
                ownerId: owner.id
              }
            },
            include: {
              project: {
                select: automationJobProjectSelect
              }
            }
          });

          if (!existing) {
            results.push({
              jobId,
              ok: false,
              code: "NOT_FOUND",
              message: "DLQ job not found"
            });
            continue;
          }

          if (existing.status !== ScheduledJobStatus.DEAD_LETTER) {
            results.push({
              jobId,
              ok: false,
              code: "INVALID_STATUS",
              message: `Job is not currently in DEAD_LETTER status (status=${existing.status})`
            });
            continue;
          }

          if (existing.deadLetterAcknowledgedAt) {
            results.push({
              jobId,
              ok: true,
              alreadyAcknowledged: true,
              job: toAutomationJobResponse(existing)
            });
            continue;
          }

          const acknowledgedAt = new Date();

          const updated = await prisma.$transaction(async (tx) => {
            const job = await tx.scheduledJob.update({
              where: {
                id: existing.id
              },
              data: {
                deadLetterAcknowledgedAt: acknowledgedAt,
                deadLetterAcknowledgedByUserId: owner.id
              },
              include: {
                project: {
                  select: automationJobProjectSelect
                }
              }
            });

            await tx.automationDlqEvent.create({
              data: {
                ownerId: owner.id,
                projectId: job.projectId,
                scheduledJobId: job.id,
                action: AutomationDlqAction.ACKNOWLEDGED,
                note,
                metadata: {
                  deadLetteredAt: job.deadLetteredAt?.toISOString() ?? null
                },
                performedByUserId: owner.id
              }
            });

            return job;
          });

          results.push({
            jobId,
            ok: true,
            alreadyAcknowledged: false,
            job: toAutomationJobResponse(updated)
          });
        } catch (error) {
          app.log.error({ err: error, jobId }, "automation dlq bulk ack item failed");
          results.push({
            jobId,
            ok: false,
            code: "INTERNAL_ERROR",
            message: "Failed to acknowledge DLQ job"
          });
        }
      }

      return reply.send({
        data: toBulkDlqActionResponse("ack", request.body.jobIds.length, results)
      });
    }
  );

  app.post<{ Body: DlqBulkActionBody }>(
    "/v1/automation/dlq/jobs/bulk/requeue",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["jobIds"],
          properties: {
            jobIds: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: { type: "string", minLength: 1, maxLength: 64 }
            },
            recomputeFrom: { type: "string", minLength: 1, maxLength: 64 },
            note: { type: "string", minLength: 1, maxLength: 500 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const note = normalizeOptionalNote(request.body?.note);
      const recomputeFrom = request.body?.recomputeFrom ? parseDateInput(request.body.recomputeFrom) : new Date();
      if (request.body?.recomputeFrom && !recomputeFrom) {
        return sendError(reply, 400, "VALIDATION_ERROR", "recomputeFrom must be a valid ISO date-time");
      }

      const parsedIds = normalizeBulkJobIds(request.body.jobIds);
      const results: DlqBulkActionResultItem[] = [];

      for (const rawInvalidId of parsedIds.invalidIds) {
        results.push({
          jobId: rawInvalidId,
          ok: false,
          code: "VALIDATION_ERROR",
          message: "jobId cannot be empty"
        });
      }

      for (const duplicateId of parsedIds.duplicates) {
        results.push({
          jobId: duplicateId,
          ok: false,
          code: "DUPLICATE_JOB_ID",
          message: "jobId is duplicated in request"
        });
      }

      for (const jobId of parsedIds.normalized) {
        try {
          const existing = await prisma.scheduledJob.findFirst({
            where: {
              id: jobId,
              project: {
                ownerId: owner.id
              }
            },
            include: {
              project: {
                select: automationJobProjectSelect
              }
            }
          });

          if (!existing) {
            results.push({
              jobId,
              ok: false,
              code: "NOT_FOUND",
              message: "DLQ job not found"
            });
            continue;
          }

          if (existing.status === ScheduledJobStatus.ACTIVE && existing.deadLetteredAt === null) {
            results.push({
              jobId,
              ok: true,
              alreadyRequeued: true,
              job: toAutomationJobResponse(existing)
            });
            continue;
          }

          if (existing.status !== ScheduledJobStatus.DEAD_LETTER) {
            results.push({
              jobId,
              ok: false,
              code: "INVALID_STATUS",
              message: `Job is not currently in DEAD_LETTER status (status=${existing.status})`
            });
            continue;
          }

          const updated = await prisma.$transaction(async (tx) => {
            const job = await tx.scheduledJob.update({
              where: {
                id: existing.id
              },
              data: {
                status: ScheduledJobStatus.ACTIVE,
                deadLetteredAt: null,
                deadLetterAcknowledgedAt: null,
                deadLetterAcknowledgedByUserId: null,
                retryScheduledFor: null,
                retryAttempt: null,
                retryFromRunId: null,
                lastError: null,
                consecutiveFailures: 0,
                nextRunAt: computeNextRunAt(buildScheduleInput(existing), recomputeFrom!)
              },
              include: {
                project: {
                  select: automationJobProjectSelect
                }
              }
            });

            await tx.automationDlqEvent.create({
              data: {
                ownerId: owner.id,
                projectId: job.projectId,
                scheduledJobId: job.id,
                action: AutomationDlqAction.REQUEUED,
                note,
                metadata: {
                  recomputeFrom: recomputeFrom!.toISOString()
                },
                performedByUserId: owner.id
              }
            });

            return job;
          });

          results.push({
            jobId,
            ok: true,
            alreadyRequeued: false,
            job: toAutomationJobResponse(updated)
          });
        } catch (error) {
          app.log.error({ err: error, jobId }, "automation dlq bulk requeue item failed");
          results.push({
            jobId,
            ok: false,
            code: "INTERNAL_ERROR",
            message: "Failed to requeue DLQ job"
          });
        }
      }

      return reply.send({
        data: toBulkDlqActionResponse("requeue", request.body.jobIds.length, results)
      });
    }
  );

  app.post<{ Body: DlqBulkActionBody }>(
    "/v1/automation/dlq/jobs/bulk/retry-now",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["jobIds"],
          properties: {
            jobIds: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: { type: "string", minLength: 1, maxLength: 64 }
            },
            note: { type: "string", minLength: 1, maxLength: 500 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const note = normalizeOptionalNote(request.body?.note);
      const parsedIds = normalizeBulkJobIds(request.body.jobIds);
      const results: DlqBulkActionResultItem[] = [];

      for (const rawInvalidId of parsedIds.invalidIds) {
        results.push({
          jobId: rawInvalidId,
          ok: false,
          code: "VALIDATION_ERROR",
          message: "jobId cannot be empty"
        });
      }

      for (const duplicateId of parsedIds.duplicates) {
        results.push({
          jobId: duplicateId,
          ok: false,
          code: "DUPLICATE_JOB_ID",
          message: "jobId is duplicated in request"
        });
      }

      for (const jobId of parsedIds.normalized) {
        try {
          const runRequestedAt = new Date();

          const claimed = await prisma.$transaction(async (tx) => {
            const current = await tx.scheduledJob.findFirst({
              where: {
                id: jobId,
                project: {
                  ownerId: owner.id
                }
              },
              include: {
                project: {
                  select: automationJobProjectSelect
                }
              }
            });

            if (!current) {
              return { kind: "not-found" as const };
            }

            if (current.status === ScheduledJobStatus.ACTIVE && current.deadLetteredAt === null) {
              return {
                kind: "already-active" as const,
                job: current
              };
            }

            if (current.status !== ScheduledJobStatus.DEAD_LETTER) {
              return {
                kind: "invalid-status" as const,
                status: current.status
              };
            }

            const updated = await tx.scheduledJob.update({
              where: {
                id: current.id
              },
              data: {
                status: ScheduledJobStatus.ACTIVE,
                deadLetteredAt: null,
                deadLetterAcknowledgedAt: null,
                deadLetterAcknowledgedByUserId: null,
                retryScheduledFor: null,
                retryAttempt: null,
                retryFromRunId: null,
                lastError: null,
                consecutiveFailures: 0,
                nextRunAt: computeNextRunAt(buildScheduleInput(current), runRequestedAt)
              },
              include: {
                project: {
                  select: automationJobProjectSelect
                }
              }
            });

            return {
              kind: "claimed" as const,
              job: updated
            };
          });

          if (claimed.kind === "not-found") {
            results.push({
              jobId,
              ok: false,
              code: "NOT_FOUND",
              message: "DLQ job not found"
            });
            continue;
          }

          if (claimed.kind === "invalid-status") {
            results.push({
              jobId,
              ok: false,
              code: "INVALID_STATUS",
              message: `Job is not retryable from status=${claimed.status}`
            });
            continue;
          }

          if (claimed.kind === "already-active") {
            let lastRun: JobRunWithRelations | null = null;

            if (claimed.job.lastRunId) {
              lastRun = await prisma.jobRun.findFirst({
                where: {
                  id: claimed.job.lastRunId,
                  project: {
                    ownerId: owner.id
                  }
                },
                include: jobRunInclude
              });
            }

            results.push({
              jobId,
              ok: true,
              alreadyRetried: true,
              job: toAutomationJobResponse(claimed.job),
              run: lastRun ? toJobRunResponse(lastRun) : null
            });
            continue;
          }

          const run = await executeScheduledJob(claimed.job, JobTrigger.MANUAL, runRequestedAt);

          await prisma.automationDlqEvent.create({
            data: {
              ownerId: owner.id,
              projectId: claimed.job.projectId,
              scheduledJobId: claimed.job.id,
              jobRunId: run.id,
              action: AutomationDlqAction.RETRIED_NOW,
              note,
              metadata: {
                runStatus: run.status,
                runRequestedAt: runRequestedAt.toISOString()
              },
              performedByUserId: owner.id
            }
          });

          const refreshedJob = await prisma.scheduledJob.findFirst({
            where: {
              id: claimed.job.id,
              project: {
                ownerId: owner.id
              }
            },
            include: {
              project: {
                select: automationJobProjectSelect
              }
            }
          });

          results.push({
            jobId,
            ok: true,
            alreadyRetried: false,
            job: refreshedJob ? toAutomationJobResponse(refreshedJob) : toAutomationJobResponse(claimed.job),
            run: toJobRunResponse(run)
          });
        } catch (error) {
          app.log.error({ err: error, jobId }, "automation dlq bulk retry-now item failed");
          results.push({
            jobId,
            ok: false,
            code: "INTERNAL_ERROR",
            message: "Failed to retry DLQ job now"
          });
        }
      }

      return reply.send({
        data: toBulkDlqActionResponse("retry-now", request.body.jobIds.length, results)
      });
    }
  );

  app.get<{ Params: AutomationJobParams }>(
    "/v1/automation/jobs/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const job = await prisma.scheduledJob.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: automationJobProjectSelect
            }
          }
        });

        if (!job) {
          return sendError(reply, 404, "NOT_FOUND", "Automation job not found");
        }

        return reply.send({ data: toAutomationJobResponse(job) });
      } catch (error) {
        app.log.error({ err: error }, "automation job get failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load automation job");
      }
    }
  );

  app.patch<{ Params: AutomationJobParams; Body: UpdateAutomationJobBody }>(
    "/v1/automation/jobs/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            type: { type: "string", enum: ["ANALYTICS_SNAPSHOT", "ANALYTICS_EXPORT"] },
            cadence: { type: "string", enum: ["DAILY", "WEEKLY"] },
            dayOfWeek: { type: ["integer", "null"], minimum: 0, maximum: 6 },
            runAtHour: { type: "integer", minimum: 0, maximum: 23 },
            runAtMinute: { type: "integer", minimum: 0, maximum: 59 },
            timezone: { type: "string", minLength: 1, maxLength: 80 },
            status: { type: "string", enum: ["ACTIVE", "PAUSED", "DEAD_LETTER"] },
            catchUpMode: { type: "string", enum: ["skip-missed", "replay-missed"] },
            dstAmbiguousTimePolicy: { type: "string", enum: ["earlier-offset", "later-offset"] },
            dstInvalidTimePolicy: { type: "string", enum: ["shift-forward", "skip"] },
            retryMaxAttempts: { type: "integer", minimum: 1, maximum: 10 },
            retryBackoffSeconds: { type: "integer", minimum: 1, maximum: 86400 },
            retryMaxBackoffSeconds: { type: "integer", minimum: 1, maximum: 86400 },
            config: { type: ["object", "null"], additionalProperties: true },
            recomputeFrom: { type: "string", minLength: 1, maxLength: 64 }
          },
          anyOf: [
            { required: ["name"] },
            { required: ["type"] },
            { required: ["cadence"] },
            { required: ["dayOfWeek"] },
            { required: ["runAtHour"] },
            { required: ["runAtMinute"] },
            { required: ["timezone"] },
            { required: ["status"] },
            { required: ["catchUpMode"] },
            { required: ["dstAmbiguousTimePolicy"] },
            { required: ["dstInvalidTimePolicy"] },
            { required: ["retryMaxAttempts"] },
            { required: ["retryBackoffSeconds"] },
            { required: ["retryMaxBackoffSeconds"] },
            { required: ["config"] },
            { required: ["recomputeFrom"] }
          ]
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const existing = await prisma.scheduledJob.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: automationJobProjectSelect
            }
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Automation job not found");
        }

        const nextType = normalizeAutomationJobType(request.body.type ?? existing.type);
        if (!nextType) {
          return sendError(reply, 400, "VALIDATION_ERROR", "type must be ANALYTICS_SNAPSHOT or ANALYTICS_EXPORT");
        }

        const nextCadence = request.body.cadence ?? existing.cadence;
        const nextDayOfWeek =
          nextCadence === ScheduledJobCadence.DAILY
            ? null
            : normalizeDayOfWeek(request.body.dayOfWeek ?? existing.dayOfWeek);

        if (nextCadence === ScheduledJobCadence.WEEKLY && nextDayOfWeek === null) {
          return sendError(reply, 400, "VALIDATION_ERROR", "dayOfWeek is required when cadence=WEEKLY");
        }

        const nextRunAtHour = request.body.runAtHour ?? existing.runAtHour;
        const nextRunAtMinute = request.body.runAtMinute ?? existing.runAtMinute;

        const nextName = request.body.name?.trim() ?? existing.name;
        if (!nextName) {
          return sendError(reply, 400, "VALIDATION_ERROR", "name cannot be empty");
        }

        const nextTimezone = request.body.timezone?.trim() ?? existing.timezone;
        if (!nextTimezone) {
          return sendError(reply, 400, "VALIDATION_ERROR", "timezone cannot be empty");
        }

        if (!isValidTimeZone(nextTimezone)) {
          return sendError(reply, 400, "VALIDATION_ERROR", "timezone must be a valid IANA timezone (for example: UTC, America/New_York)");
        }

        const nextStatus = request.body.status ?? existing.status;

        const nextCatchUpMode =
          request.body.catchUpMode !== undefined ? normalizeCatchUpMode(request.body.catchUpMode) : existing.catchUpMode;
        if (!nextCatchUpMode) {
          return sendError(reply, 400, "VALIDATION_ERROR", "catchUpMode must be skip-missed or replay-missed");
        }

        const nextDstAmbiguousTimePolicy =
          request.body.dstAmbiguousTimePolicy !== undefined
            ? normalizeDstAmbiguousTimePolicy(request.body.dstAmbiguousTimePolicy)
            : existing.dstAmbiguousTimePolicy;
        if (!nextDstAmbiguousTimePolicy) {
          return sendError(reply, 400, "VALIDATION_ERROR", "dstAmbiguousTimePolicy must be earlier-offset or later-offset");
        }

        const nextDstInvalidTimePolicy =
          request.body.dstInvalidTimePolicy !== undefined
            ? normalizeDstInvalidTimePolicy(request.body.dstInvalidTimePolicy)
            : existing.dstInvalidTimePolicy;
        if (!nextDstInvalidTimePolicy) {
          return sendError(reply, 400, "VALIDATION_ERROR", "dstInvalidTimePolicy must be shift-forward or skip");
        }

        const retryPolicy = normalizeRetryPolicy({
          retryMaxAttempts: request.body.retryMaxAttempts ?? existing.retryMaxAttempts,
          retryBackoffSeconds: request.body.retryBackoffSeconds ?? existing.retryBackoffSeconds,
          retryMaxBackoffSeconds: request.body.retryMaxBackoffSeconds ?? existing.retryMaxBackoffSeconds
        });
        if (retryPolicy.error) {
          return sendError(reply, 400, "VALIDATION_ERROR", retryPolicy.error);
        }

        const normalizedConfig =
          request.body.config !== undefined
            ? normalizeJobConfig(nextType, request.body.config)
            : normalizeJobConfig(nextType, existing.config);

        if (normalizedConfig.error) {
          return sendError(reply, 400, "VALIDATION_ERROR", normalizedConfig.error);
        }

        const recomputeReference = request.body.recomputeFrom
          ? parseDateInput(request.body.recomputeFrom)
          : new Date();

        if (!recomputeReference) {
          return sendError(reply, 400, "VALIDATION_ERROR", "recomputeFrom must be a valid ISO date-time");
        }

        const shouldRecomputeNextRun =
          request.body.cadence !== undefined ||
          request.body.dayOfWeek !== undefined ||
          request.body.runAtHour !== undefined ||
          request.body.runAtMinute !== undefined ||
          request.body.timezone !== undefined ||
          request.body.status !== undefined ||
          request.body.dstAmbiguousTimePolicy !== undefined ||
          request.body.dstInvalidTimePolicy !== undefined ||
          request.body.recomputeFrom !== undefined;

        const updated = await prisma.scheduledJob.update({
          where: {
            id: existing.id
          },
          data: {
            name: nextName,
            type: nextType,
            cadence: nextCadence,
            dayOfWeek: nextDayOfWeek,
            runAtHour: nextRunAtHour,
            runAtMinute: nextRunAtMinute,
            timezone: nextTimezone,
            status: nextStatus,
            catchUpMode: nextCatchUpMode,
            dstAmbiguousTimePolicy: nextDstAmbiguousTimePolicy,
            dstInvalidTimePolicy: nextDstInvalidTimePolicy,
            retryMaxAttempts: retryPolicy.retryMaxAttempts,
            retryBackoffSeconds: retryPolicy.retryBackoffSeconds,
            retryMaxBackoffSeconds: retryPolicy.retryMaxBackoffSeconds,
            config: normalizedConfig.config ? (normalizedConfig.config as Prisma.InputJsonObject) : Prisma.DbNull,
            retryScheduledFor: nextStatus === ScheduledJobStatus.ACTIVE ? existing.retryScheduledFor : null,
            retryAttempt: nextStatus === ScheduledJobStatus.ACTIVE ? existing.retryAttempt : null,
            retryFromRunId: nextStatus === ScheduledJobStatus.ACTIVE ? existing.retryFromRunId : null,
            deadLetteredAt:
              nextStatus === ScheduledJobStatus.DEAD_LETTER
                ? existing.deadLetteredAt ?? new Date()
                : null,
            deadLetterAcknowledgedAt:
              nextStatus === ScheduledJobStatus.DEAD_LETTER
                ? existing.deadLetterAcknowledgedAt
                : null,
            deadLetterAcknowledgedByUserId:
              nextStatus === ScheduledJobStatus.DEAD_LETTER
                ? existing.deadLetterAcknowledgedByUserId
                : null,
            nextRunAt:
              nextStatus === ScheduledJobStatus.ACTIVE
                ? shouldRecomputeNextRun || existing.status === ScheduledJobStatus.DEAD_LETTER
                  ? computeNextRunAt(
                      {
                        cadence: nextCadence,
                        dayOfWeek: nextDayOfWeek,
                        runAtHour: nextRunAtHour,
                        runAtMinute: nextRunAtMinute,
                        timezone: nextTimezone,
                        dstAmbiguousTimePolicy: nextDstAmbiguousTimePolicy,
                        dstInvalidTimePolicy: nextDstInvalidTimePolicy
                      },
                      recomputeReference
                    )
                  : existing.nextRunAt
                : null
          },
          include: {
            project: {
              select: automationJobProjectSelect
            }
          }
        });

        return reply.send({ data: toAutomationJobResponse(updated) });
      } catch (error) {
        app.log.error({ err: error }, "automation job patch failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to update automation job");
      }
    }
  );

  app.delete<{ Params: AutomationJobParams }>(
    "/v1/automation/jobs/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const existing = await prisma.scheduledJob.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Automation job not found");
        }

        await prisma.scheduledJob.delete({
          where: {
            id: existing.id
          }
        });

        return reply.status(204).send();
      } catch (error) {
        app.log.error({ err: error }, "automation job delete failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to delete automation job");
      }
    }
  );

  app.post<{ Params: AutomationJobParams }>(
    "/v1/automation/jobs/:id/trigger",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const job = await prisma.scheduledJob.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: automationJobProjectSelect
            }
          }
        });

        if (!job) {
          return sendError(reply, 404, "NOT_FOUND", "Automation job not found");
        }

        const run = await executeScheduledJob(job, JobTrigger.MANUAL, new Date());
        return reply.send({ data: toJobRunResponse(run) });
      } catch (error) {
        app.log.error({ err: error }, "automation job trigger failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to trigger automation job");
      }
    }
  );

  app.get<{ Params: AutomationJobParams; Querystring: ListAutomationJobRunsQuery }>(
    "/v1/automation/jobs/:id/runs",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 }
          }
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;

      try {
        const job = await prisma.scheduledJob.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true
          }
        });

        if (!job) {
          return sendError(reply, 404, "NOT_FOUND", "Automation job not found");
        }

        const [total, runs] = await prisma.$transaction([
          prisma.jobRun.count({
            where: {
              scheduledJobId: job.id
            }
          }),
          prisma.jobRun.findMany({
            where: {
              scheduledJobId: job.id
            },
            include: jobRunInclude,
            orderBy: [{ createdAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit
          })
        ]);

        return reply.send({
          data: runs.map(toJobRunResponse),
          meta: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "automation job runs list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load automation job runs");
      }
    }
  );
}
