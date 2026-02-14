# ai-operated-personal-seo-engine

Implementation starter pack for a personal SEO operations platform.

## Included

- Docker services: PostgreSQL 16 + Redis 7 (`docker-compose.yml`)
- Prisma schema under `packages/db/prisma/schema.prisma`
- API scaffold: Fastify + TypeScript (`apps/api`)
- Web scaffold: Next.js + TypeScript dashboard (`apps/web`)
- OpenAPI v1 route docs under `docs/api/openapi.v1.yaml`

## Phase roadmap status

- ✅ Phase 1: Prisma schema + migrations + baseline DB bring-up
- ✅ Phase 7: Auth + projects/pages/keywords/rank snapshots
- ✅ Phase 8 (first vertical slice): content operations for page sections, content briefs, and content tasks workflow
- ✅ Phase 9 (link operations vertical slice): internal links + backlink opportunities CRUD across API, dashboard, tests, and docs
- ✅ Phase 10 (analytics/reporting vertical slice): KPI summaries, funnel metrics, and export-ready analytics endpoints + dashboard panel
- ✅ Phase 11 (automation orchestration vertical slice): recurring daily/weekly automation jobs for analytics snapshot/export, run-now execution, due-job processing, and run history
- ✅ Phase 11.1 hardening: background scheduler loop, DB-backed tick locking + run idempotency guards, and timezone-aware next-run computation
- ✅ Phase 11.2 reliability hardening: scheduler diagnostics/observability, retry/backoff with dead-lettering, and explicit catch-up + DST scheduling policies
- ✅ Phase 11.3 operations hardening: persisted diagnostics history, DLQ operations API/workflow, and persisted alerting hooks with acknowledge flow
- ✅ Phase 11.4 ops polish: bulk DLQ actions with partial-success reporting, outbound webhook notifier abstraction with persisted delivery metadata, and richer automation health KPIs
- ⏳ Remaining later phases: external integrations, deeper audit automation, advanced assistants, and BI/reporting polish

## Phase 1 — Database bring-up (Prisma)

```bash
cd /home/levan/.openclaw/workspace/ai-operated-personal-seo-engine

# 1) Start services
# (requires Docker installed and running)
docker compose up -d

# 2) Install workspace dependencies
corepack pnpm install

# 3) Set Prisma connection string
export DATABASE_URL='postgresql://seo_user:seo_dev_password@localhost:5432/seo_engine?schema=public'

# 4) Generate Prisma client + run migrations
corepack pnpm prisma:generate
corepack pnpm --filter @seo-engine/db exec prisma migrate dev --schema prisma/schema.prisma

# 5) Verify migration state
corepack pnpm --filter @seo-engine/db exec prisma migrate status --schema prisma/schema.prisma
```

## Phase 8 + 9 + 10 + 11 (+ 11.4 ops polish) — Run API + Web (JWT auth + project/pages/keywords/rank snapshots + content/link ops + analytics/reporting + automation orchestration)

