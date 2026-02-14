import { LinkStatus, OutreachStatus, Prisma, TaskStatus } from "@prisma/client";
import { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuthUser } from "../lib/request-auth.js";

type AnalyticsScopeQuery = {
  projectId?: string;
  from?: string;
  to?: string;
};

type ExportDataset = "kpis" | "contentTasks" | "backlinkOpportunities" | "internalLinks";
type ExportFormat = "json" | "csv";

type ExportAnalyticsQuery = {
  dataset?: ExportDataset;
  format?: ExportFormat;
  projectId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  contentTaskStatus?: TaskStatus;
  outreachStatus?: OutreachStatus;
  linkStatus?: LinkStatus;
};

type AnalyticsScope = {
  projectId: string | null;
  from: Date | null;
  to: Date | null;
  fromIso: string | null;
  toIso: string | null;
};

type ExportRecord = Record<string, string | number | boolean | null>;

type ExportMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const TASK_STATUS_ORDER: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
  TaskStatus.DONE,
  TaskStatus.FAILED
];

const OUTREACH_STATUS_ORDER: OutreachStatus[] = [
  OutreachStatus.NEW,
  OutreachStatus.CONTACTED,
  OutreachStatus.RESPONDED,
  OutreachStatus.WON,
  OutreachStatus.LOST
];

const LINK_STATUS_ORDER: LinkStatus[] = [LinkStatus.SUGGESTED, LinkStatus.APPLIED, LinkStatus.IGNORED];

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.status(statusCode).send({
    error: {
      code,
      message
    }
  });
}

function parseDateInput(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function round(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function buildDateRangeFilter(from: Date | null, to: Date | null): Prisma.DateTimeFilter | undefined {
  if (!from && !to) {
    return undefined;
  }

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {})
  };
}

