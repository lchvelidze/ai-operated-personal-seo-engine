# AI-Operated Personal SEO Engine — Full Owner Manual (Phase 11.4)

> Project: `ai-operated-personal-seo-engine`  
> Manual audience: owner/operator (technical, wants full practical understanding)  
> Codebase state covered: **through Phase 11.4**

---

## 1) What this system is (in plain language)

This is your **SEO operations control center** for personal-brand growth.

It gives you one place to:
- manage your SEO entities (projects, pages, keywords, rank snapshots),
- run content and link operations workflows,
- measure KPI/funnel progress,
- and automate recurring analytics/export jobs with operational safety controls.

For your specific goal (ranking the name **"Levan Chvelidze"**), this system helps by turning SEO from ad-hoc work into a repeatable pipeline:
1. Define the pages and keyword targets tied to your name.
2. Track rankings over time for branded/non-branded terms.
3. Plan and execute content + internal link + backlink tasks.
4. Measure outcomes and detect operational failures early.
5. Automate recurring reporting and snapshots so progress never goes dark.

---

## 2) How it helps rank “Levan Chvelidze” specifically

For personal-brand SEO, ranking is mostly a consistency + authority game. This platform supports that by:

- **Entity consistency:** You keep a clean map of branded pages and keyword intent.
- **Publishing discipline:** Content briefs/tasks make content production trackable (not vague).
- **Link graph control:** Internal link suggestions/applied state improves crawlability and topical flow.
- **Authority pipeline:** Backlink opportunities/outreach statuses prevent “I forgot to follow up” loss.
- **Outcome visibility:** KPIs + funnels show whether work is translating into rank/reach progress.
- **Reliability:** Scheduler + retries + DLQ + alerts reduce silent automation failure.

---

## 3) End-to-end architecture

## 3.1 Components

- **Web app (`apps/web`)**
  - Next.js 14 dashboard (React).
  - Talks to API via `NEXT_PUBLIC_API_BASE_URL`.
  - Main UX for auth + all CRUD/analytics/automation panels.

- **API (`apps/api`)**
  - Fastify + TypeScript.
  - Public routes: `/health`, `/auth/register`, `/auth/login`.
  - Protected routes: `/auth/me`, `/v1/*`.
  - JWT auth (plus optional bootstrap header mode for internal/dev fallback).

- **Database (`packages/db`, PostgreSQL via Prisma)**
  - Core SEO entities + automation entities.
  - Owner scoping is enforced in route logic for data isolation.

- **Scheduler (inside API process)**
  - Background interval loop (configurable env vars).
  - DB lock (`scheduler_locks`) prevents multi-runner collisions.
  - Uses same due-processing path as manual `/v1/automation/jobs/process-due`.

- **Diagnostics + Alerts subsystem**
  - Runtime diagnostics + persisted tick history.
  - DLQ workflows (ack/requeue/retry-now; single + bulk).
  - Alert event persistence with optional outbound webhook notifier.

## 3.2 Data flow (simplified)

1. Dashboard action -> API endpoint (`/v1/...`).
2. API validates input + owner scope.
3. API writes/reads via Prisma/Postgres.
4. Scheduler periodically claims due jobs and executes analytics snapshot/export logic.
5. Failures trigger retry/backoff; terminal failures move to `DEAD_LETTER`.
6. Alert rules evaluate contention/failure/dead-letter signals; alerts can be acknowledged.
7. Dashboard reads diagnostics/alerts/DLQ for operator action.

---

## 4) Feature areas by phase (implemented scope)

## Phase 5 (implemented foundation)

**What exists now:** data-model foundation for indexing/publish-related operations:
- `indexing_requests` model + enums (`IndexingStatus`, `IndexingProvider`).

**Why it matters for SEO:** indexing lifecycle is part of technical SEO readiness.

**Current state in 11.4:** schema is present; full owner-facing API/UI workflows are not yet exposed in active routes.

## Phase 6 (implemented foundation)

**What exists now:** data-model foundation for analytics/audits/jobs:
- `analytics_daily`, `audit_issues`, base `job_runs` and related enums.

**Why it matters:** this is the backbone for long-term technical/measurement capabilities.

**Current state in 11.4:** foundational schema exists; major owner-visible workflow focus moved to Phases 7–11.4.

## Phase 7 (fully active)

- JWT auth register/login/me.
- Project CRUD.
- Page CRUD (path/url normalization, domain-derived URL behavior).
- Keyword CRUD (locale/device/intent/isActive).
- Rank snapshot ingest + list with filters.