```bash
cd /home/levan/.openclaw/workspace/ai-operated-personal-seo-engine

# API runtime configuration
export DATABASE_URL='postgresql://seo_user:seo_dev_password@localhost:5432/seo_engine?schema=public'
export CORS_ORIGIN='http://localhost:3000'
export JWT_SECRET='replace-with-a-long-random-secret'
export TOKEN_TTL='7d'
export BCRYPT_ROUNDS='12'
# Optional internal bootstrap fallback only:
export API_KEY='dev-api-key'
# Phase 11.1 automation scheduler knobs:
export AUTOMATION_SCHEDULER_ENABLED='true'
export AUTOMATION_SCHEDULER_INTERVAL_MS='30000'
export AUTOMATION_SCHEDULER_BATCH_LIMIT='10'
export AUTOMATION_SCHEDULER_LOCK_LEASE_MS='120000'
# Phase 11.3 + 11.4 alert thresholds/transports (optional overrides)
export AUTOMATION_ALERT_DEAD_LETTER_GROWTH_THRESHOLD='1'
export AUTOMATION_ALERT_FAILURE_RATE_THRESHOLD_PCT='50'
export AUTOMATION_ALERT_FAILURE_RATE_MIN_RUNS='5'
export AUTOMATION_ALERT_CONSECUTIVE_FAILURE_THRESHOLD='3'
export AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD='3'
export AUTOMATION_ALERT_FAILURE_RATE_WINDOW_MINUTES='60'
export AUTOMATION_ALERT_CONTENTION_WINDOW_MINUTES='60'
export AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES='30'
# Phase 11.4 outbound alert webhook transport (optional)
export AUTOMATION_ALERT_WEBHOOK_ENABLED='false'
export AUTOMATION_ALERT_WEBHOOK_URL=''
export AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS='5000'
export AUTOMATION_ALERT_WEBHOOK_AUTH_HEADER='authorization'
export AUTOMATION_ALERT_WEBHOOK_AUTH_TOKEN=''

# Web runtime configuration (browser-exposed vars)
export NEXT_PUBLIC_API_BASE_URL='http://localhost:4000'

# API only
corepack pnpm dev:api

# Web only
corepack pnpm dev:web

# API + Web in parallel
corepack pnpm dev
```

### App URLs

- API health (public): `http://localhost:4000/health`
- Auth endpoints: `http://localhost:4000/auth/*`
- API v1 (protected): `http://localhost:4000/v1`
- Web dashboard: `http://localhost:3000`

### Phase 8 + 9 + 10 + 11 (+ 11.4 ops polish) dashboard highlights

- JWT login/register still handled inside the web UI.
- Project CRUD remains available.
- Pages management flow includes:
  - create page form (project + path + optional title/meta/url/status)
  - pages list with search + pagination + sort
  - page detail panel for edit + delete
- Keywords management flow includes:
  - create keyword form (project + optional page + term/locale/device/intent)
  - keywords list with search + filters + pagination + sort
  - keyword detail panel for edit + delete
- Rank snapshot flow includes:
  - ingest form (keyword + rank/engine/locale/device + optional recordedAt/url)
  - snapshot list with project/keyword/date/device/engine filters + pagination + sort
- **Phase 8 content ops** now includes:
  - page sections create/list/detail/edit/delete
  - content briefs create/list/detail/edit/delete (optional linked page/keyword)
  - content tasks create/list/detail/edit/delete + explicit status transition workflow
  - content task transition audit history endpoint (`GET /v1/content-tasks/:id/history`, ordered oldest → newest)
- **Phase 9 link ops** now includes:
  - internal links create/list/detail/edit/delete with project/source/target page integrity checks
  - backlink opportunities create/list/detail/edit/delete with outreach status workflow and date/contact tracking
- **Phase 10 analytics/reporting** now includes:
  - KPI summary cards (owner-global or project-scoped)
  - funnel metrics for content task statuses, backlink outreach statuses, and internal link status distribution
  - export actions wired to `/v1/analytics/export` for JSON/CSV downloads
