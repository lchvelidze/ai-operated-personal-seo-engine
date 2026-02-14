-- Phase 11.3: persistent diagnostics history, DLQ operations, alerting hooks

DO $$ BEGIN
  CREATE TYPE "AutomationDlqAction" AS ENUM ('ACKNOWLEDGED', 'REQUEUED', 'RETRIED_NOW');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AutomationAlertType" AS ENUM ('DEAD_LETTER_GROWTH', 'FAILURE_RATE', 'CONSECUTIVE_FAILURES', 'LOCK_CONTENTION_SPIKE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AutomationAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AutomationAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "scheduled_jobs"
  ADD COLUMN IF NOT EXISTS "deadLetterAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deadLetterAcknowledgedByUserId" TEXT;

CREATE TABLE IF NOT EXISTS "automation_scheduler_tick_events" (
  "id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "remainingDue" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" TEXT,
  "isContention" BOOLEAN NOT NULL DEFAULT false,
  "isOverlapSkip" BOOLEAN NOT NULL DEFAULT false,
  "tickedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_scheduler_tick_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "automation_scheduler_tick_events_tickedAt_idx"
  ON "automation_scheduler_tick_events"("tickedAt");
CREATE INDEX IF NOT EXISTS "automation_scheduler_tick_events_outcome_tickedAt_idx"
  ON "automation_scheduler_tick_events"("outcome", "tickedAt");

CREATE TABLE IF NOT EXISTS "automation_dlq_events" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "scheduledJobId" TEXT NOT NULL,
  "jobRunId" TEXT,
  "action" "AutomationDlqAction" NOT NULL,
  "note" TEXT,
  "metadata" JSONB,
  "idempotencyKey" TEXT,
  "performedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_dlq_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "automation_dlq_events_ownerId_createdAt_idx"
  ON "automation_dlq_events"("ownerId", "createdAt");
CREATE INDEX IF NOT EXISTS "automation_dlq_events_scheduledJobId_createdAt_idx"
  ON "automation_dlq_events"("scheduledJobId", "createdAt");
CREATE INDEX IF NOT EXISTS "automation_dlq_events_action_createdAt_idx"
  ON "automation_dlq_events"("action", "createdAt");

DO $$ BEGIN
  ALTER TABLE "automation_dlq_events"
    ADD CONSTRAINT "automation_dlq_events_ownerId_action_idempotencyKey_key"
    UNIQUE ("ownerId", "action", "idempotencyKey");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "automation_dlq_events"
    ADD CONSTRAINT "automation_dlq_events_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "automation_dlq_events"
    ADD CONSTRAINT "automation_dlq_events_scheduledJobId_fkey"
    FOREIGN KEY ("scheduledJobId") REFERENCES "scheduled_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "automation_dlq_events"
    ADD CONSTRAINT "automation_dlq_events_jobRunId_fkey"
    FOREIGN KEY ("jobRunId") REFERENCES "job_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "automation_alert_events" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT,
  "projectId" TEXT,
  "scheduledJobId" TEXT,
  "jobRunId" TEXT,
  "type" "AutomationAlertType" NOT NULL,
  "severity" "AutomationAlertSeverity" NOT NULL DEFAULT 'WARNING',
  "status" "AutomationAlertStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "dedupeKey" TEXT,
  "thresholdValue" DOUBLE PRECISION,
  "observedValue" DOUBLE PRECISION,
  "metadata" JSONB,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_alert_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "automation_alert_events_ownerId_status_createdAt_idx"
  ON "automation_alert_events"("ownerId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "automation_alert_events_type_createdAt_idx"
  ON "automation_alert_events"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "automation_alert_events_dedupeKey_createdAt_idx"
  ON "automation_alert_events"("dedupeKey", "createdAt");

DO $$ BEGIN
  ALTER TABLE "automation_alert_events"
    ADD CONSTRAINT "automation_alert_events_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "automation_alert_events"
    ADD CONSTRAINT "automation_alert_events_scheduledJobId_fkey"
    FOREIGN KEY ("scheduledJobId") REFERENCES "scheduled_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "automation_alert_events"
    ADD CONSTRAINT "automation_alert_events_jobRunId_fkey"
    FOREIGN KEY ("jobRunId") REFERENCES "job_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