**SEO value:** establishes your source-of-truth corpus and rank tracking baseline.

## Phase 8 (fully active: content ops vertical slice)

- Page section CRUD.
- Content brief CRUD (optional page/keyword linkage).
- Content task CRUD.
- Explicit task status transitions + audit trail endpoint (`/history`).

**SEO value:** content production and optimization become measurable workflows instead of loose notes.

## Phase 9 (fully active: link ops vertical slice)

- Internal link CRUD with source/target/project integrity checks + duplicate prevention.
- Backlink opportunity CRUD with outreach states and action timing.

**SEO value:** strengthens crawl path + authority growth loop.

## Phase 10 (fully active: analytics/reporting vertical slice)

- KPI summary endpoint.
- Funnel metrics endpoint.
- Export endpoint (JSON/CSV) for KPI/contentTasks/backlinkOpportunities/internalLinks.

**SEO value:** lets you prove whether operational effort is actually moving outcomes.

## Phase 11 (fully active: automation orchestration)

- Recurring automation jobs (daily/weekly) for `ANALYTICS_SNAPSHOT` and `ANALYTICS_EXPORT`.
- Run-now trigger.
- Manual due-processing endpoint.
- Run history endpoint.

**SEO value:** keeps reporting and trend capture consistent without manual babysitting.

## Phase 11.1 hardening (active)

- Background scheduler loop on API startup.
- DB-backed lock lease for contention control.
- Run idempotency guards.
- Timezone-aware next-run computation.

## Phase 11.2 reliability hardening (active)

- Retry/backoff policy with bounded exponential strategy.
- Dead-letter terminal state.
- Catch-up policies: `skip-missed` vs `replay-missed`.
- DST policies for ambiguous/missing local times.
- Scheduler diagnostics endpoint.

## Phase 11.3 operations hardening (active)

- Persisted diagnostics history endpoint.
- DLQ operations API (ack/requeue/retry-now).
- Persisted alert events + acknowledge flow.

## Phase 11.4 ops polish (active)

- Bulk DLQ actions with partial-success per-item reporting.
- Outbound webhook notifier abstraction for alerts.
- Persisted alert delivery metadata (attempts/status/errors).
- Richer diagnostics health KPIs (open alerts/trends/delivery counters).

---

## 5) Data model overview (core entities + relationships)

Think of the model in 5 clusters:

1. **Identity + ownership**
   - `User` -> owns many `Project`.

2. **SEO inventory + tracking**
   - `Project` -> many `Page`, `Keyword`, `RankSnapshot`.
   - `Page` can have many `PageSection`.
   - `Keyword` optionally links to one landing `Page`.
   - `RankSnapshot` belongs to a `Keyword` and a `Project`.

3. **Content workflow**
   - `ContentBrief` belongs to project (optional page/keyword links).
   - `ContentTask` belongs to project (optional brief/page links, optional jobRun link).
   - `ContentTaskTransitionEvent` logs status changes (actor + note + timestamp).

4. **Link workflow**
   - `InternalLink` belongs to project; connects source page -> target page.
   - `BacklinkOpportunity` belongs to project; tracks outreach status and follow-up fields.

5. **Automation + ops reliability**
   - `ScheduledJob` defines recurring automation behavior and health counters.
   - `JobRun` stores each execution attempt/outcome.
   - `SchedulerLock` guards scheduler lease ownership.
   - `AutomationSchedulerTickEvent` stores scheduler tick history.
   - `AutomationDlqEvent` logs DLQ operator actions.
   - `AutomationAlertEvent` stores generated alerts + delivery metadata + ack state.

---

## 6) Typical owner workflows

## Workflow A: Start a new personal-brand SEO campaign

1. Login.
2. Create project (e.g., `Levan Personal Brand`, domain set).
3. Create core pages (`/`, `/about-levan-chvelidze`, `/projects`, `/media-kit`, `/contact`).
4. Add branded and adjacent keywords.
5. Ingest first rank snapshots.

## Workflow B: Content production cycle

1. Add page sections for target pages.
2. Create brief linked to project/page/keyword.
3. Create content task(s): WRITE -> OPTIMIZE -> REFRESH.
4. Transition statuses as work progresses.
5. Use `/v1/content-tasks/:id/history` when reviewing execution quality.

## Workflow C: Link growth cycle

1. Create internal link suggestions.
2. Move `SUGGESTED -> APPLIED` as pages are updated.
3. Add backlink opportunities and outreach states.
4. Use `nextActionAt` and `lastContactedAt` to enforce follow-through.