- **Phase 11 automation orchestration** now includes:
  - recurring automation job definitions (daily/weekly cadence) for `ANALYTICS_SNAPSHOT` and `ANALYTICS_EXPORT`
  - owner-scoped job CRUD + run-now trigger endpoint + deterministic due-job processing endpoint
  - background scheduler loop on API start (configurable env toggle + interval)
  - DB-backed scheduler lease lock + per-run idempotency protection for overlap safety
  - explicit catch-up policy (`skip-missed` vs `replay-missed`) applied during due processing
  - explicit DST policies for ambiguous/non-existent local times with deterministic resolution
  - persisted retry policy (max attempts + bounded exponential backoff) and run attempt metadata
  - dead-letter terminal state for repeatedly failing scheduled jobs
  - owner-safe scheduler diagnostics endpoint (`GET /v1/automation/scheduler/diagnostics`) + persisted diagnostics history endpoint (`GET /v1/automation/scheduler/diagnostics/history`)
  - DLQ operations APIs: list DLQ jobs/runs + acknowledge + requeue + retry-now (`/v1/automation/dlq/*`)
  - **bulk DLQ operations** with partial-success item reporting for ack/requeue/retry-now (`/v1/automation/dlq/jobs/bulk/*`)
  - persisted automation alert events for dead-letter growth, failure-rate/consecutive-failure thresholds, and lock contention spikes (`GET /v1/automation/alerts`, `POST /v1/automation/alerts/:id/ack`)
  - **outbound webhook notifier transport** (pluggable abstraction) with safe-failure semantics and persisted delivery metadata per alert
  - job health summary payloads (success rate, consecutive failures, last error, retry/dead-letter state)
  - richer scheduler health KPIs (open alerts, dead-letter trend, contention/failure trends, outbound delivery counters)
  - persisted run history with trigger/source, status, retry attempt metadata, and output/error summary
  - dashboard panel for create/edit/list/run-now plus automation health/diagnostics, alert ack, DLQ controls, and bulk DLQ actions

## Phase 8 + 9 + 10 + 11 (+ 11.4 ops polish) API examples (curl)

Set once:

```bash
export API_BASE='http://localhost:4000'
export EMAIL='owner@local.dev'
export PASSWORD='change-me-12345'
```

Seed demo credentials (default: creates/updates both `owner@local.dev` and `levan@local.dev` with `change-me-12345`):

```bash
corepack pnpm seed:demo-users
```

Optional overrides:

```bash
DEMO_EMAIL='owner@local.dev' DEMO_PASSWORD='change-me-12345' corepack pnpm seed:demo-user
DEMO_EMAILS='owner@local.dev,levan@local.dev' DEMO_PASSWORD='change-me-12345' corepack pnpm seed:demo-users
```

Register:

```bash
curl -sS -X POST "$API_BASE/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
```

Login and keep token:

```bash
TOKEN=$(curl -sS -X POST "$API_BASE/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.token))")
```

Create project:

```bash
curl -sS -X POST "$API_BASE/v1/projects" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Acme Blog","domain":"acme.com"}'
```

List projects (pagination + search + sort):

```bash
curl -sS "$API_BASE/v1/projects?page=1&limit=20&q=acme&sort=name_asc" \
  -H "authorization: Bearer $TOKEN"
```

Get one project by id:

```bash
export PROJECT_ID='replace_with_project_id'
curl -sS "$API_BASE/v1/projects/$PROJECT_ID" \
  -H "authorization: Bearer $TOKEN"
```

Update project:

```bash
curl -sS -X PATCH "$API_BASE/v1/projects/$PROJECT_ID" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Acme Blog Updated","status":"PAUSED","timezone":"America/New_York"}'
```

Delete project:

```bash
curl -i -X DELETE "$API_BASE/v1/projects/$PROJECT_ID" \
  -H "authorization: Bearer $TOKEN"
```

Create page (project must belong to the authenticated user):

```bash
curl -sS -X POST "$API_BASE/v1/pages" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"path\":\"/blog/ai-seo-guide\",\"title\":\"AI SEO Guide\",\"metaDescription\":\"Phase 8 example page\",\"status\":\"DRAFT\"}"
```

List pages (pagination + search + sort + optional project filter):

```bash
curl -sS "$API_BASE/v1/pages?page=1&limit=20&q=seo&sort=path_asc&projectId=$PROJECT_ID" \
  -H "authorization: Bearer $TOKEN"
```

Get one page by id:

```bash
export PAGE_ID='replace_with_page_id'
curl -sS "$API_BASE/v1/pages/$PAGE_ID" \
  -H "authorization: Bearer $TOKEN"
```

Update page:

```bash
curl -sS -X PATCH "$API_BASE/v1/pages/$PAGE_ID" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"path":"/blog/ai-seo-guide-updated","title":"AI SEO Guide (Updated)","status":"REVIEW"}'
```

