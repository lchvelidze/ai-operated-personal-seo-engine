-- CreateTable
CREATE TABLE "content_task_transition_events" (
    "id" TEXT NOT NULL,
    "contentTaskId" TEXT NOT NULL,
    "fromStatus" "TaskStatus" NOT NULL,
    "toStatus" "TaskStatus" NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "actorSource" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_task_transition_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_task_transition_events_contentTaskId_createdAt_idx" ON "content_task_transition_events"("contentTaskId", "createdAt");

-- CreateIndex
CREATE INDEX "content_task_transition_events_actorUserId_idx" ON "content_task_transition_events"("actorUserId");

-- AddForeignKey
ALTER TABLE "content_task_transition_events" ADD CONSTRAINT "content_task_transition_events_contentTaskId_fkey" FOREIGN KEY ("contentTaskId") REFERENCES "content_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_task_transition_events" ADD CONSTRAINT "content_task_transition_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