## Workflow D: Analytics + automation

1. Validate KPI/funnel baselines in analytics panel.
2. Export a reference snapshot.
3. Create daily/weekly automation jobs.
4. Periodically inspect diagnostics + alerts + DLQ.
5. If dead-letter occurs, ack/requeue/retry-now (single or bulk).

---

## 7) API overview (active endpoint groups)

> Note: `docs/api/openapi.v1.yaml` contains forward-looking stubs too. Treat runtime routes in `apps/api/src/routes/*` as source of truth for active behavior.

## 7.1 Health + Auth

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (Bearer required)

Example login response:
```json
{
  "data": {
    "token": "<jwt>",
    "user": {
      "id": "clx...",
      "email": "owner@local.dev",
      "createdAt": "2026-02-13T00:00:00.000Z",
      "updatedAt": "2026-02-13T00:00:00.000Z"
    }
  }
}
```

## 7.2 Core SEO inventory

- Projects: `/v1/projects` (+ `/:id`)
- Pages: `/v1/pages` (+ `/:id`)
- Keywords: `/v1/keywords` (+ `/:id`)
- Rank snapshots: `/v1/rank-snapshots`

Example create project request:
```json
{ "name": "Levan Personal Brand", "domain": "levanchvelidze.com" }
```

Example response:
```json
{
  "data": {
    "id": "clx...",
    "ownerId": "clu...",
    "name": "Levan Personal Brand",
    "slug": "levan-personal-brand",
    "domain": "levanchvelidze.com",
    "timezone": "UTC",
    "status": "ACTIVE",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

## 7.3 Content ops (Phase 8)

- Page sections: `/v1/page-sections` (+ `/:id`)
- Briefs: `/v1/content-briefs` (+ `/:id`)
- Tasks: `/v1/content-tasks` (+ `/:id`, `/:id/transition`, `/:id/history`)

Example transition:
```http
POST /v1/content-tasks/:id/transition
```
```json
{ "status": "DONE", "note": "Draft is complete" }
```

History response shape includes actor metadata:
```json
{
  "data": [
    {
      "fromStatus": "IN_PROGRESS",
      "toStatus": "DONE",
      "actor": { "userId": "clu...", "email": "owner@local.dev", "source": "jwt" },
      "timestamp": "2026-02-13T...Z"
    }
  ]
}
```

## 7.4 Link ops (Phase 9)

- Internal links: `/v1/internal-links` (+ `/:id`)
- Backlink opportunities: `/v1/backlink-opportunities` (+ `/:id`)

## 7.5 Analytics/reporting (Phase 10)

- `GET /v1/analytics/kpis`
- `GET /v1/analytics/funnels`
- `GET /v1/analytics/export?dataset=...&format=json|csv`

Example KPI response (trimmed):
```json
{
  "data": {
    "scope": { "projectId": null, "from": null, "to": null },
    "inventory": { "projects": 1, "pages": 5, "keywords": 20, "activeKeywords": 18 },
    "activity": { "rankSnapshots": 120, "averageRank": 12.4, "top10Rate": 41.67 }
  }
}
```

## 7.6 Automation + diagnostics + alerts + DLQ (Phase 11–11.4)

- Jobs: `/v1/automation/jobs` (+ `/:id`, `/:id/trigger`, `/:id/runs`, `process-due`)
- Diagnostics: `/v1/automation/scheduler/diagnostics`, `/history`
- Alerts: `/v1/automation/alerts`, `/alerts/:id/ack`
- DLQ single actions: `/v1/automation/dlq/jobs/:id/ack|requeue|retry-now`
- DLQ bulk actions: `/v1/automation/dlq/jobs/bulk/ack|requeue|retry-now`

Example bulk action response (partial-success semantics):
```json
{
  "data": {
    "action": "ack",
    "requested": 6,
    "succeeded": 2,
    "failed": 4,
    "results": [
      { "jobId": "jobA", "ok": true, "alreadyAcknowledged": false },
      { "jobId": "jobB", "ok": false, "code": "INVALID_STATUS", "message": "..." }
    ]
  }
}
```

---

## 8) Dashboard panel guide (what each panel is for)

## Base dashboard panels

- **Authentication**: login/register/logout + API base visibility.
- **Create Project / Projects / Project Detail**: manage project lifecycle (status/timezone/domain).
- **Create Page / Pages / Page Detail**: maintain URL/path/title/meta inventory.
- **Create Keyword / Keywords / Keyword Detail**: keyword targeting matrix and landing-page mapping.
- **Ingest Rank Snapshot / Rank Snapshots**: ranking timeline ingestion + filtered review.

## Phase 8 panel (Content Ops)

- Create/list/edit **Page Sections**.
- Create/list/edit **Content Briefs**.
- Create/list/edit **Content Tasks**.
- **Task Detail + Workflow** includes explicit status transition action.

Use this panel to enforce editorial throughput and avoid “content stuck in drafts forever.”

## Phase 9 panel (Link Ops)

- Create/list/edit **Internal Links**.
- Create/list/edit **Backlink Opportunities**.

Use this to keep internal structure and outreach pipeline continuously active.

## Phase 10 panel (Analytics & Reporting)

- KPI cards for inventory/activity outcomes.
- Funnel tables for task/backlink/internal-link status distributions.
- Export controls for JSON/CSV datasets.

Use this for weekly/monthly operator reviews and external reporting artifacts.

## Phase 11 panel (Automation Orchestration)

- Create/edit automation jobs with cadence/timezone/retry/catch-up/DST policies.
- View jobs table with health fields.
- Run now + process due jobs.
- View recent runs.
- Automation health diagnostics block.
- Alerts table with ack action.
- DLQ table with single and bulk controls.
- Persisted scheduler tick history table.

Use this panel as your SEO operations NOC (network-operations-style control center).

---

## 9) Operations runbook

## 9.1 Required services

From repo root:
```bash
docker compose up -d
```

Services:
- Postgres 16 (`localhost:5432`) — required.
- Redis 7 (`localhost:6379`) — available for future usage.
- pgAdmin profile available (`--profile tools`).

## 9.2 Environment variables (important)

Core:
- `DATABASE_URL`
- `TEST_DATABASE_URL`
- `JWT_SECRET`
- `TOKEN_TTL`
- `BCRYPT_ROUNDS`
- `NEXT_PUBLIC_API_BASE_URL`
- `CORS_ORIGIN`

Automation scheduler:
- `AUTOMATION_SCHEDULER_ENABLED`
- `AUTOMATION_SCHEDULER_INTERVAL_MS`
- `AUTOMATION_SCHEDULER_BATCH_LIMIT`
- `AUTOMATION_SCHEDULER_LOCK_LEASE_MS`

Alert thresholds + webhook:
- `AUTOMATION_ALERT_DEAD_LETTER_GROWTH_THRESHOLD`
- `AUTOMATION_ALERT_FAILURE_RATE_THRESHOLD_PCT`
- `AUTOMATION_ALERT_FAILURE_RATE_MIN_RUNS`
- `AUTOMATION_ALERT_CONSECUTIVE_FAILURE_THRESHOLD`
- `AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD`
- `AUTOMATION_ALERT_FAILURE_RATE_WINDOW_MINUTES`
- `AUTOMATION_ALERT_CONTENTION_WINDOW_MINUTES`
- `AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES`
- `AUTOMATION_ALERT_WEBHOOK_ENABLED`
- `AUTOMATION_ALERT_WEBHOOK_URL`
- `AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS`
- `AUTOMATION_ALERT_WEBHOOK_AUTH_HEADER`
- `AUTOMATION_ALERT_WEBHOOK_AUTH_TOKEN`

## 9.3 Daily commands

```bash
corepack pnpm dev          # api + web
corepack pnpm dev:api      # api only (runs migrate deploy first)
corepack pnpm dev:web      # web only
corepack pnpm build
corepack pnpm test
```

Helpful ops:
```bash
corepack pnpm seed:demo-users
corepack pnpm verify:login
corepack pnpm repair:login
```

## 9.4 Login credentials

Default seeded users:
- `owner@local.dev`
- `levan@local.dev`

Default password:
- `change-me-12345`

Seed/repair command:
```bash
corepack pnpm seed:demo-users
```

## 9.5 Troubleshooting common failures

### A) `.next` missing chunk / chunk load errors (web)

Symptoms:
- Browser shows missing `_next/static/chunks/...` file.
- Random chunk load failures after pulling updates.

Fix:
```bash
# from repo root
rm -rf apps/web/.next
corepack pnpm dev:web
```
Then hard refresh browser (Ctrl+Shift+R).

### B) Stale API route behavior (endpoint exists in code but 404/old response)

Symptoms:
- You changed route code but API behaves like old build.

Fix sequence:
1. Stop API process completely.
2. If running built mode, rebuild:
   ```bash
   rm -rf apps/api/dist
   corepack pnpm build:api
   ```
3. Prefer dev watch mode for iteration:
   ```bash
   corepack pnpm dev:api
   ```
4. Confirm route with:
   ```bash
   curl -i http://localhost:4000/health
   ```

Also verify web points to right API base (`NEXT_PUBLIC_API_BASE_URL`).

### C) Auth failures after update

```bash
corepack pnpm repair:login
```

### D) Tests refuse DB target

`test:api` intentionally blocks non-test DBs. Set `TEST_DATABASE_URL` to a dedicated test schema/db.

---

## 10) Practical personal-brand playbook (Levan Chvelidze)

## 10.1 30/60/90 day plan

### Days 0–30 (foundation + indexing hygiene)
- Build branded page set.
- Define branded keyword clusters.
- Start daily rank snapshot ingestion.
- Create first briefs/tasks for bio, projects, expertise pages.
- Begin internal linking baseline.

### Days 31–60 (authority + consistency)
- Publish/refresh supporting content tied to branded intent.
- Run backlink outreach cadence (new -> contacted -> responded).
- Add weekly KPI export automation and review trend deltas.
- Resolve any recurring task bottlenecks from funnel view.

### Days 61–90 (scaling + reliability)
- Expand long-tail and entity-adjacent pages.
- Tighten internal links around top-converting pages.
- Introduce DLQ/alerts operational review rhythm.
- Tune automation schedule/catch-up/retry for zero-silence monitoring.

## 10.2 Suggested page set

- `/` (primary personal hub)
- `/about-levan-chvelidze`
- `/projects`
- `/case-studies`
- `/speaking`
- `/media-kit`
- `/contact`
- `/blog/levan-chvelidze-seo-engineering`

## 10.3 Suggested keyword starter set

Branded:
- `levan chvelidze`
- `levan chvelidze bio`
- `levan chvelidze projects`

Adjacent authority:
- `ai seo operations`
- `technical seo automation`
- `personal brand seo engineer`
- `seo workflow automation`

## 10.4 Sample content tasks

- WRITE: “About Levan Chvelidze” long-form profile page.
- OPTIMIZE: homepage title/meta + internal anchor updates.
- REFRESH: case study pages with new proof points.
- INTERNAL_LINKS: add contextual links from blog -> services/projects.
- OUTREACH: acquire profile mentions/interviews/citations.

## 10.5 Sample internal links

- `/about-levan-chvelidze` -> `/projects` (anchor: "selected projects")
- `/projects` -> `/case-studies` (anchor: "full case studies")
- `/blog/...` -> `/about-levan-chvelidze` (anchor: "Levan Chvelidze")

## 10.6 Sample backlink opportunities

- Industry podcasts (guest profile page links).
- Newsletter interviews.
- Founder/engineer directories.
- Conference speaker bios.
- Partner/client testimonial pages.

---

## 11) Example demo data package

Use this seed package in your own environment:

- Project: `Levan Personal Brand` (`levanchvelidze.com`)
- Pages: homepage + about + projects + case studies + contact
- Keywords: 15–30 (mix branded + adjacent)
- Content briefs: 5 (one per key page)
- Content tasks: 10+ with varied statuses
- Internal links: 15+
- Backlink opportunities: 20+ with outreach statuses
- Rank snapshots: daily records for top keywords
- Automation jobs:
  - Daily `ANALYTICS_SNAPSHOT` (08:00 local)
  - Weekly `ANALYTICS_EXPORT` (Mon 09:00 local)

---

## 12) Quick system health checklist

Run in this order:

1. **Infra up**
   - `docker compose ps` shows healthy Postgres.

2. **API health**
   - `curl http://localhost:4000/health` returns `{status:"ok"}`.

3. **Login smoke**
   - `corepack pnpm verify:login` passes.

4. **Web connectivity**
   - Open `http://localhost:3000`, login succeeds, project list loads.

5. **Core CRUD sanity**
   - Create project/page/keyword, ingest one rank snapshot.

6. **Automation sanity**
   - Create one automation job, trigger run-now, verify run history.

7. **Diagnostics sanity**
   - `/v1/automation/scheduler/diagnostics` returns scheduler + owner blocks.

8. **Build + test gate**
   - `corepack pnpm build`
   - `corepack pnpm test`

If all pass, the platform is operational for production-like SEO operations.

---

## 13) Final notes for ownership

- The strongest value here is **workflow reliability**, not one-off cleverness.
- Keep KPI and funnel review weekly.
- Treat DLQ/alerts as an operations discipline.
- Use this as the execution engine behind your personal-brand narrative strategy for **Levan Chvelidze**.