Delete page:

```bash
curl -i -X DELETE "$API_BASE/v1/pages/$PAGE_ID" \
  -H "authorization: Bearer $TOKEN"
```

Create keyword (project required, page optional):

```bash
curl -sS -X POST "$API_BASE/v1/keywords" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"pageId\":\"$PAGE_ID\",\"term\":\"ai seo guide\",\"locale\":\"en-US\",\"device\":\"DESKTOP\",\"intent\":\"INFORMATIONAL\",\"isActive\":true}"
```

List keywords (pagination + search + optional filters):

```bash
curl -sS "$API_BASE/v1/keywords?page=1&limit=20&q=seo&projectId=$PROJECT_ID&pageId=$PAGE_ID&device=DESKTOP&isActive=true&sort=updatedAt_desc" \
  -H "authorization: Bearer $TOKEN"
```

Get one keyword by id:

```bash
export KEYWORD_ID='replace_with_keyword_id'
curl -sS "$API_BASE/v1/keywords/$KEYWORD_ID" \
  -H "authorization: Bearer $TOKEN"
```

Update keyword:

```bash
curl -sS -X PATCH "$API_BASE/v1/keywords/$KEYWORD_ID" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"term":"ai seo guide updated","intent":"COMMERCIAL","isActive":false}'
```

Delete keyword:

```bash
curl -i -X DELETE "$API_BASE/v1/keywords/$KEYWORD_ID" \
  -H "authorization: Bearer $TOKEN"
```

Ingest rank snapshot (keyword must belong to authenticated owner):

```bash
curl -sS -X POST "$API_BASE/v1/rank-snapshots" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"keywordId\":\"$KEYWORD_ID\",\"recordedAt\":\"2026-02-12T12:00:00.000Z\",\"engine\":\"GOOGLE\",\"locale\":\"en-US\",\"device\":\"DESKTOP\",\"rank\":7,\"url\":\"https://acme.com/blog/ai-seo-guide\"}"
```

List rank snapshots (pagination + filters + sort):

```bash
curl -sS "$API_BASE/v1/rank-snapshots?page=1&limit=20&projectId=$PROJECT_ID&keywordId=$KEYWORD_ID&engine=GOOGLE&locale=en-US&device=DESKTOP&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.000Z&sort=recordedAt_desc" \
  -H "authorization: Bearer $TOKEN"
```

Create page section:

```bash
curl -sS -X POST "$API_BASE/v1/page-sections" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"pageId\":\"$PAGE_ID\",\"kind\":\"BODY\",\"heading\":\"Main section\",\"content\":\"Draft section content\",\"order\":1}"
```

List page sections (pagination + filters + sort):

```bash
curl -sS "$API_BASE/v1/page-sections?page=1&limit=20&projectId=$PROJECT_ID&pageId=$PAGE_ID&kind=BODY&sort=order_asc" \
  -H "authorization: Bearer $TOKEN"
```

Create content brief:

```bash
curl -sS -X POST "$API_BASE/v1/content-briefs" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"pageId\":\"$PAGE_ID\",\"keywordId\":\"$KEYWORD_ID\",\"title\":\"AI SEO Brief\",\"objective\":\"Ship a conversion-focused article\",\"status\":\"DRAFT\",\"outline\":{\"sections\":[\"intro\",\"workflow\",\"faq\"]}}"
```

List content briefs:

```bash
curl -sS "$API_BASE/v1/content-briefs?page=1&limit=20&projectId=$PROJECT_ID&status=DRAFT&sort=updatedAt_desc" \
  -H "authorization: Bearer $TOKEN"
```

Create content task:

```bash
export BRIEF_ID='replace_with_brief_id'
curl -sS -X POST "$API_BASE/v1/content-tasks" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"briefId\":\"$BRIEF_ID\",\"pageId\":\"$PAGE_ID\",\"type\":\"WRITE\",\"priority\":2,\"status\":\"TODO\"}"
```

Transition content task status:

