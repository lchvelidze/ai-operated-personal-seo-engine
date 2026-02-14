-- Phase 11.2 reliability hardening

-- Extend existing scheduled job status enum with dead-letter terminal state.
ALTER TYPE "ScheduledJobStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

-- New policy enums for catch-up and DST behavior.
CREATE TYPE "ScheduledJobCatchUpMode" AS ENUM ('SKIP_MISSED', 'REPLAY_MISSED');
CREATE TYPE "ScheduledJobDstAmbiguousPolicy" AS ENUM ('EARLIER_OFFSET', 'LATER_OFFSET');
CREATE TYPE "ScheduledJobDstInvalidPolicy" AS ENUM ('SHIFT_FORWARD', 'SKIP');

-- Scheduled job reliability + policy fields.
ALTER TABLE "scheduled_jobs"
  ADD COLUMN "catchUpMode" "ScheduledJobCatchUpMode" NOT NULL DEFAULT 'SKIP_MISSED',
  ADD COLUMN "dstAmbiguousTimePolicy" "ScheduledJobDstAmbiguousPolicy" NOT NULL DEFAULT 'EARLIER_OFFSET',
  ADD COLUMN "dstInvalidTimePolicy" "ScheduledJobDstInvalidPolicy" NOT NULL DEFAULT 'SHIFT_FORWARD',
  ADD COLUMN "retryMaxAttempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "retryBackoffSeconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "retryMaxBackoffSeconds" INTEGER NOT NULL DEFAULT 900,
  ADD COLUMN "retryScheduledFor" TIMESTAMP(3),
  ADD COLUMN "retryAttempt" INTEGER,
  ADD COLUMN "retryFromRunId" TEXT,
  ADD COLUMN "successCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deadLetteredAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT;

-- Run-level retry attempt metadata.
ALTER TABLE "job_runs"
  ADD COLUMN "scheduledFor" TIMESTAMP(3),
  ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "retryOfRunId" TEXT,
  ADD COLUMN "retryBackoffSeconds" INTEGER,
  ADD COLUMN "nextRetryAt" TIMESTAMP(3);

CREATE INDEX "job_runs_scheduledJobId_scheduledFor_attemptNumber_idx"
  ON "job_runs"("scheduledJobId", "scheduledFor", "attemptNumber");
