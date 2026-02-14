"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ProjectOption = {
  id: string;
  name: string;
  slug: string;
  timezone?: string;
};

type ApiError = {
  code: string;
  message: string;
};

type AutomationJobType = "ANALYTICS_SNAPSHOT" | "ANALYTICS_EXPORT";
type ScheduledJobCadence = "DAILY" | "WEEKLY";
type ScheduledJobStatus = "ACTIVE" | "PAUSED" | "DEAD_LETTER";
type CatchUpMode = "skip-missed" | "replay-missed";
type DstAmbiguousTimePolicy = "earlier-offset" | "later-offset";
type DstInvalidTimePolicy = "shift-forward" | "skip";
type ExportDataset = "kpis" | "contentTasks" | "backlinkOpportunities" | "internalLinks";
type ExportFormat = "json" | "csv";

type AutomationJob = {
  id: string;
  projectId: string;
  project: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  name: string;
  type: AutomationJobType;
  cadence: ScheduledJobCadence;
  dayOfWeek: number | null;
  runAtHour: number;
  runAtMinute: number;
  timezone: string;
  status: ScheduledJobStatus;
  catchUpMode: CatchUpMode;
  dstAmbiguousTimePolicy: DstAmbiguousTimePolicy;
  dstInvalidTimePolicy: DstInvalidTimePolicy;
  retryPolicy: {
    maxAttempts: number;
    backoffSeconds: number;
    maxBackoffSeconds: number;
  };
  retryState: {
    scheduledFor: string | null;
    nextAttemptNumber: number | null;
    retryFromRunId: string | null;
  };
  health: {
    totalRuns: number;
    successCount: number;
    failureCount: number;
    successRate: number | null;
    consecutiveFailures: number;
    lastError: string | null;
    deadLetteredAt: string | null;
  };
  config: Record<string, unknown> | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunId: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type JobRun = {
  id: string;
  scheduledJobId: string | null;
  projectId: string;
  type: string;
  status: string;
  trigger: string;
  scheduledFor: string | null;
  attemptNumber: number;
  maxAttempts: number;
  retryOfRunId: string | null;
  retryBackoffSeconds: number | null;
  nextRetryAt: string | null;
  outputSummary: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

type SchedulerDiagnostics = {
  scheduler: {
    enabled: boolean;
    intervalMs: number;
    batchLimit: number;
    lockLeaseMs: number;
    startedAt: string | null;
    runningTick: boolean;
    lastTickAt: string | null;
    lastTickOutcome: string | null;
    overlapSkips: number;
    contentionCount: number;
    totalRunsProcessed: number;
    recentTicks: Array<{
      at: string;
      reason: string;
      outcome: string;
      durationMs: number;
      processed: number;
      remainingDue: number;
      error: string | null;
    }>;
  };
  lock: {
    isLocked: boolean;
    lockedUntil: string | null;
    ownerTokenHint: string | null;
  };
  owner: {
    activeJobs: number;
    dueNow: number;
    retryingJobs: number;
    deadLetterJobs: number;
    openAlerts: number;
    runStats: {
      total: number;
      success: number;
      failed: number;
      running: number;
      successRate: number | null;
    };
    trends: {
      deadLetter: {
        windowHours: number;
        currentWindowCount: number;
        previousWindowCount: number;
        delta: number;
      };
      contention: {
        windowMinutes: number;
        currentWindowCount: number;
        previousWindowCount: number;
        delta: number;
      };
      failures: {
        windowMinutes: number;
        currentWindowCount: number;
        previousWindowCount: number;
        delta: number;
      };
    };
    delivery: {
      windowHours: number;
      totalAttempts: number;
      successCount: number;
      failureCount: number;
      skippedCount: number;
      successRate: number | null;
      lastAttemptAt: string | null;
      lastError: string | null;
    };
    recentFailures: Array<{
      id: string;
      error: string | null;
      attemptNumber: number;
      maxAttempts: number;
      createdAt: string;
    }>;
  };
};

type SchedulerDiagnosticsHistoryItem = {
  id: string;
  reason: string;
  outcome: string;
  durationMs: number;
  processed: number;
  remainingDue: number;
  error: string | null;
  contention: boolean;
  overlapSkip: boolean;
  tickedAt: string;
};

type AutomationAlertEvent = {
  id: string;
  type: string;
  severity: string;
  status: "OPEN" | "ACKNOWLEDGED";
  title: string;
  message: string;
  thresholdValue: number | null;
  observedValue: number | null;
  delivery?: {
    provider: string;
    status: "SENT" | "FAILED" | "SKIPPED";
    attemptedAt: string | null;
    lastError: string | null;
  } | null;
  acknowledgedAt: string | null;
  createdAt: string;
};

type DlqActionResult = {
  alreadyAcknowledged?: boolean;
  alreadyRequeued?: boolean;
  alreadyRetried?: boolean;
  job?: AutomationJob;
  run?: JobRun | null;
};

type ListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ListJobsResponse = {
  data?: AutomationJob[];
  meta?: ListMeta;
  error?: ApiError;
};

type SingleJobResponse = {
  data?: AutomationJob;
  error?: ApiError;
};

type ListRunsResponse = {
  data?: JobRun[];
  meta?: ListMeta;
  error?: ApiError;
};

type TriggerRunResponse = {
  data?: JobRun;
  error?: ApiError;
};

type ProcessDueResponse = {
  data?: {
    now: string;
    processed: number;
    remainingDue: number;
  };
  error?: ApiError;
};

type SchedulerDiagnosticsResponse = {
  data?: SchedulerDiagnostics;
  error?: ApiError;
};

type SchedulerDiagnosticsHistoryResponse = {
  data?: SchedulerDiagnosticsHistoryItem[];
  meta?: ListMeta;
  error?: ApiError;
};

type AutomationAlertsResponse = {
  data?: AutomationAlertEvent[];
  meta?: ListMeta;
  error?: ApiError;
};

type DlqJobsResponse = {
  data?: AutomationJob[];
  meta?: ListMeta;
  error?: ApiError;
};

type DlqActionResponse = {
  data?: DlqActionResult;
  error?: ApiError;
};

type DlqBulkActionResult = {
  jobId: string;
  ok: boolean;
  alreadyAcknowledged?: boolean;
  alreadyRequeued?: boolean;
  alreadyRetried?: boolean;
  code?: string;
  message?: string;
};

type DlqBulkActionResponse = {
  data?: {
    action: "ack" | "requeue" | "retry-now";
    requested: number;
    succeeded: number;
    failed: number;
    results: DlqBulkActionResult[];
  };
  error?: ApiError;
};

type Props = {
  token: string | null;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
  projects: ProjectOption[];
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function parseJson<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readConfigNumber(config: Record<string, unknown> | null, key: string): number | null {
  const value = config?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function readConfigString(config: Record<string, unknown> | null, key: string): string {
  const value = config?.[key];
  return typeof value === "string" ? value : "";
}

export function Phase11AutomationPanel({ token, authFetch, projects }: Props) {
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [jobsMeta, setJobsMeta] = useState<ListMeta>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AutomationJobType>("ANALYTICS_SNAPSHOT");
  const [cadence, setCadence] = useState<ScheduledJobCadence>("DAILY");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [runAtHour, setRunAtHour] = useState("9");
  const [runAtMinute, setRunAtMinute] = useState("0");
  const [timezone, setTimezone] = useState("UTC");
  const [status, setStatus] = useState<ScheduledJobStatus>("ACTIVE");
  const [catchUpMode, setCatchUpMode] = useState<CatchUpMode>("skip-missed");
  const [dstAmbiguousTimePolicy, setDstAmbiguousTimePolicy] = useState<DstAmbiguousTimePolicy>("earlier-offset");
  const [dstInvalidTimePolicy, setDstInvalidTimePolicy] = useState<DstInvalidTimePolicy>("shift-forward");
  const [retryMaxAttempts, setRetryMaxAttempts] = useState("3");
  const [retryBackoffSeconds, setRetryBackoffSeconds] = useState("60");
  const [retryMaxBackoffSeconds, setRetryMaxBackoffSeconds] = useState("900");

  const [windowDays, setWindowDays] = useState("7");
  const [exportDataset, setExportDataset] = useState<ExportDataset>("kpis");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [exportLimit, setExportLimit] = useState("200");

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const [processDueLoading, setProcessDueLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SchedulerDiagnostics | null>(null);
  const [diagnosticsHistory, setDiagnosticsHistory] = useState<SchedulerDiagnosticsHistoryItem[]>([]);
  const [automationAlerts, setAutomationAlerts] = useState<AutomationAlertEvent[]>([]);
  const [dlqJobs, setDlqJobs] = useState<AutomationJob[]>([]);
  const [selectedDlqJobIds, setSelectedDlqJobIds] = useState<string[]>([]);
  const [bulkDlqLoading, setBulkDlqLoading] = useState(false);
  const [bulkDlqSummary, setBulkDlqSummary] = useState<DlqBulkActionResponse["data"] | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setProjectId("");
      return;
    }

    if (projectId && projects.some((project) => project.id === projectId)) {
      return;
    }

    if (projects.length > 0) {
      setProjectId(projects[0].id);
      setTimezone(projects[0].timezone ?? "UTC");
    }
  }, [projectId, projects, token]);

  useEffect(() => {
    if (!projectId) return;

    const found = projects.find((project) => project.id === projectId);
    if (found) {
      setTimezone(found.timezone ?? "UTC");
    }
  }, [projectId, projects]);

  const loadJobs = useCallback(async () => {
    if (!token) {
      setJobs([]);
      setJobsMeta({ page: 1, limit: 50, total: 0, totalPages: 0 });
      setJobsError(null);
      setJobsLoading(false);
      return;
    }

    setJobsLoading(true);
    setJobsError(null);

    try {
      const response = await authFetch("/v1/automation/jobs?page=1&limit=50", {
        cache: "no-store"
      });
      const payload = (await parseJson<ListJobsResponse>(response)) ?? undefined;

      if (!response.ok || !payload?.data || !payload.meta) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setJobs(payload.data);
      setJobsMeta(payload.meta);

      if (selectedJobId && !payload.data.some((job) => job.id === selectedJobId)) {
        setSelectedJobId(null);
        setRuns([]);
      }
    } catch (error) {
      setJobs([]);
      setJobsMeta({ page: 1, limit: 50, total: 0, totalPages: 0 });
      setJobsError(error instanceof Error ? error.message : "Failed to load automation jobs");
    } finally {
      setJobsLoading(false);
    }
  }, [authFetch, selectedJobId, token]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const loadDiagnostics = useCallback(async () => {
    if (!token) {
      setDiagnostics(null);
      setDiagnosticsHistory([]);
      setAutomationAlerts([]);
      setDlqJobs([]);
      setSelectedDlqJobIds([]);
      setBulkDlqSummary(null);
      setDiagnosticsError(null);
      setDiagnosticsLoading(false);
      return;
    }

    setDiagnosticsLoading(true);
    setDiagnosticsError(null);

    try {
      const [diagnosticsResponse, historyResponse, alertsResponse, dlqResponse] = await Promise.all([
        authFetch("/v1/automation/scheduler/diagnostics", {
          cache: "no-store"
        }),
        authFetch("/v1/automation/scheduler/diagnostics/history?page=1&limit=10", {
          cache: "no-store"
        }),
        authFetch("/v1/automation/alerts?page=1&limit=10&status=OPEN", {
          cache: "no-store"
        }),
        authFetch("/v1/automation/dlq/jobs?page=1&limit=10", {
          cache: "no-store"
        })
      ]);

      const diagnosticsPayload = (await parseJson<SchedulerDiagnosticsResponse>(diagnosticsResponse)) ?? undefined;
      const historyPayload = (await parseJson<SchedulerDiagnosticsHistoryResponse>(historyResponse)) ?? undefined;
      const alertsPayload = (await parseJson<AutomationAlertsResponse>(alertsResponse)) ?? undefined;
      const dlqPayload = (await parseJson<DlqJobsResponse>(dlqResponse)) ?? undefined;

      if (!diagnosticsResponse.ok || !diagnosticsPayload?.data) {
        throw new Error(diagnosticsPayload?.error?.message ?? `HTTP ${diagnosticsResponse.status}`);
      }

      if (!historyResponse.ok || !historyPayload?.data) {
        throw new Error(historyPayload?.error?.message ?? `HTTP ${historyResponse.status}`);
      }

      if (!alertsResponse.ok || !alertsPayload?.data) {
        throw new Error(alertsPayload?.error?.message ?? `HTTP ${alertsResponse.status}`);
      }

      if (!dlqResponse.ok || !dlqPayload?.data) {
        throw new Error(dlqPayload?.error?.message ?? `HTTP ${dlqResponse.status}`);
      }

      setDiagnostics(diagnosticsPayload.data);
      setDiagnosticsHistory(historyPayload.data);
      setAutomationAlerts(alertsPayload.data);
      setDlqJobs(dlqPayload.data);
      setSelectedDlqJobIds((current) => current.filter((jobId) => dlqPayload.data?.some((job) => job.id === jobId)));
    } catch (error) {
      setDiagnostics(null);
      setDiagnosticsHistory([]);
      setAutomationAlerts([]);
      setDlqJobs([]);
      setSelectedDlqJobIds([]);
      setDiagnosticsError(error instanceof Error ? error.message : "Failed to load scheduler diagnostics");
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [authFetch, token]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const loadRuns = useCallback(
    async (jobId: string) => {
      if (!token) {
        setRuns([]);
        setRunsError(null);
        setRunsLoading(false);
        return;
      }

      setRunsLoading(true);
      setRunsError(null);

      try {
        const response = await authFetch(`/v1/automation/jobs/${jobId}/runs?page=1&limit=15`, {
          cache: "no-store"
        });
        const payload = (await parseJson<ListRunsResponse>(response)) ?? undefined;

        if (!response.ok || !payload?.data) {
          throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
        }

        setRuns(payload.data);
      } catch (error) {
        setRuns([]);
        setRunsError(error instanceof Error ? error.message : "Failed to load run history");
      } finally {
        setRunsLoading(false);
      }
    },
    [authFetch, token]
  );

  useEffect(() => {
    if (!selectedJobId) {
      setRuns([]);
      return;
    }

    void loadRuns(selectedJobId);
  }, [loadRuns, selectedJobId]);

  const resetForm = () => {
    setEditingJobId(null);
    setName("");
    setType("ANALYTICS_SNAPSHOT");
    setCadence("DAILY");
    setDayOfWeek("1");
    setRunAtHour("9");
    setRunAtMinute("0");
    setStatus("ACTIVE");
    setCatchUpMode("skip-missed");
    setDstAmbiguousTimePolicy("earlier-offset");
    setDstInvalidTimePolicy("shift-forward");
    setRetryMaxAttempts("3");
    setRetryBackoffSeconds("60");
    setRetryMaxBackoffSeconds("900");
    setWindowDays("7");
    setExportDataset("kpis");
    setExportFormat("json");
    setExportLimit("200");
    setSubmitError(null);
  };

  const handleEdit = (job: AutomationJob) => {
    setEditingJobId(job.id);
    setSelectedJobId(job.id);
    setProjectId(job.projectId);
    setName(job.name);
    setType(job.type);
    setCadence(job.cadence);
    setDayOfWeek(job.dayOfWeek === null ? "1" : String(job.dayOfWeek));
    setRunAtHour(String(job.runAtHour));
    setRunAtMinute(String(job.runAtMinute));
    setTimezone(job.timezone);
    setStatus(job.status);
    setCatchUpMode(job.catchUpMode);
    setDstAmbiguousTimePolicy(job.dstAmbiguousTimePolicy);
    setDstInvalidTimePolicy(job.dstInvalidTimePolicy);
    setRetryMaxAttempts(String(job.retryPolicy.maxAttempts));
    setRetryBackoffSeconds(String(job.retryPolicy.backoffSeconds));
    setRetryMaxBackoffSeconds(String(job.retryPolicy.maxBackoffSeconds));

    const config = job.config ?? null;
    const nextWindowDays = readConfigNumber(config, "windowDays");
    setWindowDays(nextWindowDays === null ? "7" : String(nextWindowDays));

    const dataset = readConfigString(config, "dataset");
    if (
      dataset === "kpis" ||
      dataset === "contentTasks" ||
      dataset === "backlinkOpportunities" ||
      dataset === "internalLinks"
    ) {
      setExportDataset(dataset);
    } else {
      setExportDataset("kpis");
    }

    const format = readConfigString(config, "format");
    if (format === "json" || format === "csv") {
      setExportFormat(format);
    } else {
      setExportFormat("json");
    }

    const limit = readConfigNumber(config, "limit");
    setExportLimit(limit === null ? "200" : String(limit));

    setSubmitError(null);
    setSubmitMessage(null);
  };

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setSubmitError("Please login first.");
      return;
    }

    if (!projectId.trim()) {
      setSubmitError("Project is required.");
      return;
    }

    if (!name.trim()) {
      setSubmitError("Job name is required.");
      return;
    }

    const parsedHour = Number(runAtHour);
    if (!Number.isInteger(parsedHour) || parsedHour < 0 || parsedHour > 23) {
      setSubmitError("Run hour must be 0-23.");
      return;
    }

    const parsedMinute = Number(runAtMinute);
    if (!Number.isInteger(parsedMinute) || parsedMinute < 0 || parsedMinute > 59) {
      setSubmitError("Run minute must be 0-59.");
      return;
    }

    const parsedRetryMaxAttempts = Number(retryMaxAttempts);
    if (!Number.isInteger(parsedRetryMaxAttempts) || parsedRetryMaxAttempts < 1 || parsedRetryMaxAttempts > 10) {
      setSubmitError("retryMaxAttempts must be an integer between 1 and 10.");
      return;
    }

    const parsedRetryBackoffSeconds = Number(retryBackoffSeconds);
    if (!Number.isInteger(parsedRetryBackoffSeconds) || parsedRetryBackoffSeconds < 1 || parsedRetryBackoffSeconds > 86400) {
      setSubmitError("retryBackoffSeconds must be an integer between 1 and 86400.");
      return;
    }

    const parsedRetryMaxBackoffSeconds = Number(retryMaxBackoffSeconds);
    if (!Number.isInteger(parsedRetryMaxBackoffSeconds) || parsedRetryMaxBackoffSeconds < 1 || parsedRetryMaxBackoffSeconds > 86400) {
      setSubmitError("retryMaxBackoffSeconds must be an integer between 1 and 86400.");
      return;
    }

    if (parsedRetryMaxBackoffSeconds < parsedRetryBackoffSeconds) {
      setSubmitError("retryMaxBackoffSeconds must be >= retryBackoffSeconds.");
      return;
    }

    const payload: Record<string, unknown> = {
      projectId: projectId.trim(),
      name: name.trim(),
      type,
      cadence,
      runAtHour: parsedHour,
      runAtMinute: parsedMinute,
      timezone: timezone.trim() || "UTC",
      status,
      catchUpMode,
      dstAmbiguousTimePolicy,
      dstInvalidTimePolicy,
      retryMaxAttempts: parsedRetryMaxAttempts,
      retryBackoffSeconds: parsedRetryBackoffSeconds,
      retryMaxBackoffSeconds: parsedRetryMaxBackoffSeconds
    };

    if (cadence === "WEEKLY") {
      const parsedDay = Number(dayOfWeek);
      if (!Number.isInteger(parsedDay) || parsedDay < 0 || parsedDay > 6) {
        setSubmitError("Weekly jobs require dayOfWeek between 0 and 6.");
        return;
      }

      payload.dayOfWeek = parsedDay;
    }

    const config: Record<string, unknown> = {};
    if (type === "ANALYTICS_SNAPSHOT") {
      const parsedWindowDays = Number(windowDays);
      if (windowDays.trim()) {
        if (!Number.isInteger(parsedWindowDays) || parsedWindowDays < 1 || parsedWindowDays > 365) {
          setSubmitError("windowDays must be an integer between 1 and 365.");
          return;
        }

        config.windowDays = parsedWindowDays;
      }
    }

    if (type === "ANALYTICS_EXPORT") {
      config.dataset = exportDataset;
      config.format = exportFormat;

      if (exportLimit.trim()) {
        const parsedLimit = Number(exportLimit);
        if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
          setSubmitError("Export limit must be an integer between 1 and 500.");
          return;
        }

        config.limit = parsedLimit;
      }
    }

    payload.config = Object.keys(config).length > 0 ? config : null;

    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitMessage(null);

    try {
      const isEditing = Boolean(editingJobId);
      const method = isEditing ? "PATCH" : "POST";
      const endpoint = isEditing ? `/v1/automation/jobs/${editingJobId}` : "/v1/automation/jobs";

      if (isEditing) {
        delete payload.projectId;
      }

      const response = await authFetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const body = (await parseJson<SingleJobResponse>(response)) ?? undefined;
      if (!response.ok || !body?.data) {
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }

      setSubmitMessage(isEditing ? "Automation job updated." : "Automation job created.");
      setSelectedJobId(body.data.id);
      await loadJobs();
      await loadDiagnostics();
      await loadRuns(body.data.id);

      if (!isEditing) {
        resetForm();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save automation job");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async (job: AutomationJob) => {
    const confirmed = window.confirm(`Delete automation job \"${job.name}\"?`);
    if (!confirmed) return;

    try {
      const response = await authFetch(`/v1/automation/jobs/${job.id}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 204) {
        const body = (await parseJson<SingleJobResponse>(response)) ?? undefined;
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }

      if (selectedJobId === job.id) {
        setSelectedJobId(null);
      }
      if (editingJobId === job.id) {
        resetForm();
      }

      setSubmitMessage("Automation job deleted.");
      await loadJobs();
      await loadDiagnostics();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to delete automation job");
    }
  };

  const handleRunNow = async (jobId: string) => {
    setSubmitError(null);
    setSubmitMessage(null);

    try {
      const response = await authFetch(`/v1/automation/jobs/${jobId}/trigger`, {
        method: "POST"
      });
      const payload = (await parseJson<TriggerRunResponse>(response)) ?? undefined;

      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSubmitMessage(`Triggered job run (${payload.data.status}).`);
      await loadJobs();
      await loadDiagnostics();
      if (selectedJobId === jobId) {
        await loadRuns(jobId);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to trigger automation run");
    }
  };

  const handleAckAlert = async (alertId: string) => {
    if (!token) return;

    setSubmitError(null);
    setSubmitMessage(null);

    try {
      const response = await authFetch(`/v1/automation/alerts/${alertId}/ack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });

      const payload = (await parseJson<{ data?: AutomationAlertEvent; error?: ApiError }>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSubmitMessage("Alert acknowledged.");
      await loadDiagnostics();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to acknowledge alert");
    }
  };

  const handleDlqAction = async (jobId: string, action: "ack" | "requeue" | "retry-now") => {
    if (!token) return;

    setSubmitError(null);
    setSubmitMessage(null);
    setBulkDlqSummary(null);

    const endpoint =
      action === "ack"
        ? `/v1/automation/dlq/jobs/${jobId}/ack`
        : action === "requeue"
          ? `/v1/automation/dlq/jobs/${jobId}/requeue`
          : `/v1/automation/dlq/jobs/${jobId}/retry-now`;

    try {
      const response = await authFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });

      const payload = (await parseJson<DlqActionResponse>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      const actionLabel = action === "ack" ? "Acknowledged" : action === "requeue" ? "Requeued" : "Retried";
      setSubmitMessage(`${actionLabel} DLQ job.`);

      await loadJobs();
      await loadDiagnostics();

      if (selectedJobId === jobId) {
        await loadRuns(jobId);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to execute DLQ action");
    }
  };

  const toggleDlqSelection = (jobId: string, checked: boolean) => {
    setSelectedDlqJobIds((current) => {
      if (checked) {
        return current.includes(jobId) ? current : [...current, jobId];
      }

      return current.filter((id) => id !== jobId);
    });
  };

  const handleSelectAllDlq = (checked: boolean) => {
    if (checked) {
      setSelectedDlqJobIds(dlqJobs.map((job) => job.id));
      return;
    }

    setSelectedDlqJobIds([]);
  };

  const handleBulkDlqAction = async (action: "ack" | "requeue" | "retry-now") => {
    if (!token) return;

    if (selectedDlqJobIds.length === 0) {
      setSubmitError("Select at least one dead-letter job first.");
      return;
    }

    setBulkDlqLoading(true);
    setSubmitError(null);
    setSubmitMessage(null);
    setBulkDlqSummary(null);

    const endpoint =
      action === "ack"
        ? "/v1/automation/dlq/jobs/bulk/ack"
        : action === "requeue"
          ? "/v1/automation/dlq/jobs/bulk/requeue"
          : "/v1/automation/dlq/jobs/bulk/retry-now";

    try {
      const response = await authFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jobIds: selectedDlqJobIds
        })
      });

      const payload = (await parseJson<DlqBulkActionResponse>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setBulkDlqSummary(payload.data);
      setSubmitMessage(
        `Bulk ${payload.data.action}: ${payload.data.succeeded} succeeded, ${payload.data.failed} failed (requested ${payload.data.requested}).`
      );

      await loadJobs();
      await loadDiagnostics();

      if (selectedJobId && selectedDlqJobIds.includes(selectedJobId)) {
        await loadRuns(selectedJobId);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to execute bulk DLQ action");
    } finally {
      setBulkDlqLoading(false);
    }
  };

  const handleProcessDue = async () => {
    if (!token) return;

    setProcessDueLoading(true);
    setSubmitError(null);
    setSubmitMessage(null);

    try {
      const response = await authFetch("/v1/automation/jobs/process-due", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          limit: 20
        })
      });

      const payload = (await parseJson<ProcessDueResponse>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSubmitMessage(
        `Processed ${payload.data.processed} due job${payload.data.processed === 1 ? "" : "s"}. Remaining due: ${payload.data.remainingDue}.`
      );

      await loadJobs();
      await loadDiagnostics();
      if (selectedJobId) {
        await loadRuns(selectedJobId);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to process due jobs");
    } finally {
      setProcessDueLoading(false);
    }
  };

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Phase 11 Automation Orchestration</h2>
          <div>
            <button type="button" onClick={() => void loadJobs()} disabled={!token || jobsLoading}>
              Refresh jobs
            </button>{" "}
            <button type="button" onClick={handleProcessDue} disabled={!token || processDueLoading}>
              {processDueLoading ? "Processing due..." : "Process due jobs"}
            </button>
          </div>
        </div>

        <p className="muted">
          {jobsLoading ? "Loading jobs..." : `${jobsMeta.total} automation job${jobsMeta.total === 1 ? "" : "s"} configured.`}
        </p>

        {jobsError ? <p className="error">{jobsError}</p> : null}

        <form className="form" onSubmit={handleSubmit}>
          <h3>{editingJobId ? "Edit automation job" : "Create automation job"}</h3>

          <label>
            Project
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={!token || submitLoading}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.slug})
                </option>
              ))}
            </select>
          </label>

          <label>
            Job name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Weekly KPI export"
              disabled={!token || submitLoading}
            />
          </label>

          <label>
            Job type
            <select value={type} onChange={(event) => setType(event.target.value as AutomationJobType)} disabled={!token || submitLoading}>
              <option value="ANALYTICS_SNAPSHOT">Analytics snapshot</option>
              <option value="ANALYTICS_EXPORT">Analytics export</option>
            </select>
          </label>

          <label>
            Cadence
            <select value={cadence} onChange={(event) => setCadence(event.target.value as ScheduledJobCadence)} disabled={!token || submitLoading}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </label>

          {cadence === "WEEKLY" ? (
            <label>
              Day of week
              <select value={dayOfWeek} onChange={(event) => setDayOfWeek(event.target.value)} disabled={!token || submitLoading}>
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label} ({index})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label>
            Run hour (local schedule timezone)
            <input
              type="number"
              min={0}
              max={23}
              value={runAtHour}
              onChange={(event) => setRunAtHour(event.target.value)}
              disabled={!token || submitLoading}
            />
          </label>

          <label>
            Run minute (local schedule timezone)
            <input
              type="number"
              min={0}
              max={59}
              value={runAtMinute}
              onChange={(event) => setRunAtMinute(event.target.value)}
              disabled={!token || submitLoading}
            />
          </label>

          <label>
            Timezone label
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!token || submitLoading} />
          </label>

          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as ScheduledJobStatus)} disabled={!token || submitLoading}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PAUSED">PAUSED</option>
              <option value="DEAD_LETTER">DEAD_LETTER</option>
            </select>
          </label>

          <label>
            Catch-up mode
            <select value={catchUpMode} onChange={(event) => setCatchUpMode(event.target.value as CatchUpMode)} disabled={!token || submitLoading}>
              <option value="skip-missed">skip-missed</option>
              <option value="replay-missed">replay-missed</option>
            </select>
          </label>

          <label>
            DST ambiguous local time policy
            <select
              value={dstAmbiguousTimePolicy}
              onChange={(event) => setDstAmbiguousTimePolicy(event.target.value as DstAmbiguousTimePolicy)}
              disabled={!token || submitLoading}
            >
              <option value="earlier-offset">earlier-offset</option>
              <option value="later-offset">later-offset</option>
            </select>
          </label>

          <label>
            DST non-existent local time policy
            <select
              value={dstInvalidTimePolicy}
              onChange={(event) => setDstInvalidTimePolicy(event.target.value as DstInvalidTimePolicy)}
              disabled={!token || submitLoading}
            >
              <option value="shift-forward">shift-forward</option>
              <option value="skip">skip</option>
            </select>
          </label>

          <label>
            Retry max attempts (including first run)
            <input
              type="number"
              min={1}
              max={10}
              value={retryMaxAttempts}
              onChange={(event) => setRetryMaxAttempts(event.target.value)}
              disabled={!token || submitLoading}
            />
          </label>

          <label>
            Retry base backoff seconds
            <input
              type="number"
              min={1}
              max={86400}
              value={retryBackoffSeconds}
              onChange={(event) => setRetryBackoffSeconds(event.target.value)}
              disabled={!token || submitLoading}
            />
          </label>

          <label>
            Retry max backoff seconds
            <input
              type="number"
              min={1}
              max={86400}
              value={retryMaxBackoffSeconds}
              onChange={(event) => setRetryMaxBackoffSeconds(event.target.value)}
              disabled={!token || submitLoading}
            />
          </label>

          {type === "ANALYTICS_SNAPSHOT" ? (
            <label>
              Snapshot window days (optional)
              <input
                type="number"
                min={1}
                max={365}
                value={windowDays}
                onChange={(event) => setWindowDays(event.target.value)}
                disabled={!token || submitLoading}
              />
            </label>
          ) : null}

          {type === "ANALYTICS_EXPORT" ? (
            <>
              <label>
                Export dataset
                <select
                  value={exportDataset}
                  onChange={(event) => setExportDataset(event.target.value as ExportDataset)}
                  disabled={!token || submitLoading}
                >
                  <option value="kpis">kpis</option>
                  <option value="contentTasks">contentTasks</option>
                  <option value="backlinkOpportunities">backlinkOpportunities</option>
                  <option value="internalLinks">internalLinks</option>
                </select>
              </label>

              <label>
                Export format
                <select
                  value={exportFormat}
                  onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
                  disabled={!token || submitLoading}
                >
                  <option value="json">json</option>
                  <option value="csv">csv</option>
                </select>
              </label>

              <label>
                Export row limit
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={exportLimit}
                  onChange={(event) => setExportLimit(event.target.value)}
                  disabled={!token || submitLoading}
                />
              </label>
            </>
          ) : null}

          <div>
            <button type="submit" disabled={!token || submitLoading}>
              {submitLoading ? "Saving..." : editingJobId ? "Save job" : "Create job"}
            </button>{" "}
            {editingJobId ? (
              <button type="button" onClick={resetForm} disabled={submitLoading}>
                Cancel edit
              </button>
            ) : null}
          </div>

          {submitError ? <p className="error">{submitError}</p> : null}
          {submitMessage ? <p className="muted">{submitMessage}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Automation Health & Scheduler Diagnostics</h3>
          <button type="button" onClick={() => void loadDiagnostics()} disabled={!token || diagnosticsLoading}>
            {diagnosticsLoading ? "Refreshing..." : "Refresh diagnostics"}
          </button>
        </div>

        {diagnosticsError ? <p className="error">{diagnosticsError}</p> : null}

        {!diagnostics ? (
          <p className="muted">No diagnostics loaded yet.</p>
        ) : (
          <>
            <p className="muted">
              Scheduler: {diagnostics.scheduler.enabled ? "enabled" : "disabled"} · tick interval {diagnostics.scheduler.intervalMs}ms ·
              last tick {diagnostics.scheduler.lastTickAt ? new Date(diagnostics.scheduler.lastTickAt).toLocaleString() : "—"} ·
              outcome {diagnostics.scheduler.lastTickOutcome ?? "—"}
            </p>
            <p className="muted">
              Lock: {diagnostics.lock.isLocked ? "LOCKED" : "idle"}
              {diagnostics.lock.lockedUntil ? ` until ${new Date(diagnostics.lock.lockedUntil).toLocaleString()}` : ""} · contention {diagnostics.scheduler.contentionCount} · overlap skips {diagnostics.scheduler.overlapSkips}
            </p>
            <p className="muted">
              Owner stats (24h): total {diagnostics.owner.runStats.total}, success {diagnostics.owner.runStats.success}, failed {diagnostics.owner.runStats.failed}, running {diagnostics.owner.runStats.running}, success rate {diagnostics.owner.runStats.successRate ?? "—"}%.
            </p>
            <p className="muted">
              Jobs: active {diagnostics.owner.activeJobs}, due now {diagnostics.owner.dueNow}, retrying {diagnostics.owner.retryingJobs}, dead-letter {diagnostics.owner.deadLetterJobs}, open alerts {diagnostics.owner.openAlerts}.
            </p>

            <div className="kpi-grid">
              <div className="kpi-card">
                <p className="muted">Open alerts</p>
                <p className="metric-value">{diagnostics.owner.openAlerts}</p>
              </div>
              <div className="kpi-card">
                <p className="muted">Dead-letter trend ({diagnostics.owner.trends.deadLetter.windowHours}h)</p>
                <p className="metric-value">{diagnostics.owner.trends.deadLetter.currentWindowCount}</p>
                <p className="muted">prev {diagnostics.owner.trends.deadLetter.previousWindowCount} · Δ {diagnostics.owner.trends.deadLetter.delta}</p>
              </div>
              <div className="kpi-card">
                <p className="muted">Contention trend ({diagnostics.owner.trends.contention.windowMinutes}m)</p>
                <p className="metric-value">{diagnostics.owner.trends.contention.currentWindowCount}</p>
                <p className="muted">prev {diagnostics.owner.trends.contention.previousWindowCount} · Δ {diagnostics.owner.trends.contention.delta}</p>
              </div>
              <div className="kpi-card">
                <p className="muted">Failure trend ({diagnostics.owner.trends.failures.windowMinutes}m)</p>
                <p className="metric-value">{diagnostics.owner.trends.failures.currentWindowCount}</p>
                <p className="muted">prev {diagnostics.owner.trends.failures.previousWindowCount} · Δ {diagnostics.owner.trends.failures.delta}</p>
              </div>
              <div className="kpi-card">
                <p className="muted">Outbound delivery ({diagnostics.owner.delivery.windowHours}h)</p>
                <p className="metric-value">
                  {diagnostics.owner.delivery.successCount}/{diagnostics.owner.delivery.totalAttempts}
                </p>
                <p className="muted">
                  failures {diagnostics.owner.delivery.failureCount} · skipped {diagnostics.owner.delivery.skippedCount} · success rate {diagnostics.owner.delivery.successRate ?? "—"}%
                </p>
              </div>
            </div>

            <h4>Open automation alerts</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Message</th>
                    <th>Delivery</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {automationAlerts.map((alert) => (
                    <tr key={alert.id}>
                      <td>{alert.type}</td>
                      <td>{alert.severity}</td>
                      <td>{alert.message}</td>
                      <td>
                        {alert.delivery
                          ? `${alert.delivery.status}${alert.delivery.lastError ? ` · ${alert.delivery.lastError}` : ""}`
                          : "—"}
                      </td>
                      <td>{new Date(alert.createdAt).toLocaleString()}</td>
                      <td>
                        {alert.status === "OPEN" ? (
                          <button type="button" onClick={() => void handleAckAlert(alert.id)}>
                            Ack
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                  {automationAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        No open alerts.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <h4>Dead-letter queue</h4>
            <div className="panel-header">
              <p className="muted">Selected {selectedDlqJobIds.length} of {dlqJobs.length}</p>
              <div>
                <button
                  type="button"
                  onClick={() => void handleBulkDlqAction("ack")}
                  disabled={!token || bulkDlqLoading || selectedDlqJobIds.length === 0}
                >
                  Bulk ack
                </button>{" "}
                <button
                  type="button"
                  onClick={() => void handleBulkDlqAction("requeue")}
                  disabled={!token || bulkDlqLoading || selectedDlqJobIds.length === 0}
                >
                  Bulk requeue
                </button>{" "}
                <button
                  type="button"
                  onClick={() => void handleBulkDlqAction("retry-now")}
                  disabled={!token || bulkDlqLoading || selectedDlqJobIds.length === 0}
                >
                  Bulk retry now
                </button>
              </div>
            </div>

            {bulkDlqSummary ? (
              <>
                <p className="muted">
                  Bulk {bulkDlqSummary.action}: {bulkDlqSummary.succeeded} succeeded, {bulkDlqSummary.failed} failed (requested {bulkDlqSummary.requested}).
                </p>
                {bulkDlqSummary.failed > 0 ? (
                  <ul className="muted">
                    {bulkDlqSummary.results
                      .filter((result) => !result.ok)
                      .slice(0, 5)
                      .map((result) => (
                        <li key={`${bulkDlqSummary.action}-${result.jobId}-${result.code}`}>
                          {result.jobId}: {result.code} {result.message ? `- ${result.message}` : ""}
                        </li>
                      ))}
                  </ul>
                ) : null}
              </>
            ) : null}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={dlqJobs.length > 0 && selectedDlqJobIds.length === dlqJobs.length}
                        onChange={(event) => handleSelectAllDlq(event.target.checked)}
                        aria-label="Select all DLQ jobs"
                      />
                    </th>
                    <th>Job</th>
                    <th>Project</th>
                    <th>Dead-lettered at</th>
                    <th>Last error</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dlqJobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedDlqJobIds.includes(job.id)}
                          onChange={(event) => toggleDlqSelection(job.id, event.target.checked)}
                          aria-label={`Select ${job.name}`}
                        />
                      </td>
                      <td>{job.name}</td>
                      <td>{job.project.slug}</td>
                      <td>{job.health.deadLetteredAt ? new Date(job.health.deadLetteredAt).toLocaleString() : "—"}</td>
                      <td>{job.health.lastError ?? "—"}</td>
                      <td>
                        <button type="button" onClick={() => void handleDlqAction(job.id, "ack")}>
                          Ack
                        </button>{" "}
                        <button type="button" onClick={() => void handleDlqAction(job.id, "requeue")}>
                          Requeue
                        </button>{" "}
                        <button type="button" onClick={() => void handleDlqAction(job.id, "retry-now")}>
                          Retry now
                        </button>
                      </td>
                    </tr>
                  ))}
                  {dlqJobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        No dead-letter jobs.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <h4>Persisted scheduler ticks (recent)</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>At</th>
                    <th>Reason</th>
                    <th>Outcome</th>
                    <th>Duration</th>
                    <th>Processed</th>
                    <th>Signals</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnosticsHistory.map((tick) => (
                    <tr key={tick.id}>
                      <td>{new Date(tick.tickedAt).toLocaleString()}</td>
                      <td>{tick.reason}</td>
                      <td>{tick.outcome}</td>
                      <td>{tick.durationMs}ms</td>
                      <td>{tick.processed}</td>
                      <td>
                        {tick.contention ? "contention" : ""}
                        {tick.contention && tick.overlapSkip ? " · " : ""}
                        {tick.overlapSkip ? "overlap-skip" : ""}
                        {!tick.contention && !tick.overlapSkip ? "—" : ""}
                      </td>
                      <td>{tick.error ?? "—"}</td>
                    </tr>
                  ))}
                  {diagnosticsHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        No persisted tick history.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h3>Automation Jobs</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Project</th>
                <th>Type</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Health</th>
                <th>Next run</th>
                <th>Last run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.name}</td>
                  <td>{job.project.slug}</td>
                  <td>{job.type}</td>
                  <td>
                    {job.cadence}
                    {job.cadence === "WEEKLY" && job.dayOfWeek !== null ? ` (${WEEKDAY_LABELS[job.dayOfWeek]})` : ""} @
                    {` ${String(job.runAtHour).padStart(2, "0")}:${String(job.runAtMinute).padStart(2, "0")} ${job.timezone}`}
                    <br />
                    <span className="muted">
                      catch-up={job.catchUpMode}, dst-ambiguous={job.dstAmbiguousTimePolicy}, dst-missing={job.dstInvalidTimePolicy}
                    </span>
                  </td>
                  <td>{job.status}</td>
                  <td>
                    success {job.health.successCount}/{job.health.totalRuns} ({job.health.successRate ?? "—"}%)
                    <br />
                    <span className="muted">
                      consecutive failures {job.health.consecutiveFailures}
                      {job.health.lastError ? ` · last error: ${job.health.lastError}` : ""}
                      {job.retryState.nextAttemptNumber ? ` · retry attempt ${job.retryState.nextAttemptNumber}` : ""}
                    </span>
                  </td>
                  <td>{job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "—"}</td>
                  <td>{job.lastRunAt ? `${job.lastRunStatus ?? "UNKNOWN"} · ${new Date(job.lastRunAt).toLocaleString()}` : "—"}</td>
                  <td>
                    <button type="button" onClick={() => setSelectedJobId(job.id)}>
                      Runs
                    </button>{" "}
                    <button type="button" onClick={() => handleEdit(job)}>
                      Edit
                    </button>{" "}
                    <button type="button" onClick={() => void handleRunNow(job.id)}>
                      Run now
                    </button>{" "}
                    <button type="button" onClick={() => void handleDelete(job)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted">
                    No automation jobs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Recent Runs {selectedJob ? `for ${selectedJob.name}` : ""}</h3>
          {selectedJobId ? (
            <button type="button" onClick={() => void loadRuns(selectedJobId)} disabled={runsLoading}>
              Refresh runs
            </button>
          ) : null}
        </div>

        {!selectedJobId ? <p className="muted">Select a job from the table to view run history.</p> : null}
        {runsError ? <p className="error">{runsError}</p> : null}

        {selectedJobId ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Status</th>
                  <th>Trigger</th>
                  <th>Attempt</th>
                  <th>Scheduled for</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.id}</td>
                    <td>{run.status}</td>
                    <td>{run.trigger}</td>
                    <td>{run.attemptNumber}/{run.maxAttempts}</td>
                    <td>{run.scheduledFor ? new Date(run.scheduledFor).toLocaleString() : "—"}</td>
                    <td>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</td>
                    <td>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "—"}</td>
                    <td>
                      {run.error ?? run.outputSummary ?? "—"}
                      {run.nextRetryAt ? ` · next retry ${new Date(run.nextRetryAt).toLocaleString()}` : ""}
                    </td>
                  </tr>
                ))}
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      {runsLoading ? "Loading runs..." : "No runs yet for this job."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