```bash
export CONTENT_TASK_ID='replace_with_content_task_id'
curl -sS -X POST "$API_BASE/v1/content-tasks/$CONTENT_TASK_ID/transition" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"status":"IN_PROGRESS"}'
```

Get content task transition history (oldest → newest, paginated):

```bash
curl -sS "$API_BASE/v1/content-tasks/$CONTENT_TASK_ID/history?page=1&limit=20" \
  -H "authorization: Bearer $TOKEN"
```

List content tasks:

```bash
curl -sS "$API_BASE/v1/content-tasks?page=1&limit=20&projectId=$PROJECT_ID&status=IN_PROGRESS&type=WRITE&sort=priority_asc" \
  -H "authorization: Bearer $TOKEN"
```

Create internal link:

```bash
export SOURCE_PAGE_ID='replace_with_source_page_id'
export TARGET_PAGE_ID='replace_with_target_page_id'

curl -sS -X POST "$API_BASE/v1/internal-links" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"sourcePageId\":\"$SOURCE_PAGE_ID\",\"targetPageId\":\"$TARGET_PAGE_ID\",\"anchorText\":\"related guide\",\"status\":\"SUGGESTED\"}"
```

List internal links:

```bash
curl -sS "$API_BASE/v1/internal-links?page=1&limit=20&projectId=$PROJECT_ID&status=SUGGESTED&sort=updatedAt_desc" \
  -H "authorization: Bearer $TOKEN"
```

Create backlink opportunity:

```bash
curl -sS -X POST "$API_BASE/v1/backlink-opportunities" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"sourceDomain\":\"news.example.com\",\"targetUrl\":\"https://acme.com/blog/ai-seo-guide\",\"contactEmail\":\"editor@example.com\",\"authorityScore\":72,\"status\":\"NEW\",\"nextActionAt\":\"2026-03-01T10:00:00.000Z\"}"
```

List backlink opportunities:

```bash
curl -sS "$API_BASE/v1/backlink-opportunities?page=1&limit=20&projectId=$PROJECT_ID&status=NEW&hasContactEmail=true&sort=createdAt_desc" \
  -H "authorization: Bearer $TOKEN"
```

Get KPI summary (project-scoped):

```bash
curl -sS "$API_BASE/v1/analytics/kpis?projectId=$PROJECT_ID&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.000Z" \
  -H "authorization: Bearer $TOKEN"
```

Get funnel metrics (owner-global scope):

```bash
curl -sS "$API_BASE/v1/analytics/funnels?from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.000Z" \
  -H "authorization: Bearer $TOKEN"
```

Export backlink opportunities as CSV:

```bash
curl -sS "$API_BASE/v1/analytics/export?dataset=backlinkOpportunities&format=csv&projectId=$PROJECT_ID&outreachStatus=WON" \
  -H "authorization: Bearer $TOKEN" \
  -o phase10-backlinks.csv
```

Export content tasks as JSON:

```bash
curl -sS "$API_BASE/v1/analytics/export?dataset=contentTasks&format=json&projectId=$PROJECT_ID&contentTaskStatus=DONE&page=1&limit=100" \
  -H "authorization: Bearer $TOKEN"
```

Create a daily automation snapshot job:

```bash
AUTOMATION_JOB_ID=$(curl -sS -X POST "$API_BASE/v1/automation/jobs" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"name\":\"Daily KPI Snapshot\",\"type\":\"ANALYTICS_SNAPSHOT\",\"cadence\":\"DAILY\",\"runAtHour\":8,\"runAtMinute\":0,\"timezone\":\"UTC\",\"catchUpMode\":\"skip-missed\",\"dstAmbiguousTimePolicy\":\"earlier-offset\",\"dstInvalidTimePolicy\":\"shift-forward\",\"retryMaxAttempts\":3,\"retryBackoffSeconds\":60,\"retryMaxBackoffSeconds\":900,\"config\":{\"windowDays\":7}}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.id))")
```

