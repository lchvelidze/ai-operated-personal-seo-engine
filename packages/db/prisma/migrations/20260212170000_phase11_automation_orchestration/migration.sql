-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'ANALYTICS_SNAPSHOT';
ALTER TYPE "JobType" ADD VALUE 'ANALYTICS_EXPORT';

-- CreateEnum
CREATE TYPE "ScheduledJobCadence" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ScheduledJobStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "cadence" "ScheduledJobCadence" NOT NULL,
    "dayOfWeek" INTEGER,
    "runAtHour" INTEGER NOT NULL DEFAULT 0,
    "runAtMinute" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "ScheduledJobStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" "JobStatus",
    "lastRunId" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scheduled_jobs_dayOfWeek_check" CHECK (("dayOfWeek" IS NULL) OR ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6)),
    CONSTRAINT "scheduled_jobs_runAtHour_check" CHECK ("runAtHour" >= 0 AND "runAtHour" <= 23),
    CONSTRAINT "scheduled_jobs_runAtMinute_check" CHECK ("runAtMinute" >= 0 AND "runAtMinute" <= 59),
    CONSTRAINT "scheduled_jobs_cadence_dayofweek_check" CHECK (("cadence" = 'DAILY' AND "dayOfWeek" IS NULL) OR ("cadence" = 'WEEKLY' AND "dayOfWeek" IS NOT NULL))
);

-- AlterTable
ALTER TABLE "job_runs"
ADD COLUMN "scheduledJobId" TEXT,
ADD COLUMN "outputSummary" TEXT;

-- CreateIndex
CREATE INDEX "scheduled_jobs_projectId_status_nextRunAt_idx" ON "scheduled_jobs"("projectId", "status", "nextRunAt");

-- CreateIndex
CREATE INDEX "job_runs_scheduledJobId_createdAt_idx" ON "job_runs"("scheduledJobId", "createdAt");

-- AddForeignKey
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_scheduledJobId_fkey" FOREIGN KEY ("scheduledJobId") REFERENCES "scheduled_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