function csvEscape(value: string | number | boolean | null) {
  if (value === null) return "";

  const normalized = String(value);
  if (!/[",\n\r]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: ExportRecord[]) {
  const lines: string[] = [];
  lines.push(headers.join(","));

  for (const row of rows) {
    const values = headers.map((header) => csvEscape(row[header] ?? null));
    lines.push(values.join(","));
  }

  return `${lines.join("\n")}\n`;
}

async function resolveAnalyticsScope(
  ownerId: string,
  query: { projectId?: string; from?: string; to?: string },
  reply: FastifyReply
): Promise<AnalyticsScope | null> {
  let projectId: string | null = null;

  if (query.projectId !== undefined) {
    const trimmedProjectId = query.projectId.trim();
    if (!trimmedProjectId) {
      sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      return null;
    }

    const project = await prisma.project.findFirst({
      where: {
        id: trimmedProjectId,
        ownerId
      },
      select: {
        id: true
      }
    });

    if (!project) {
      sendError(reply, 404, "NOT_FOUND", "Project not found");
      return null;
    }

    projectId = project.id;
  }

  let from: Date | null = null;
  if (query.from !== undefined) {
    const trimmedFrom = query.from.trim();
    if (!trimmedFrom) {
      sendError(reply, 400, "VALIDATION_ERROR", "from cannot be empty");
      return null;
    }

    from = parseDateInput(trimmedFrom);
    if (!from) {
      sendError(reply, 400, "VALIDATION_ERROR", "from must be a valid ISO date-time");
      return null;
    }
  }

  let to: Date | null = null;
  if (query.to !== undefined) {
    const trimmedTo = query.to.trim();
    if (!trimmedTo) {
      sendError(reply, 400, "VALIDATION_ERROR", "to cannot be empty");
      return null;
    }

    to = parseDateInput(trimmedTo);
    if (!to) {
      sendError(reply, 400, "VALIDATION_ERROR", "to must be a valid ISO date-time");
      return null;
    }
  }

  if (from && to && from.getTime() > to.getTime()) {
    sendError(reply, 400, "VALIDATION_ERROR", "from must be <= to");
    return null;
  }

  return {
    projectId,
    from,
    to,
    fromIso: toIso(from),
    toIso: toIso(to)
  };
}

async function buildKpiSummary(ownerId: string, scope: AnalyticsScope) {
  const projectWhere: Prisma.ProjectWhereInput = {
    ownerId,
    ...(scope.projectId ? { id: scope.projectId } : {})
  };

  const taskCreatedRange = buildDateRangeFilter(scope.from, scope.to);
  const backlinkCreatedRange = buildDateRangeFilter(scope.from, scope.to);
  const rankRecordedRange = buildDateRangeFilter(scope.from, scope.to);
  const taskCompletedRange = buildDateRangeFilter(scope.from, scope.to);
  const backlinkWinRange = buildDateRangeFilter(scope.from, scope.to);

  const projectCountPromise = prisma.project.count({ where: projectWhere });
  const pageCountPromise = prisma.page.count({
    where: {
      project: projectWhere
    }
  });
  const keywordCountPromise = prisma.keyword.count({
    where: {
      project: projectWhere
    }
  });
  const activeKeywordCountPromise = prisma.keyword.count({
    where: {
      project: projectWhere,
      isActive: true
    }
  });
  const contentTaskCountPromise = prisma.contentTask.count({
    where: {
      project: projectWhere
    }
  });
  const internalLinkCountPromise = prisma.internalLink.count({
    where: {
      project: projectWhere
    }
  });
  const backlinkCountPromise = prisma.backlinkOpportunity.count({
    where: {
      project: projectWhere
    }
  });

  const rankSnapshotWhere: Prisma.RankSnapshotWhereInput = {
    project: projectWhere,
    ...(rankRecordedRange ? { recordedAt: rankRecordedRange } : {})
  };

  const rankSnapshotCountPromise = prisma.rankSnapshot.count({
    where: rankSnapshotWhere
  });

  const rankAggregatePromise = prisma.rankSnapshot.aggregate({
    where: {
      ...rankSnapshotWhere,
      rank: {
        not: null
      }
    },
    _avg: {
      rank: true
    },
    _count: {
      rank: true
    }
  });

  const top10CountPromise = prisma.rankSnapshot.count({
    where: {
      ...rankSnapshotWhere,
      rank: {
        lte: 10,
        not: null
      }
    }
  });

  const contentTasksCreatedPromise = prisma.contentTask.count({
    where: {
      project: projectWhere,
      ...(taskCreatedRange ? { createdAt: taskCreatedRange } : {})
    }
  });

  const contentTasksCompletedPromise = prisma.contentTask.count({
    where: {
      project: projectWhere,
      status: TaskStatus.DONE,
      ...(taskCompletedRange ? { completedAt: taskCompletedRange } : {})
    }
  });

  const backlinksCreatedPromise = prisma.backlinkOpportunity.count({
    where: {
      project: projectWhere,
      ...(backlinkCreatedRange ? { createdAt: backlinkCreatedRange } : {})
    }
  });

  const backlinksWonPromise = prisma.backlinkOpportunity.count({
    where: {
      project: projectWhere,
      status: OutreachStatus.WON,
      ...(backlinkWinRange ? { updatedAt: backlinkWinRange } : {})
    }
  });

  const [
    projects,
    pages,
    keywords,
    activeKeywords,
    contentTasks,
    internalLinks,
    backlinkOpportunities,
    rankSnapshots,
    rankAggregate,
    top10Count,
    contentTasksCreated,
    contentTasksCompleted,
    backlinksCreated,
    backlinksWon
  ] = await Promise.all([
    projectCountPromise,
    pageCountPromise,
    keywordCountPromise,
    activeKeywordCountPromise,
    contentTaskCountPromise,
    internalLinkCountPromise,
    backlinkCountPromise,
    rankSnapshotCountPromise,
    rankAggregatePromise,
    top10CountPromise,
    contentTasksCreatedPromise,
    contentTasksCompletedPromise,
    backlinksCreatedPromise,
    backlinksWonPromise
  ]);

  const rankedSnapshots = rankAggregate._count.rank;
  const averageRank = rankAggregate._avg.rank === null ? null : round(rankAggregate._avg.rank, 2);
  const top10Rate = rankedSnapshots > 0 ? round((top10Count / rankedSnapshots) * 100, 2) : null;
  const contentTaskCompletionRate =
    contentTasksCreated > 0 ? round((contentTasksCompleted / contentTasksCreated) * 100, 2) : null;
  const backlinkWinRate = backlinksCreated > 0 ? round((backlinksWon / backlinksCreated) * 100, 2) : null;

  return {
    scope: {
      projectId: scope.projectId,
      from: scope.fromIso,
      to: scope.toIso
    },
    inventory: {
      projects,
      pages,
      keywords,
      activeKeywords,
      contentTasks,
      internalLinks,
      backlinkOpportunities
    },
    activity: {
      rankSnapshots,
      averageRank,
      top10Rate,
      contentTasksCreated,
      contentTasksCompleted,
      contentTaskCompletionRate,
      backlinksCreated,
      backlinksWon,
      backlinkWinRate
    }
  };
}

function toFunnelStages<T extends string>(order: readonly T[], groupedCounts: Map<T, number>) {
  const total = order.reduce((sum, stage) => sum + (groupedCounts.get(stage) ?? 0), 0);

  return {
    total,
    stages: order.map((stage) => {
      const count = groupedCounts.get(stage) ?? 0;

      return {
        stage,
        count,
        percentage: total > 0 ? round((count / total) * 100, 2) : 0
      };
    })
  };
}

async function buildFunnelMetrics(ownerId: string, scope: AnalyticsScope) {
  const projectWhere: Prisma.ProjectWhereInput = {
    ownerId,
    ...(scope.projectId ? { id: scope.projectId } : {})
  };

  const createdRange = buildDateRangeFilter(scope.from, scope.to);

  const [contentTaskGrouped, backlinkGrouped, internalLinkGrouped] = await Promise.all([
    prisma.contentTask.groupBy({
      by: ["status"],
      where: {
        project: projectWhere,
        ...(createdRange ? { createdAt: createdRange } : {})
      },
      _count: {
        _all: true
      }
    }),
    prisma.backlinkOpportunity.groupBy({
      by: ["status"],
      where: {
        project: projectWhere,
        ...(createdRange ? { createdAt: createdRange } : {})
      },
      _count: {
        _all: true
      }
    }),
    prisma.internalLink.groupBy({
      by: ["status"],
      where: {
        project: projectWhere,
        ...(createdRange ? { createdAt: createdRange } : {})
      },
      _count: {
        _all: true
      }
    })
  ]);

  const contentTaskMap = new Map<TaskStatus, number>(
    contentTaskGrouped.map((entry) => [entry.status, entry._count._all])
  );
  const backlinkMap = new Map<OutreachStatus, number>(
    backlinkGrouped.map((entry) => [entry.status, entry._count._all])
  );
  const internalLinkMap = new Map<LinkStatus, number>(
    internalLinkGrouped.map((entry) => [entry.status, entry._count._all])
  );

  return {
    scope: {
      projectId: scope.projectId,
      from: scope.fromIso,
      to: scope.toIso
    },
    contentTasks: toFunnelStages(TASK_STATUS_ORDER, contentTaskMap),
    backlinkOutreach: toFunnelStages(OUTREACH_STATUS_ORDER, backlinkMap),
    internalLinkStatus: toFunnelStages(LINK_STATUS_ORDER, internalLinkMap)
  };
}

function validateExportFilters(dataset: ExportDataset, query: ExportAnalyticsQuery, reply: FastifyReply) {
  if (query.contentTaskStatus && dataset !== "contentTasks") {
    sendError(reply, 400, "VALIDATION_ERROR", "contentTaskStatus filter is only valid for dataset=contentTasks");
    return false;
  }

  if (query.outreachStatus && dataset !== "backlinkOpportunities") {
    sendError(reply, 400, "VALIDATION_ERROR", "outreachStatus filter is only valid for dataset=backlinkOpportunities");
    return false;
  }

  if (query.linkStatus && dataset !== "internalLinks") {
    sendError(reply, 400, "VALIDATION_ERROR", "linkStatus filter is only valid for dataset=internalLinks");
    return false;
  }

  return true;
}

function normalizeExportFilename(dataset: ExportDataset) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `phase10-${dataset}-${timestamp}.csv`;
}

export function registerPhase10Routes(app: FastifyInstance) {
  app.get<{ Querystring: AnalyticsScopeQuery }>(
    "/v1/analytics/kpis",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            from: { type: "string", minLength: 1, maxLength: 64 },
            to: { type: "string", minLength: 1, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const scope = await resolveAnalyticsScope(owner.id, request.query, reply);
      if (!scope) return;

      try {
        const data = await buildKpiSummary(owner.id, scope);
        return reply.send({ data });
      } catch (error) {
        app.log.error({ err: error }, "analytics KPI summary failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load KPI summary");
      }
    }
  );

  app.get<{ Querystring: AnalyticsScopeQuery }>(
    "/v1/analytics/funnels",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            from: { type: "string", minLength: 1, maxLength: 64 },
            to: { type: "string", minLength: 1, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const scope = await resolveAnalyticsScope(owner.id, request.query, reply);
      if (!scope) return;

      try {
        const data = await buildFunnelMetrics(owner.id, scope);
        return reply.send({ data });
      } catch (error) {
        app.log.error({ err: error }, "analytics funnel metrics failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load funnel metrics");
      }
    }
  );

  app.get<{ Querystring: ExportAnalyticsQuery }>(
    "/v1/analytics/export",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            dataset: {
              type: "string",
              enum: ["kpis", "contentTasks", "backlinkOpportunities", "internalLinks"],
              default: "kpis"
            },
            format: {
              type: "string",
              enum: ["json", "csv"],
              default: "json"
            },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            from: { type: "string", minLength: 1, maxLength: 64 },
            to: { type: "string", minLength: 1, maxLength: 64 },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
            contentTaskStatus: { type: "string", enum: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "FAILED"] },
            outreachStatus: { type: "string", enum: ["NEW", "CONTACTED", "RESPONDED", "WON", "LOST"] },
            linkStatus: { type: "string", enum: ["SUGGESTED", "APPLIED", "IGNORED"] }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const dataset = request.query.dataset ?? "kpis";
      const format = request.query.format ?? "json";
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 100;

      if (!validateExportFilters(dataset, request.query, reply)) {
        return;
      }

      const scope = await resolveAnalyticsScope(owner.id, request.query, reply);
      if (!scope) return;

      try {
        let records: ExportRecord[] = [];
        let headers: string[] = [];
        let meta: ExportMeta | undefined;

        if (dataset === "kpis") {
          const kpis = await buildKpiSummary(owner.id, scope);

          const row: ExportRecord = {
            projectId: kpis.scope.projectId,
            from: kpis.scope.from,
            to: kpis.scope.to,
            projects: kpis.inventory.projects,
            pages: kpis.inventory.pages,
            keywords: kpis.inventory.keywords,
            activeKeywords: kpis.inventory.activeKeywords,
            contentTasks: kpis.inventory.contentTasks,
            internalLinks: kpis.inventory.internalLinks,
            backlinkOpportunities: kpis.inventory.backlinkOpportunities,
            rankSnapshots: kpis.activity.rankSnapshots,
            averageRank: kpis.activity.averageRank,
            top10Rate: kpis.activity.top10Rate,
            contentTasksCreated: kpis.activity.contentTasksCreated,
            contentTasksCompleted: kpis.activity.contentTasksCompleted,
            contentTaskCompletionRate: kpis.activity.contentTaskCompletionRate,
            backlinksCreated: kpis.activity.backlinksCreated,
            backlinksWon: kpis.activity.backlinksWon,
            backlinkWinRate: kpis.activity.backlinkWinRate
          };

          headers = Object.keys(row);
          records = [row];
        }

        if (dataset === "contentTasks") {
          const createdAtRange = buildDateRangeFilter(scope.from, scope.to);
          const where: Prisma.ContentTaskWhereInput = {
            project: {
              ownerId: owner.id,
              ...(scope.projectId ? { id: scope.projectId } : {})
            },
            ...(createdAtRange ? { createdAt: createdAtRange } : {}),
            ...(request.query.contentTaskStatus ? { status: request.query.contentTaskStatus } : {})
          };

          const [total, rows] = await prisma.$transaction([
            prisma.contentTask.count({ where }),
            prisma.contentTask.findMany({
              where,
              orderBy: [{ createdAt: "desc" }],
              skip: (page - 1) * limit,
              take: limit,
              include: {
                project: {
                  select: {
                    id: true,
                    slug: true
                  }
                },
                brief: {
                  select: {
                    id: true,
                    title: true
                  }
                },
                page: {
                  select: {
                    id: true,
                    path: true
                  }
                }
              }
            })
          ]);

          records = rows.map((task) => ({
            id: task.id,
            projectId: task.projectId,
            projectSlug: task.project.slug,
            briefId: task.briefId,
            briefTitle: task.brief?.title ?? null,
            pageId: task.pageId,
            pagePath: task.page?.path ?? null,
            type: task.type,
            status: task.status,
            priority: task.priority,
            dueAt: toIso(task.dueAt),
            startedAt: toIso(task.startedAt),
            completedAt: toIso(task.completedAt),
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            error: task.error
          }));

          headers = [
            "id",
            "projectId",
            "projectSlug",
            "briefId",
            "briefTitle",
            "pageId",
            "pagePath",
            "type",
            "status",
            "priority",
            "dueAt",
            "startedAt",
            "completedAt",
            "createdAt",
            "updatedAt",
            "error"
          ];

          meta = {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
          };
        }

        if (dataset === "backlinkOpportunities") {
          const createdAtRange = buildDateRangeFilter(scope.from, scope.to);
          const where: Prisma.BacklinkOpportunityWhereInput = {
            project: {
              ownerId: owner.id,
              ...(scope.projectId ? { id: scope.projectId } : {})
            },
            ...(createdAtRange ? { createdAt: createdAtRange } : {}),
            ...(request.query.outreachStatus ? { status: request.query.outreachStatus } : {})
          };

          const [total, rows] = await prisma.$transaction([
            prisma.backlinkOpportunity.count({ where }),
            prisma.backlinkOpportunity.findMany({
              where,
              orderBy: [{ createdAt: "desc" }],
              skip: (page - 1) * limit,
              take: limit,
              include: {
                project: {
                  select: {
                    id: true,
                    slug: true
                  }
                }
              }
            })
          ]);

          records = rows.map((opportunity) => ({
            id: opportunity.id,
            projectId: opportunity.projectId,
            projectSlug: opportunity.project.slug,
            sourceDomain: opportunity.sourceDomain,
            targetUrl: opportunity.targetUrl,
            contactEmail: opportunity.contactEmail,
            authorityScore: opportunity.authorityScore,
            status: opportunity.status,
            notes: opportunity.notes,
            nextActionAt: toIso(opportunity.nextActionAt),
            lastContactedAt: toIso(opportunity.lastContactedAt),
            createdAt: opportunity.createdAt.toISOString(),
            updatedAt: opportunity.updatedAt.toISOString()
          }));

          headers = [
            "id",
            "projectId",
            "projectSlug",
            "sourceDomain",
            "targetUrl",
            "contactEmail",
            "authorityScore",
            "status",
            "notes",
            "nextActionAt",
            "lastContactedAt",
            "createdAt",
            "updatedAt"
          ];

          meta = {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
          };
        }

        if (dataset === "internalLinks") {
          const createdAtRange = buildDateRangeFilter(scope.from, scope.to);
          const where: Prisma.InternalLinkWhereInput = {
            project: {
              ownerId: owner.id,
              ...(scope.projectId ? { id: scope.projectId } : {})
            },
            ...(createdAtRange ? { createdAt: createdAtRange } : {}),
            ...(request.query.linkStatus ? { status: request.query.linkStatus } : {})
          };

          const [total, rows] = await prisma.$transaction([
            prisma.internalLink.count({ where }),
            prisma.internalLink.findMany({
              where,
              orderBy: [{ createdAt: "desc" }],
              skip: (page - 1) * limit,
              take: limit,
              include: {
                project: {
                  select: {
                    id: true,
                    slug: true
                  }
                },
                sourcePage: {
                  select: {
                    id: true,
                    path: true
                  }
                },
                targetPage: {
                  select: {
                    id: true,
                    path: true
                  }
                }
              }
            })
          ]);

          records = rows.map((link) => ({
            id: link.id,
            projectId: link.projectId,
            projectSlug: link.project.slug,
            sourcePageId: link.sourcePageId,
            sourcePagePath: link.sourcePage.path,
            targetPageId: link.targetPageId,
            targetPagePath: link.targetPage.path,
            anchorText: link.anchorText,
            status: link.status,
            reason: link.reason,
            createdAt: link.createdAt.toISOString(),
            updatedAt: link.updatedAt.toISOString()
          }));

          headers = [
            "id",
            "projectId",
            "projectSlug",
            "sourcePageId",
            "sourcePagePath",
            "targetPageId",
            "targetPagePath",
            "anchorText",
            "status",
            "reason",
            "createdAt",
            "updatedAt"
          ];

          meta = {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
          };
        }

        if (format === "csv") {
          const csv = toCsv(headers, records);
          reply.header("content-type", "text/csv; charset=utf-8");
          reply.header("content-disposition", `attachment; filename="${normalizeExportFilename(dataset)}"`);
          return reply.send(csv);
        }

        return reply.send({
          data: {
            dataset,
            scope: {
              projectId: scope.projectId,
              from: scope.fromIso,
              to: scope.toIso
            },
            records,
            ...(meta ? { meta } : {})
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "analytics export failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to export analytics dataset");
      }
    }
  );
}