Trigger an automation job immediately:

```bash
curl -sS -X POST "$API_BASE/v1/automation/jobs/$AUTOMATION_JOB_ID/trigger" \
  -H "authorization: Bearer $TOKEN"
```

Process due automation jobs (deterministic manual scheduler tick for testing/explicit control):

```bash
curl -sS -X POST "$API_BASE/v1/automation/jobs/process-due" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"now":"2026-02-12T08:05:00.000Z","limit":20}'
```

Inspect scheduler + automation diagnostics (owner-safe):

```bash
curl -sS "$API_BASE/v1/automation/scheduler/diagnostics" \
  -H "authorization: Bearer $TOKEN"
```

Inspect persisted scheduler diagnostics history:

```bash
curl -sS "$API_BASE/v1/automation/scheduler/diagnostics/history?page=1&limit=20&outcome=contention" \
  -H "authorization: Bearer $TOKEN"
```

List dead-letter queue jobs + failed runs:

```bash
curl -sS "$API_BASE/v1/automation/dlq/jobs?page=1&limit=20" \
  -H "authorization: Bearer $TOKEN"

curl -sS "$API_BASE/v1/automation/dlq/runs?page=1&limit=20" \
  -H "authorization: Bearer $TOKEN"
```

Acknowledge/requeue/retry-now from DLQ:

```bash
curl -sS -X POST "$API_BASE/v1/automation/dlq/jobs/$AUTOMATION_JOB_ID/ack" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"note":"Investigating"}'

curl -sS -X POST "$API_BASE/v1/automation/dlq/jobs/$AUTOMATION_JOB_ID/requeue" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"recomputeFrom":"2026-02-12T09:00:00.000Z"}'

curl -sS -X POST "$API_BASE/v1/automation/dlq/jobs/$AUTOMATION_JOB_ID/retry-now" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{}'
```

Bulk DLQ operations with per-item partial success reporting:

```bash
curl -sS -X POST "$API_BASE/v1/automation/dlq/jobs/bulk/ack" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"jobIds\":[\"$AUTOMATION_JOB_ID\",\"job_id_2\"],\"note\":\"bulk ack\"}"

curl -sS -X POST "$API_BASE/v1/automation/dlq/jobs/bulk/requeue" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"jobIds\":[\"$AUTOMATION_JOB_ID\",\"job_id_2\"],\"recomputeFrom\":\"2026-02-12T09:00:00.000Z\"}"

curl -sS -X POST "$API_BASE/v1/automation/dlq/jobs/bulk/retry-now" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"jobIds\":[\"$AUTOMATION_JOB_ID\",\"job_id_2\"]}"
```

List and acknowledge automation alerts:

```bash
ALERT_ID=$(curl -sS "$API_BASE/v1/automation/alerts?page=1&limit=20&status=OPEN" \
  -H "authorization: Bearer $TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);console.log(p.data?.[0]?.id||'')})")

curl -sS -X POST "$API_BASE/v1/automation/alerts/$ALERT_ID/ack" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"note":"acknowledged"}'
```

Phase 11.1 scheduler runtime defaults and knobs:

- `AUTOMATION_SCHEDULER_ENABLED=true`
- `AUTOMATION_SCHEDULER_INTERVAL_MS=30000`
- `AUTOMATION_SCHEDULER_BATCH_LIMIT=10`
- `AUTOMATION_SCHEDULER_LOCK_LEASE_MS=120000`

Phase 11.3 + 11.4 alerting knobs:

