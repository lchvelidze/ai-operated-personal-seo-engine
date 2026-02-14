"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "FAILED";
type OutreachStatus = "NEW" | "CONTACTED" | "RESPONDED" | "WON" | "LOST";
type LinkStatus = "SUGGESTED" | "APPLIED" | "IGNORED";

type ExportDataset = "kpis" | "contentTasks" | "backlinkOpportunities" | "internalLinks";
type ExportFormat = "json" | "csv";

type ProjectOption = {
  id: string;
  name: string;
  slug: string;
};

type ApiError = {
  code: string;
  message: string;
};

type KpiSummary = {
  scope: {
    projectId: string | null;
    from: string | null;
    to: string | null;
  };
  inventory: {
    projects: number;
    pages: number;
    keywords: number;
    activeKeywords: number;
    contentTasks: number;
    internalLinks: number;
    backlinkOpportunities: number;
  };
  activity: {
    rankSnapshots: number;
    averageRank: number | null;
    top10Rate: number | null;
    contentTasksCreated: number;
    contentTasksCompleted: number;
    contentTaskCompletionRate: number | null;
    backlinksCreated: number;
    backlinksWon: number;
    backlinkWinRate: number | null;
  };
};

type FunnelGroup<T extends string> = {
  total: number;
  stages: Array<{
    stage: T;
    count: number;
    percentage: number;
  }>;
};

type FunnelMetrics = {
  scope: {
    projectId: string | null;
    from: string | null;
    to: string | null;
  };
  contentTasks: FunnelGroup<TaskStatus>;
  backlinkOutreach: FunnelGroup<OutreachStatus>;
  internalLinkStatus: FunnelGroup<LinkStatus>;
};

type KpiResponse = {
  data?: KpiSummary;
  error?: ApiError;
};

type FunnelResponse = {
  data?: FunnelMetrics;
  error?: ApiError;
};

