-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SectionKind" AS ENUM ('HERO', 'INTRO', 'BODY', 'FAQ', 'CTA', 'CUSTOM');

-- CreateEnum
CREATE TYPE "KeywordIntent" AS ENUM ('INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('DESKTOP', 'MOBILE');

-- CreateEnum
CREATE TYPE "SearchEngine" AS ENUM ('GOOGLE', 'BING');

-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('DRAFT', 'READY', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('WRITE', 'OPTIMIZE', 'REFRESH', 'INTERNAL_LINKS', 'OUTREACH');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('SUGGESTED', 'APPLIED', 'IGNORED');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('NEW', 'CONTACTED', 'RESPONDED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "IndexingStatus" AS ENUM ('QUEUED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "IndexingProvider" AS ENUM ('GSC', 'BING');

-- CreateEnum
CREATE TYPE "AnalyticsSource" AS ENUM ('GSC', 'GA4');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'ACCEPTED_RISK', 'FIXED');

-- CreateEnum
CREATE TYPE "AuditRule" AS ENUM ('TITLE_MISSING', 'META_DESCRIPTION_MISSING', 'H1_MISSING', 'THIN_CONTENT', 'BROKEN_LINK', 'SLOW_PAGE', 'INDEXING_BLOCKED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('RANK_TRACK', 'BRIEF_GENERATE', 'CONTENT_OPTIMIZE', 'AUDIT_RUN', 'GSC_SYNC', 'PAGE_PUBLISH', 'INDEXING_REQUEST');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'WEBHOOK');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "metaDescription" TEXT,
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "contentHash" TEXT,
    "lastPublishedAt" TIMESTAMP(3),
    "lastCrawledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_sections" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "kind" "SectionKind" NOT NULL DEFAULT 'BODY',
    "heading" TEXT,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "wordCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT,
    "term" TEXT NOT NULL,
    "intent" "KeywordIntent",
    "difficulty" INTEGER,
    "cpc" DECIMAL(10,2),
    "searchVolume" INTEGER,
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "device" "DeviceType" NOT NULL DEFAULT 'DESKTOP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engine" "SearchEngine" NOT NULL DEFAULT 'GOOGLE',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "device" "DeviceType" NOT NULL DEFAULT 'DESKTOP',
    "rank" INTEGER,
    "url" TEXT,
    "serpFeatures" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_briefs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT,
    "keywordId" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "audience" TEXT,
    "outline" JSONB,
    "status" "BriefStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_tasks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "briefId" TEXT,
    "pageId" TEXT,
    "jobRunId" TEXT,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_links" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourcePageId" TEXT NOT NULL,
    "targetPageId" TEXT NOT NULL,
    "anchorText" TEXT NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'SUGGESTED',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlink_opportunities" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "contactEmail" TEXT,
    "authorityScore" INTEGER,
    "status" "OutreachStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlink_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexing_requests" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT,
    "url" TEXT NOT NULL,
    "provider" "IndexingProvider" NOT NULL DEFAULT 'GSC',
    "status" "IndexingStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "response" JSONB,
    "error" TEXT,

    CONSTRAINT "indexing_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_daily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "source" "AnalyticsSource" NOT NULL DEFAULT 'GSC',
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION,
    "avgPosition" DOUBLE PRECISION,
    "sessions" INTEGER,
    "users" INTEGER,
    "conversions" INTEGER,
    "revenue" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_issues" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT,
    "rule" "AuditRule" NOT NULL,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recommendation" TEXT,
    "metadata" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "JobTrigger" NOT NULL DEFAULT 'MANUAL',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_ownerId_idx" ON "projects"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_ownerId_slug_key" ON "projects"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "pages_projectId_status_idx" ON "pages"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pages_projectId_path_key" ON "pages"("projectId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "page_sections_pageId_order_key" ON "page_sections"("pageId", "order");

-- CreateIndex
CREATE INDEX "keywords_projectId_isActive_idx" ON "keywords"("projectId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_projectId_term_locale_device_key" ON "keywords"("projectId", "term", "locale", "device");

-- CreateIndex
CREATE INDEX "rank_snapshots_projectId_recordedAt_idx" ON "rank_snapshots"("projectId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rank_snapshots_keywordId_recordedAt_engine_locale_device_key" ON "rank_snapshots"("keywordId", "recordedAt", "engine", "locale", "device");

-- CreateIndex
CREATE INDEX "content_briefs_projectId_status_idx" ON "content_briefs"("projectId", "status");

-- CreateIndex
CREATE INDEX "content_tasks_projectId_status_priority_idx" ON "content_tasks"("projectId", "status", "priority");

-- CreateIndex
CREATE INDEX "internal_links_projectId_status_idx" ON "internal_links"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "internal_links_sourcePageId_targetPageId_anchorText_key" ON "internal_links"("sourcePageId", "targetPageId", "anchorText");

-- CreateIndex
CREATE INDEX "backlink_opportunities_projectId_status_idx" ON "backlink_opportunities"("projectId", "status");

-- CreateIndex
CREATE INDEX "indexing_requests_projectId_status_requestedAt_idx" ON "indexing_requests"("projectId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "analytics_daily_projectId_date_idx" ON "analytics_daily"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_projectId_pageId_date_source_key" ON "analytics_daily"("projectId", "pageId", "date", "source");

-- CreateIndex
CREATE INDEX "audit_issues_projectId_status_severity_idx" ON "audit_issues"("projectId", "status", "severity");

-- CreateIndex
CREATE INDEX "job_runs_projectId_type_status_createdAt_idx" ON "job_runs"("projectId", "type", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_sections" ADD CONSTRAINT "page_sections_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_tasks" ADD CONSTRAINT "content_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_tasks" ADD CONSTRAINT "content_tasks_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "content_briefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_tasks" ADD CONSTRAINT "content_tasks_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_tasks" ADD CONSTRAINT "content_tasks_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "job_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_links" ADD CONSTRAINT "internal_links_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_links" ADD CONSTRAINT "internal_links_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_links" ADD CONSTRAINT "internal_links_targetPageId_fkey" FOREIGN KEY ("targetPageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlink_opportunities" ADD CONSTRAINT "backlink_opportunities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indexing_requests" ADD CONSTRAINT "indexing_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indexing_requests" ADD CONSTRAINT "indexing_requests_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