- `AUTOMATION_ALERT_DEAD_LETTER_GROWTH_THRESHOLD=1`
- `AUTOMATION_ALERT_FAILURE_RATE_THRESHOLD_PCT=50`
- `AUTOMATION_ALERT_FAILURE_RATE_MIN_RUNS=5`
- `AUTOMATION_ALERT_CONSECUTIVE_FAILURE_THRESHOLD=3`
- `AUTOMATION_ALERT_CONTENTION_SPIKE_THRESHOLD=3`
- `AUTOMATION_ALERT_FAILURE_RATE_WINDOW_MINUTES=60`
- `AUTOMATION_ALERT_CONTENTION_WINDOW_MINUTES=60`
- `AUTOMATION_ALERT_DEDUPE_WINDOW_MINUTES=30`
- `AUTOMATION_ALERT_WEBHOOK_ENABLED=false`
- `AUTOMATION_ALERT_WEBHOOK_URL=`
- `AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS=5000`
- `AUTOMATION_ALERT_WEBHOOK_AUTH_HEADER=authorization`
- `AUTOMATION_ALERT_WEBHOOK_AUTH_TOKEN=`

Webhook transport setup example:

```bash
export AUTOMATION_ALERT_WEBHOOK_ENABLED='true'
export AUTOMATION_ALERT_WEBHOOK_URL='https://ops.example.com/hooks/automation-alerts'
export AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS='5000'
# Optional auth header/token for receiver-side verification
export AUTOMATION_ALERT_WEBHOOK_AUTH_HEADER='authorization'
export AUTOMATION_ALERT_WEBHOOK_AUTH_TOKEN='Bearer replace-me'
```

Recommended defaults:

- Keep enabled in normal API runtime.
- Disable in integration/unit tests unless explicitly testing scheduler behavior.
- Keep lock lease >= 4x interval to tolerate slow ticks.

Phase 11.2 + 11.3 + 11.4 operator guidance:

- **Catch-up mode**
  - `skip-missed`: run once at next scheduler tick and jump to the next future slot.
  - `replay-missed`: replay each missed schedule slot (bounded by `process-due` `limit` per call).
- **DST handling**
  - `dstAmbiguousTimePolicy=earlier-offset|later-offset` controls which offset is used when local time repeats (fall-back).
  - `dstInvalidTimePolicy=shift-forward|skip` controls behavior when local time does not exist (spring-forward).
- **Retry + dead-letter**
  - `retryMaxAttempts` includes the first attempt (for example, `3` = first attempt + up to 2 retries).
  - Retry delay is bounded exponential backoff: `min(retryMaxBackoffSeconds, retryBackoffSeconds * 2^(attempt-1))`.
  - After final failed attempt, job is moved to `DEAD_LETTER`, `nextRunAt=null`, and requires manual intervention.
- **DLQ workflow (11.3 + 11.4)**
  - List dead-letter jobs/runs from `/v1/automation/dlq/jobs` and `/v1/automation/dlq/runs`.
  - Acknowledge DLQ items with `/v1/automation/dlq/jobs/:id/ack` (idempotent).
  - Requeue with `/v1/automation/dlq/jobs/:id/requeue` or attempt immediate execution with `/v1/automation/dlq/jobs/:id/retry-now`.
  - Bulk operations are available at `/v1/automation/dlq/jobs/bulk/ack|requeue|retry-now` with per-item partial-success results.
- **Persisted diagnostics (11.3 + 11.4)**
  - Runtime endpoint remains `/v1/automation/scheduler/diagnostics` (backward compatible, additive KPI extensions).
  - Historical view is `/v1/automation/scheduler/diagnostics/history` with pagination/date-range/outcome filters.
  - Health payload now includes open alerts count, dead-letter/contention/failure trends, and outbound delivery counters.
- **Alerting hooks + outbound transport (11.3 + 11.4)**
  - Alerts persist for dead-letter growth, failure-rate/consecutive-failure thresholds, and lock contention spikes.
  - Optional webhook transport dispatches alert events asynchronously and records delivery status/error/attempt metadata without blocking alert persistence.
  - Use `/v1/automation/alerts` to list and `/v1/automation/alerts/:id/ack` to acknowledge.