type ExportJsonResponse = {
  data?: {
    dataset: ExportDataset;
    records: Array<Record<string, unknown>>;
    meta?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  error?: ApiError;
};

type Props = {
  token: string | null;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
  projects: ProjectOption[];
};

async function parseJson<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return "";

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(localValue: string): string | null {
  const trimmed = localValue.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString();
}

function downloadTextFile(content: string, filename: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function buildExportFilename(dataset: ExportDataset, format: ExportFormat) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = format === "csv" ? "csv" : "json";
  return `phase10-${dataset}-${timestamp}.${extension}`;
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(2)}%`;
}

export function Phase10AnalyticsPanel({ token, authFetch, projects }: Props) {
  const [projectFilterId, setProjectFilterId] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [funnels, setFunnels] = useState<FunnelMetrics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const [exportDataset, setExportDataset] = useState<ExportDataset>("kpis");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [exportContentTaskStatus, setExportContentTaskStatus] = useState<"" | TaskStatus>("");
  const [exportOutreachStatus, setExportOutreachStatus] = useState<"" | OutreachStatus>("");
  const [exportLinkStatus, setExportLinkStatus] = useState<"" | LinkStatus>("");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setProjectFilterId("");
      return;
    }

    if (projectFilterId && !projects.some((project) => project.id === projectFilterId)) {
      setProjectFilterId("");
    }
  }, [projectFilterId, projects, token]);

  const scopeQuery = useMemo(() => {
    const params = new URLSearchParams();

    if (projectFilterId.trim()) {
      params.set("projectId", projectFilterId.trim());
    }

    const fromIso = fromDateTimeLocalValue(fromInput);
    if (fromInput.trim() && fromIso) {
      params.set("from", fromIso);
    }

    const toIso = fromDateTimeLocalValue(toInput);
    if (toInput.trim() && toIso) {
      params.set("to", toIso);
    }

    return params;
  }, [fromInput, projectFilterId, toInput]);

  const loadAnalytics = useCallback(async () => {
    if (!token) {
      setKpis(null);
      setFunnels(null);
      setAnalyticsError(null);
      setAnalyticsLoading(false);
      return;
    }

    setAnalyticsLoading(true);
    setAnalyticsError(null);

    try {
      const queryString = scopeQuery.toString();
      const suffix = queryString ? `?${queryString}` : "";

      const [kpiResponse, funnelResponse] = await Promise.all([
        authFetch(`/v1/analytics/kpis${suffix}`, { cache: "no-store" }),
        authFetch(`/v1/analytics/funnels${suffix}`, { cache: "no-store" })
      ]);

      const [kpiPayload, funnelPayload] = await Promise.all([
        parseJson<KpiResponse>(kpiResponse),
        parseJson<FunnelResponse>(funnelResponse)
      ]);

      if (!kpiResponse.ok || !kpiPayload?.data) {
        throw new Error(kpiPayload?.error?.message ?? `KPI request failed: HTTP ${kpiResponse.status}`);
      }

      if (!funnelResponse.ok || !funnelPayload?.data) {
        throw new Error(funnelPayload?.error?.message ?? `Funnel request failed: HTTP ${funnelResponse.status}`);
      }

      setKpis(kpiPayload.data);
      setFunnels(funnelPayload.data);
    } catch (error) {
      setKpis(null);
      setFunnels(null);
      setAnalyticsError(error instanceof Error ? error.message : "Failed to load analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [authFetch, scopeQuery, token]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const handleRefresh = () => {
    void loadAnalytics();
  };

  const handleExport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setExportError("Please login first.");
      return;
    }

    if (fromInput.trim() && !fromDateTimeLocalValue(fromInput)) {
      setExportError("From date/time is invalid.");
      return;
    }

    if (toInput.trim() && !fromDateTimeLocalValue(toInput)) {
      setExportError("To date/time is invalid.");
      return;
    }

    setExportLoading(true);
    setExportError(null);
    setExportMessage(null);

    try {
      const params = new URLSearchParams(scopeQuery);
      params.set("dataset", exportDataset);
      params.set("format", exportFormat);

      if (exportDataset !== "kpis") {
        params.set("page", "1");
        params.set("limit", "500");
      }

      if (exportDataset === "contentTasks" && exportContentTaskStatus) {
        params.set("contentTaskStatus", exportContentTaskStatus);
      }

      if (exportDataset === "backlinkOpportunities" && exportOutreachStatus) {
        params.set("outreachStatus", exportOutreachStatus);
      }

      if (exportDataset === "internalLinks" && exportLinkStatus) {
        params.set("linkStatus", exportLinkStatus);
      }

      const response = await authFetch(`/v1/analytics/export?${params.toString()}`, {
        cache: "no-store"
      });

      if (exportFormat === "csv") {
        const csv = await response.text();

        if (!response.ok) {
          let message = `HTTP ${response.status}`;

          try {
            const parsed = JSON.parse(csv) as { error?: { message?: string } };
            message = parsed.error?.message ?? message;
          } catch {
            // best effort
          }

          throw new Error(message);
        }

        const filename = buildExportFilename(exportDataset, "csv");
        downloadTextFile(csv, filename, "text/csv;charset=utf-8");
        setExportMessage(`Downloaded ${filename}`);
        return;
      }

      const payload = await parseJson<ExportJsonResponse>(response);
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      const filename = buildExportFilename(exportDataset, "json");
      downloadTextFile(JSON.stringify(payload.data, null, 2), filename, "application/json;charset=utf-8");

      const recordsCount = payload.data.records.length;
      const metaTotal = payload.data.meta?.total;
      setExportMessage(
        metaTotal !== undefined
          ? `Downloaded ${filename} (${recordsCount} rows in file, ${metaTotal} total rows in dataset).`
          : `Downloaded ${filename}.`
      );
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to export analytics dataset");
    } finally {
      setExportLoading(false);
    }
  };

  const selectedProjectName = useMemo(() => {
    if (!projectFilterId) return "All projects";
    return projects.find((project) => project.id === projectFilterId)?.name ?? "Selected project";
  }, [projectFilterId, projects]);

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Phase 10 Analytics &amp; Reporting</h2>
          <button type="button" onClick={handleRefresh} disabled={!token || analyticsLoading}>
            Refresh
          </button>
        </div>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadAnalytics();
          }}
        >
          <label>
            Project scope
            <select
              value={projectFilterId}
              onChange={(event) => setProjectFilterId(event.target.value)}
              disabled={!token || projects.length === 0}
            >
              <option value="">All projects (owner scope)</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.slug})
                </option>
              ))}
            </select>
          </label>

          <label>
            From (optional)
            <input type="datetime-local" value={fromInput} onChange={(event) => setFromInput(event.target.value)} />
          </label>

          <label>
            To (optional)
            <input type="datetime-local" value={toInput} onChange={(event) => setToInput(event.target.value)} />
          </label>

          <button type="submit" disabled={!token || analyticsLoading}>
            {analyticsLoading ? "Loading analytics..." : "Apply analytics filters"}
          </button>
        </form>

        <p className="muted">Scope: {selectedProjectName}</p>
        {analyticsError ? <p className="error">{analyticsError}</p> : null}

        {kpis ? (
          <>
            <h3>KPI Summary</h3>
            <div className="kpi-grid">
              <article className="kpi-card">
                <p className="muted">Projects</p>
                <p className="metric-value">{kpis.inventory.projects}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Pages</p>
                <p className="metric-value">{kpis.inventory.pages}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Keywords</p>
                <p className="metric-value">{kpis.inventory.keywords}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Active Keywords</p>
                <p className="metric-value">{kpis.inventory.activeKeywords}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Content Tasks</p>
                <p className="metric-value">{kpis.inventory.contentTasks}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Internal Links</p>
                <p className="metric-value">{kpis.inventory.internalLinks}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Backlink Opportunities</p>
                <p className="metric-value">{kpis.inventory.backlinkOpportunities}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Rank Snapshots (window)</p>
                <p className="metric-value">{kpis.activity.rankSnapshots}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Average Rank</p>
                <p className="metric-value">{kpis.activity.averageRank ?? "—"}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Top 10 Rate</p>
                <p className="metric-value">{formatPercent(kpis.activity.top10Rate)}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Task Completion Rate</p>
                <p className="metric-value">{formatPercent(kpis.activity.contentTaskCompletionRate)}</p>
              </article>
              <article className="kpi-card">
                <p className="muted">Backlink Win Rate</p>
                <p className="metric-value">{formatPercent(kpis.activity.backlinkWinRate)}</p>
              </article>
            </div>
          </>
        ) : null}

        {funnels ? (
          <>
            <h3>Funnels</h3>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th colSpan={3}>Content Tasks Funnel (total: {funnels.contentTasks.total})</th>
                  </tr>
                  <tr>
                    <th>Status</th>
                    <th>Count</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {funnels.contentTasks.stages.map((stage) => (
                    <tr key={`task-${stage.stage}`}>
                      <td>{stage.stage}</td>
                      <td>{stage.count}</td>
                      <td>{stage.percentage.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th colSpan={3}>Backlink Outreach Funnel (total: {funnels.backlinkOutreach.total})</th>
                  </tr>
                  <tr>
                    <th>Status</th>
                    <th>Count</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {funnels.backlinkOutreach.stages.map((stage) => (
                    <tr key={`backlink-${stage.stage}`}>
                      <td>{stage.stage}</td>
                      <td>{stage.count}</td>
                      <td>{stage.percentage.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th colSpan={3}>Internal Link Status Distribution (total: {funnels.internalLinkStatus.total})</th>
                  </tr>
                  <tr>
                    <th>Status</th>
                    <th>Count</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {funnels.internalLinkStatus.stages.map((stage) => (
                    <tr key={`link-${stage.stage}`}>
                      <td>{stage.stage}</td>
                      <td>{stage.count}</td>
                      <td>{stage.percentage.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <section className="panel">
        <h2>Analytics Export</h2>
        <p className="muted">Export Phase 10 analytics/reporting datasets in JSON or CSV format.</p>

        <form className="form" onSubmit={handleExport}>
          <label>
            Dataset
            <select
              value={exportDataset}
              onChange={(event) => {
                setExportDataset(event.target.value as ExportDataset);
                setExportContentTaskStatus("");
                setExportOutreachStatus("");
                setExportLinkStatus("");
              }}
              disabled={!token || exportLoading}
            >
              <option value="kpis">KPI summary</option>
              <option value="contentTasks">Content tasks rows</option>
              <option value="backlinkOpportunities">Backlink opportunities rows</option>
              <option value="internalLinks">Internal links rows</option>
            </select>
          </label>

          <label>
            Format
            <select
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
              disabled={!token || exportLoading}
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </label>

          {exportDataset === "contentTasks" ? (
            <label>
              Content task status filter
              <select
                value={exportContentTaskStatus}
                onChange={(event) => setExportContentTaskStatus(event.target.value as "" | TaskStatus)}
                disabled={!token || exportLoading}
              >
                <option value="">All statuses</option>
                <option value="TODO">TODO</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="BLOCKED">BLOCKED</option>
                <option value="DONE">DONE</option>
                <option value="FAILED">FAILED</option>
              </select>
            </label>
          ) : null}

          {exportDataset === "backlinkOpportunities" ? (
            <label>
              Outreach status filter
              <select
                value={exportOutreachStatus}
                onChange={(event) => setExportOutreachStatus(event.target.value as "" | OutreachStatus)}
                disabled={!token || exportLoading}
              >
                <option value="">All statuses</option>
                <option value="NEW">NEW</option>
                <option value="CONTACTED">CONTACTED</option>
                <option value="RESPONDED">RESPONDED</option>
                <option value="WON">WON</option>
                <option value="LOST">LOST</option>
              </select>
            </label>
          ) : null}

          {exportDataset === "internalLinks" ? (
            <label>
              Internal link status filter
              <select
                value={exportLinkStatus}
                onChange={(event) => setExportLinkStatus(event.target.value as "" | LinkStatus)}
                disabled={!token || exportLoading}
              >
                <option value="">All statuses</option>
                <option value="SUGGESTED">SUGGESTED</option>
                <option value="APPLIED">APPLIED</option>
                <option value="IGNORED">IGNORED</option>
              </select>
            </label>
          ) : null}

          <button type="submit" disabled={!token || exportLoading}>
            {exportLoading ? "Exporting..." : `Download ${exportFormat.toUpperCase()} export`}
          </button>

          {exportError ? <p className="error">{exportError}</p> : null}
          {exportMessage ? <p className="muted">{exportMessage}</p> : null}
        </form>
      </section>
    </>
  );
}
