-- AlterTable
ALTER TABLE "job_runs"
ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_idempotencyKey_key" ON "job_runs"("idempotencyKey");

-- CreateTable
CREATE TABLE "scheduler_locks" (
    "name" TEXT NOT NULL,
    "ownerToken" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_locks_pkey" PRIMARY KEY ("name")
);