- **Troubleshooting workflow**
  - Check `/v1/automation/scheduler/diagnostics` for lock contention, overlap skips, owner run stats, and recent failures.
  - Use `/v1/automation/scheduler/diagnostics/history` for historical tick evidence.
  - Inspect `/v1/automation/jobs/:id` health fields for `consecutiveFailures`, `lastError`, retry state, and dead-letter timestamp.
  - Inspect `/v1/automation/jobs/:id/runs` attempt metadata (`attemptNumber`, `maxAttempts`, `nextRetryAt`) for retry progression.

List run history for a job:

```bash
curl -sS "$API_BASE/v1/automation/jobs/$AUTOMATION_JOB_ID/runs?page=1&limit=20" \
  -H "authorization: Bearer $TOKEN"
```

## Run API integration tests

The integration tests cover:

- auth register/login happy path
- projects CRUD + ownership scoping
- pages CRUD + ownership scoping
- keywords CRUD + ownership scoping
- rank snapshot ingest/list + ownership scoping + range validation
- page sections CRUD + ownership scoping + order conflict validation
- content briefs CRUD + ownership scoping
- content tasks CRUD + ownership scoping + explicit status transition validation + transition history audit trail endpoint
- internal links CRUD + ownership scoping + project/source/target page integrity + duplicate prevention
- backlink opportunities CRUD + ownership scoping + validation/filter coverage
- analytics/reporting KPI + funnel coverage + owner scoping + date-range filtering
- analytics export endpoint coverage (JSON + CSV payload sanity/content-type + scoping/filter validation)
- automation orchestration coverage: owner-scoped job lifecycle, run-now execution, run history, daily/weekly due-processing semantics, overlap-safety concurrency, timezone-aware next-run boundaries, background scheduler/manual parity, scheduler diagnostics ownership safety, retry/backoff progression, dead-letter transitions, catch-up replay semantics, DST policy determinism, overlap safety during retries, persisted diagnostics history query integrity, DLQ operations lifecycle + owner scoping + bulk partial-success behavior, outbound webhook delivery metadata (success/failure), and enriched diagnostics KPI payload baseline correctness

Requirements:

- PostgreSQL is running (`docker compose up -d`)
- optional: set `TEST_DATABASE_URL` to override the isolated test target
- optional: set `JWT_SECRET` (tests fall back to a test-only value)

Run from repo root:

```bash
corepack pnpm test
```

This command generates Prisma client, applies migrations (`migrate deploy`), and runs API integration tests **against `TEST_DATABASE_URL`**.

Default test target:

- `postgresql://seo_user:seo_dev_password@localhost:5432/seo_engine?schema=integration_tests`

Safety guardrails:

- Test runner refuses to execute if DB target does not look like a dedicated test DB/schema.
- This prevents integration tests from mutating local dev login users.

## Post-update login smoke check

After pulling updates and running migrations/tests, run:

```bash
corepack pnpm verify:login
```

Checks performed:

- `GET /health`
- `POST /auth/login` for `owner@local.dev` and `levan@local.dev` with `change-me-12345`

If either login fails, repair and re-check in one command:

```bash
corepack pnpm repair:login
```

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`

- starts PostgreSQL service
- installs dependencies
- runs Prisma generate
- runs `corepack pnpm build`
- runs `corepack pnpm test`

## Environment files

- Root template: `.env.example`
- API template: `apps/api/.env.example`
- Web template: `apps/web/.env.example`
- DB template: `packages/db/.env.example`

## Notes

- `/health` is public.
- `/auth/register`, `/auth/login` are public.
- `/auth/me` and `/v1/*` require `Authorization: Bearer <token>`.
- Optional internal bootstrap mode remains supported when both `API_KEY` and `x-owner-email` are sent.
- Project, page, keyword, rank snapshot, page section, content brief, content task, internal link, backlink opportunity, analytics/reporting, and automation orchestration endpoints are scoped by authenticated user ID.
- Page `path` values are normalized (leading slash, no query/hash, no trailing slash except `/`).
- Page `url` values are normalized to HTTP(S); when omitted on create (or when only `path` changes on update), URL is derived from project domain.
- CORS allows `http://localhost:3000` by default.
