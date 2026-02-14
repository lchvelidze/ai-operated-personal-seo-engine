import { BriefStatus, Prisma, SectionKind, TaskStatus, TaskType } from "@prisma/client";
import { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuthUser } from "../lib/request-auth.js";

type PageSectionParams = {
  id: string;
};

type CreatePageSectionBody = {
  pageId: string;
  kind?: SectionKind;
  heading?: string;
  content: string;
  order: number;
  wordCount?: number | null;
};

type UpdatePageSectionBody = {
  kind?: SectionKind;
  heading?: string | null;
  content?: string;
  order?: number;
  wordCount?: number | null;
};

type ListPageSectionsQuery = {
  page?: number;
  limit?: number;
  pageId?: string;
  projectId?: string;
  kind?: SectionKind;
  q?: string;
  sort?: "order_asc" | "order_desc" | "createdAt_desc" | "createdAt_asc" | "updatedAt_desc" | "updatedAt_asc";
};

type ContentBriefParams = {
  id: string;
};

type CreateContentBriefBody = {
  projectId: string;
  pageId?: string;
  keywordId?: string;
  title: string;
  objective?: string;
  audience?: string;
  outline?: Record<string, unknown> | null;
  status?: BriefStatus;
  generatedBy?: string;
};

type UpdateContentBriefBody = {
  pageId?: string | null;
  keywordId?: string | null;
  title?: string;
  objective?: string | null;
  audience?: string | null;
  outline?: Record<string, unknown> | null;
  status?: BriefStatus;
  generatedBy?: string | null;
};

type ListContentBriefsQuery = {
  page?: number;
  limit?: number;
  projectId?: string;
  pageId?: string;
  keywordId?: string;
  status?: BriefStatus;
  q?: string;
  sort?: "createdAt_desc" | "createdAt_asc" | "updatedAt_desc" | "updatedAt_asc" | "title_asc" | "title_desc";
};

type ContentTaskParams = {
  id: string;
};

type CreateContentTaskBody = {
  projectId: string;
  briefId?: string;
  pageId?: string;
  type: TaskType;
  status?: TaskStatus;
  priority?: number;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: string;
  dueAt?: string;
};

type UpdateContentTaskBody = {
  briefId?: string | null;
  pageId?: string | null;
  type?: TaskType;
  priority?: number;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  dueAt?: string | null;
};

type TransitionContentTaskBody = {
  status: TaskStatus;
  error?: string | null;
  result?: Record<string, unknown> | null;
  note?: string | null;
};

type ListContentTasksQuery = {
  page?: number;
  limit?: number;
  projectId?: string;
  briefId?: string;
  pageId?: string;
  status?: TaskStatus;
  type?: TaskType;
  q?: string;
  sort?: "createdAt_desc" | "createdAt_asc" | "updatedAt_desc" | "updatedAt_asc" | "priority_asc" | "priority_desc" | "dueAt_asc" | "dueAt_desc";
};

type ListContentTaskHistoryQuery = {
  page?: number;
  limit?: number;
};

const pageSectionPageSelect = {
  id: true,
  projectId: true,
  path: true,
  url: true,
  project: {
    select: {
      id: true,
      name: true,
      slug: true
    }
  }
} as const;

type PageSectionWithRelations = Prisma.PageSectionGetPayload<{
  include: {
    page: {
      select: typeof pageSectionPageSelect;
    };
  };
}>;

const contentBriefProjectSelect = {
  id: true,
  name: true,
  slug: true,
  domain: true
} as const;

const contentBriefPageSelect = {
  id: true,
  path: true,
  url: true
} as const;

const contentBriefKeywordSelect = {
  id: true,
  term: true,
  locale: true,
  device: true
} as const;

type ContentBriefWithRelations = Prisma.ContentBriefGetPayload<{
  include: {
    project: {
      select: typeof contentBriefProjectSelect;
    };
    page: {
      select: typeof contentBriefPageSelect;
    };
    keyword: {
      select: typeof contentBriefKeywordSelect;
    };
    _count: {
      select: {
        tasks: true;
      };
    };
  };
}>;

const contentTaskProjectSelect = {
  id: true,
  name: true,
  slug: true
} as const;

const contentTaskBriefSelect = {
  id: true,
  title: true,
  status: true
} as const;

const contentTaskPageSelect = {
  id: true,
  path: true,
  url: true
} as const;

type ContentTaskWithRelations = Prisma.ContentTaskGetPayload<{
  include: {
    project: {
      select: typeof contentTaskProjectSelect;
    };
    brief: {
      select: typeof contentTaskBriefSelect;
    };
    page: {
      select: typeof contentTaskPageSelect;
    };
  };
}>;

type ContentTaskTransitionEventRecord = Prisma.ContentTaskTransitionEventGetPayload<{}>;

const taskStatusTransitions: Record<TaskStatus, TaskStatus[]> = {
  TODO: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.DONE, TaskStatus.FAILED],
  IN_PROGRESS: [TaskStatus.BLOCKED, TaskStatus.DONE, TaskStatus.FAILED, TaskStatus.TODO],
  BLOCKED: [TaskStatus.IN_PROGRESS, TaskStatus.TODO, TaskStatus.FAILED],
  DONE: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
  FAILED: [TaskStatus.TODO, TaskStatus.IN_PROGRESS]
};

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

function countWords(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function toNullableJsonInput(value: Record<string, unknown> | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function toPageSectionResponse(section: PageSectionWithRelations) {
  return {
    id: section.id,
    pageId: section.pageId,
    page: {
      id: section.page.id,
      projectId: section.page.projectId,
      path: section.page.path,
      url: section.page.url,
      project: {
        id: section.page.project.id,
        name: section.page.project.name,
        slug: section.page.project.slug
      }
    },
    kind: section.kind,
    heading: section.heading,
    content: section.content,
    order: section.order,
    wordCount: section.wordCount,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString()
  };
}

function toContentBriefResponse(brief: ContentBriefWithRelations) {
  return {
    id: brief.id,
    projectId: brief.projectId,
    pageId: brief.pageId,
    keywordId: brief.keywordId,
    project: {
      id: brief.project.id,
      name: brief.project.name,
      slug: brief.project.slug,
      domain: brief.project.domain
    },
    page: brief.page
      ? {
          id: brief.page.id,
          path: brief.page.path,
          url: brief.page.url
        }
      : null,
    keyword: brief.keyword
      ? {
          id: brief.keyword.id,
          term: brief.keyword.term,
          locale: brief.keyword.locale,
          device: brief.keyword.device
        }
      : null,
    title: brief.title,
    objective: brief.objective,
    audience: brief.audience,
    outline: brief.outline,
    status: brief.status,
    generatedBy: brief.generatedBy,
    tasksCount: brief._count.tasks,
    createdAt: brief.createdAt.toISOString(),
    updatedAt: brief.updatedAt.toISOString()
  };
}

function toContentTaskResponse(task: ContentTaskWithRelations) {
  return {
    id: task.id,
    projectId: task.projectId,
    briefId: task.briefId,
    pageId: task.pageId,
    jobRunId: task.jobRunId,
    project: {
      id: task.project.id,
      name: task.project.name,
      slug: task.project.slug
    },
    brief: task.brief
      ? {
          id: task.brief.id,
          title: task.brief.title,
          status: task.brief.status
        }
      : null,
    page: task.page
      ? {
          id: task.page.id,
          path: task.page.path,
          url: task.page.url
        }
      : null,
    type: task.type,
    status: task.status,
    priority: task.priority,
    payload: task.payload,
    result: task.result,
    error: task.error,
    dueAt: task.dueAt?.toISOString() ?? null,
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };
}

function toContentTaskTransitionEventResponse(entry: ContentTaskTransitionEventRecord) {
  return {
    id: entry.id,
    contentTaskId: entry.contentTaskId,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    note: entry.note,
    actor: {
      userId: entry.actorUserId,
      email: entry.actorEmail,
      source: entry.actorSource
    },
    timestamp: entry.createdAt.toISOString()
  };
}

function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus) {
  if (from === to) return true;
  return taskStatusTransitions[from]?.includes(to) ?? false;
}

function buildTaskStatusUpdate(
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  currentStartedAt: Date | null,
  currentCompletedAt: Date | null
): Prisma.ContentTaskUpdateInput {
  const now = new Date();

  if (fromStatus === toStatus) {
    return {
      status: toStatus,
      startedAt: currentStartedAt,
      completedAt: currentCompletedAt
    };
  }

  if (toStatus === TaskStatus.IN_PROGRESS) {
    return {
      status: toStatus,
      startedAt: currentStartedAt ?? now,
      completedAt: null
    };
  }

  if (toStatus === TaskStatus.DONE) {
    return {
      status: toStatus,
      startedAt: currentStartedAt ?? now,
      completedAt: now
    };
  }

  if (toStatus === TaskStatus.TODO) {
    return {
      status: toStatus,
      startedAt: null,
      completedAt: null
    };
  }

  return {
    status: toStatus,
    startedAt: currentStartedAt,
    completedAt: null
  };
}

export function registerPhase8Routes(app: FastifyInstance) {
  app.post<{ Body: CreatePageSectionBody }>(
    "/v1/page-sections",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["pageId", "content", "order"],
          properties: {
            pageId: { type: "string", minLength: 1, maxLength: 64 },
            kind: { type: "string", enum: ["HERO", "INTRO", "BODY", "FAQ", "CTA", "CUSTOM"] },
            heading: { type: "string", minLength: 1, maxLength: 255 },
            content: { type: "string", minLength: 1, maxLength: 100000 },
            order: { type: "integer", minimum: 0, maximum: 10000 },
            wordCount: { type: ["integer", "null"], minimum: 0, maximum: 50000 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const pageId = request.body.pageId.trim();
      if (!pageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "pageId is required");
      }

      const content = request.body.content.trim();
      if (!content) {
        return sendError(reply, 400, "VALIDATION_ERROR", "content is required");
      }

      const heading = request.body.heading?.trim();
      if (request.body.heading !== undefined && !heading) {
        return sendError(reply, 400, "VALIDATION_ERROR", "heading cannot be empty");
      }

      const wordCount = request.body.wordCount === undefined ? countWords(content) : request.body.wordCount;

      try {
        const page = await prisma.page.findFirst({
          where: {
            id: pageId,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true
          }
        });

        if (!page) {
          return sendError(reply, 404, "NOT_FOUND", "Page not found");
        }

        const created = await prisma.pageSection.create({
          data: {
            pageId: page.id,
            kind: request.body.kind ?? SectionKind.BODY,
            heading,
            content,
            order: request.body.order,
            wordCount
          },
          include: {
            page: {
              select: pageSectionPageSelect
            }
          }
        });

        return reply.status(201).send({ data: toPageSectionResponse(created) });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return sendError(reply, 409, "PAGE_SECTION_CREATE_CONFLICT", "A section with this page/order already exists");
        }

        app.log.error({ err: error }, "page section create failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create page section");
      }
    }
  );

  app.get<{ Querystring: ListPageSectionsQuery }>(
    "/v1/page-sections",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            pageId: { type: "string", minLength: 1, maxLength: 64 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            kind: { type: "string", enum: ["HERO", "INTRO", "BODY", "FAQ", "CTA", "CUSTOM"] },
            q: { type: "string", minLength: 1, maxLength: 255 },
            sort: {
              type: "string",
              enum: ["order_asc", "order_desc", "createdAt_desc", "createdAt_asc", "updatedAt_desc", "updatedAt_asc"],
              default: "order_asc"
            }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const sort = request.query.sort ?? "order_asc";
      const pageId = request.query.pageId?.trim();
      const projectId = request.query.projectId?.trim();
      const q = request.query.q?.trim();

      if (request.query.pageId !== undefined && !pageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "pageId cannot be empty");
      }

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      const where: Prisma.PageSectionWhereInput = {
        page: {
          project: {
            ownerId: owner.id,
            ...(projectId ? { id: projectId } : {})
          },
          ...(pageId ? { id: pageId } : {})
        },
        ...(request.query.kind ? { kind: request.query.kind } : {}),
        ...(q
          ? {
              OR: [
                {
                  heading: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  content: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                }
              ]
            }
          : {})
      };

      const orderBy: Prisma.PageSectionOrderByWithRelationInput[] =
        sort === "order_desc"
          ? [{ order: "desc" }, { createdAt: "desc" }]
          : sort === "createdAt_desc"
            ? [{ createdAt: "desc" }]
            : sort === "createdAt_asc"
              ? [{ createdAt: "asc" }]
              : sort === "updatedAt_desc"
                ? [{ updatedAt: "desc" }]
                : sort === "updatedAt_asc"
                  ? [{ updatedAt: "asc" }]
                  : [{ order: "asc" }, { createdAt: "asc" }];

      try {
        const [total, sections] = await prisma.$transaction([
          prisma.pageSection.count({ where }),
          prisma.pageSection.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              page: {
                select: pageSectionPageSelect
              }
            }
          })
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return reply.send({
          data: sections.map(toPageSectionResponse),
          meta: {
            page,
            limit,
            total,
            totalPages
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "page sections list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load page sections");
      }
    }
  );

  app.get<{ Params: PageSectionParams }>(
    "/v1/page-sections/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const section = await prisma.pageSection.findFirst({
          where: {
            id: request.params.id,
            page: {
              project: {
                ownerId: owner.id
              }
            }
          },
          include: {
            page: {
              select: pageSectionPageSelect
            }
          }
        });

        if (!section) {
          return sendError(reply, 404, "NOT_FOUND", "Page section not found");
        }

        return reply.send({ data: toPageSectionResponse(section) });
      } catch (error) {
        app.log.error({ err: error }, "page section get failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load page section");
      }
    }
  );

  app.patch<{ Params: PageSectionParams; Body: UpdatePageSectionBody }>(
    "/v1/page-sections/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["HERO", "INTRO", "BODY", "FAQ", "CTA", "CUSTOM"] },
            heading: { type: ["string", "null"], minLength: 1, maxLength: 255 },
            content: { type: "string", minLength: 1, maxLength: 100000 },
            order: { type: "integer", minimum: 0, maximum: 10000 },
            wordCount: { type: ["integer", "null"], minimum: 0, maximum: 50000 }
          },
          anyOf: [
            { required: ["kind"] },
            { required: ["heading"] },
            { required: ["content"] },
            { required: ["order"] },
            { required: ["wordCount"] }
          ]
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const data: Prisma.PageSectionUpdateInput = {};

      if (request.body.kind !== undefined) {
        data.kind = request.body.kind;
      }

      if (request.body.heading !== undefined) {
        if (request.body.heading === null) {
          data.heading = null;
        } else {
          const heading = request.body.heading.trim();
          if (!heading) {
            return sendError(reply, 400, "VALIDATION_ERROR", "heading cannot be empty");
          }
          data.heading = heading;
        }
      }

      if (request.body.content !== undefined) {
        const content = request.body.content.trim();
        if (!content) {
          return sendError(reply, 400, "VALIDATION_ERROR", "content cannot be empty");
        }

        data.content = content;

        if (request.body.wordCount === undefined) {
          data.wordCount = countWords(content);
        }
      }

      if (request.body.order !== undefined) {
        data.order = request.body.order;
      }

      if (request.body.wordCount !== undefined) {
        data.wordCount = request.body.wordCount;
      }

      try {
        const existing = await prisma.pageSection.findFirst({
          where: {
            id: request.params.id,
            page: {
              project: {
                ownerId: owner.id
              }
            }
          },
          select: { id: true }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Page section not found");
        }

        const updated = await prisma.pageSection.update({
          where: { id: request.params.id },
          data,
          include: {
            page: {
              select: pageSectionPageSelect
            }
          }
        });

        return reply.send({ data: toPageSectionResponse(updated) });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return sendError(reply, 409, "PAGE_SECTION_UPDATE_CONFLICT", "A section with this page/order already exists");
        }

        app.log.error({ err: error }, "page section update failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to update page section");
      }
    }
  );

  app.delete<{ Params: PageSectionParams }>(
    "/v1/page-sections/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const existing = await prisma.pageSection.findFirst({
          where: {
            id: request.params.id,
            page: {
              project: {
                ownerId: owner.id
              }
            }
          },
          select: { id: true }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Page section not found");
        }

        await prisma.pageSection.delete({
          where: {
            id: request.params.id
          }
        });

        return reply.status(204).send();
      } catch (error) {
        app.log.error({ err: error }, "page section delete failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to delete page section");
      }
    }
  );

  app.post<{ Body: CreateContentBriefBody }>(
    "/v1/content-briefs",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "title"],
          properties: {
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            pageId: { type: "string", minLength: 1, maxLength: 64 },
            keywordId: { type: "string", minLength: 1, maxLength: 64 },
            title: { type: "string", minLength: 1, maxLength: 255 },
            objective: { type: "string", minLength: 1, maxLength: 2000 },
            audience: { type: "string", minLength: 1, maxLength: 1000 },
            outline: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: true
                },
                { type: "null" }
              ]
            },
            status: { type: "string", enum: ["DRAFT", "READY", "APPROVED", "ARCHIVED"] },
            generatedBy: { type: "string", minLength: 1, maxLength: 120 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const projectId = request.body.projectId.trim();
      if (!projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId is required");
      }

      const title = request.body.title.trim();
      if (!title) {
        return sendError(reply, 400, "VALIDATION_ERROR", "title is required");
      }

      const objective = request.body.objective?.trim();
      if (request.body.objective !== undefined && !objective) {
        return sendError(reply, 400, "VALIDATION_ERROR", "objective cannot be empty");
      }

      const audience = request.body.audience?.trim();
      if (request.body.audience !== undefined && !audience) {
        return sendError(reply, 400, "VALIDATION_ERROR", "audience cannot be empty");
      }

      const generatedBy = request.body.generatedBy?.trim();
      if (request.body.generatedBy !== undefined && !generatedBy) {
        return sendError(reply, 400, "VALIDATION_ERROR", "generatedBy cannot be empty");
      }

      const pageId = request.body.pageId?.trim();
      if (request.body.pageId !== undefined && !pageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "pageId cannot be empty");
      }

      const keywordId = request.body.keywordId?.trim();
      if (request.body.keywordId !== undefined && !keywordId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "keywordId cannot be empty");
      }

      try {
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            ownerId: owner.id
          },
          select: {
            id: true
          }
        });

        if (!project) {
          return sendError(reply, 404, "NOT_FOUND", "Project not found");
        }

        if (pageId) {
          const page = await prisma.page.findFirst({
            where: {
              id: pageId,
              projectId: project.id
            },
            select: {
              id: true
            }
          });

          if (!page) {
            return sendError(reply, 404, "NOT_FOUND", "Page not found for this project");
          }
        }

        if (keywordId) {
          const keyword = await prisma.keyword.findFirst({
            where: {
              id: keywordId,
              projectId: project.id
            },
            select: {
              id: true
            }
          });

          if (!keyword) {
            return sendError(reply, 404, "NOT_FOUND", "Keyword not found for this project");
          }
        }

        const created = await prisma.contentBrief.create({
          data: {
            projectId: project.id,
            pageId: pageId ?? null,
            keywordId: keywordId ?? null,
            title,
            objective,
            audience,
            outline: toNullableJsonInput(request.body.outline ?? null),
            status: request.body.status ?? BriefStatus.DRAFT,
            generatedBy
          },
          include: {
            project: {
              select: contentBriefProjectSelect
            },
            page: {
              select: contentBriefPageSelect
            },
            keyword: {
              select: contentBriefKeywordSelect
            },
            _count: {
              select: {
                tasks: true
              }
            }
          }
        });

        return reply.status(201).send({ data: toContentBriefResponse(created) });
      } catch (error) {
        app.log.error({ err: error }, "content brief create failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create content brief");
      }
    }
  );

  app.get<{ Querystring: ListContentBriefsQuery }>(
    "/v1/content-briefs",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            pageId: { type: "string", minLength: 1, maxLength: 64 },
            keywordId: { type: "string", minLength: 1, maxLength: 64 },
            status: { type: "string", enum: ["DRAFT", "READY", "APPROVED", "ARCHIVED"] },
            q: { type: "string", minLength: 1, maxLength: 255 },
            sort: {
              type: "string",
              enum: ["createdAt_desc", "createdAt_asc", "updatedAt_desc", "updatedAt_asc", "title_asc", "title_desc"],
              default: "createdAt_desc"
            }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const sort = request.query.sort ?? "createdAt_desc";
      const projectId = request.query.projectId?.trim();
      const pageId = request.query.pageId?.trim();
      const keywordId = request.query.keywordId?.trim();
      const q = request.query.q?.trim();

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      if (request.query.pageId !== undefined && !pageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "pageId cannot be empty");
      }

      if (request.query.keywordId !== undefined && !keywordId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "keywordId cannot be empty");
      }

      const where: Prisma.ContentBriefWhereInput = {
        project: {
          ownerId: owner.id,
          ...(projectId ? { id: projectId } : {})
        },
        ...(pageId ? { pageId } : {}),
        ...(keywordId ? { keywordId } : {}),
        ...(request.query.status ? { status: request.query.status } : {}),
        ...(q
          ? {
              OR: [
                {
                  title: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  objective: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  audience: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                }
              ]
            }
          : {})
      };

      const orderBy: Prisma.ContentBriefOrderByWithRelationInput[] =
        sort === "createdAt_asc"
          ? [{ createdAt: "asc" }]
          : sort === "updatedAt_desc"
            ? [{ updatedAt: "desc" }]
            : sort === "updatedAt_asc"
              ? [{ updatedAt: "asc" }]
              : sort === "title_asc"
                ? [{ title: "asc" }, { createdAt: "desc" }]
                : sort === "title_desc"
                  ? [{ title: "desc" }, { createdAt: "desc" }]
                  : [{ createdAt: "desc" }];

      try {
        const [total, briefs] = await prisma.$transaction([
          prisma.contentBrief.count({ where }),
          prisma.contentBrief.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              project: {
                select: contentBriefProjectSelect
              },
              page: {
                select: contentBriefPageSelect
              },
              keyword: {
                select: contentBriefKeywordSelect
              },
              _count: {
                select: {
                  tasks: true
                }
              }
            }
          })
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return reply.send({
          data: briefs.map(toContentBriefResponse),
          meta: {
            page,
            limit,
            total,
            totalPages
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "content briefs list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load content briefs");
      }
    }
  );

  app.get<{ Params: ContentBriefParams }>(
    "/v1/content-briefs/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const brief = await prisma.contentBrief.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: contentBriefProjectSelect
            },
            page: {
              select: contentBriefPageSelect
            },
            keyword: {
              select: contentBriefKeywordSelect
            },
            _count: {
              select: {
                tasks: true
              }
            }
          }
        });

        if (!brief) {
          return sendError(reply, 404, "NOT_FOUND", "Content brief not found");
        }

        return reply.send({ data: toContentBriefResponse(brief) });
      } catch (error) {
        app.log.error({ err: error }, "content brief get failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load content brief");
      }
    }
  );

  app.patch<{ Params: ContentBriefParams; Body: UpdateContentBriefBody }>(
    "/v1/content-briefs/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            pageId: { type: ["string", "null"], minLength: 1, maxLength: 64 },
            keywordId: { type: ["string", "null"], minLength: 1, maxLength: 64 },
            title: { type: "string", minLength: 1, maxLength: 255 },
            objective: { type: ["string", "null"], minLength: 1, maxLength: 2000 },
            audience: { type: ["string", "null"], minLength: 1, maxLength: 1000 },
            outline: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: true
                },
                { type: "null" }
              ]
            },
            status: { type: "string", enum: ["DRAFT", "READY", "APPROVED", "ARCHIVED"] },
            generatedBy: { type: ["string", "null"], minLength: 1, maxLength: 120 }
          },
          anyOf: [
            { required: ["pageId"] },
            { required: ["keywordId"] },
            { required: ["title"] },
            { required: ["objective"] },
            { required: ["audience"] },
            { required: ["outline"] },
            { required: ["status"] },
            { required: ["generatedBy"] }
          ]
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const data: Prisma.ContentBriefUpdateInput = {};
      let nextPageId: string | null | undefined;
      let nextKeywordId: string | null | undefined;

      if (request.body.pageId !== undefined) {
        if (request.body.pageId === null) {
          nextPageId = null;
        } else {
          const pageId = request.body.pageId.trim();
          if (!pageId) {
            return sendError(reply, 400, "VALIDATION_ERROR", "pageId cannot be empty");
          }
          nextPageId = pageId;
        }
      }

      if (request.body.keywordId !== undefined) {
        if (request.body.keywordId === null) {
          nextKeywordId = null;
        } else {
          const keywordId = request.body.keywordId.trim();
          if (!keywordId) {
            return sendError(reply, 400, "VALIDATION_ERROR", "keywordId cannot be empty");
          }
          nextKeywordId = keywordId;
        }
      }

      if (request.body.title !== undefined) {
        const title = request.body.title.trim();
        if (!title) {
          return sendError(reply, 400, "VALIDATION_ERROR", "title cannot be empty");
        }
        data.title = title;
      }

      if (request.body.objective !== undefined) {
        if (request.body.objective === null) {
          data.objective = null;
        } else {
          const objective = request.body.objective.trim();
          if (!objective) {
            return sendError(reply, 400, "VALIDATION_ERROR", "objective cannot be empty");
          }
          data.objective = objective;
        }
      }

      if (request.body.audience !== undefined) {
        if (request.body.audience === null) {
          data.audience = null;
        } else {
          const audience = request.body.audience.trim();
          if (!audience) {
            return sendError(reply, 400, "VALIDATION_ERROR", "audience cannot be empty");
          }
          data.audience = audience;
        }
      }

      if (request.body.outline !== undefined) {
        data.outline = toNullableJsonInput(request.body.outline);
      }

      if (request.body.status !== undefined) {
        data.status = request.body.status;
      }

      if (request.body.generatedBy !== undefined) {
        if (request.body.generatedBy === null) {
          data.generatedBy = null;
        } else {
          const generatedBy = request.body.generatedBy.trim();
          if (!generatedBy) {
            return sendError(reply, 400, "VALIDATION_ERROR", "generatedBy cannot be empty");
          }
          data.generatedBy = generatedBy;
        }
      }

      try {
        const existing = await prisma.contentBrief.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true,
            projectId: true
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Content brief not found");
        }

        if (nextPageId !== undefined) {
          if (nextPageId === null) {
            data.page = {
              disconnect: true
            };
          } else {
            const page = await prisma.page.findFirst({
              where: {
                id: nextPageId,
                projectId: existing.projectId
              },
              select: {
                id: true
              }
            });

            if (!page) {
              return sendError(reply, 404, "NOT_FOUND", "Page not found for this brief's project");
            }

            data.page = {
              connect: {
                id: nextPageId
              }
            };
          }
        }

        if (nextKeywordId !== undefined) {
          if (nextKeywordId === null) {
            data.keyword = {
              disconnect: true
            };
          } else {
            const keyword = await prisma.keyword.findFirst({
              where: {
                id: nextKeywordId,
                projectId: existing.projectId
              },
              select: {
                id: true
              }
            });

            if (!keyword) {
              return sendError(reply, 404, "NOT_FOUND", "Keyword not found for this brief's project");
            }

            data.keyword = {
              connect: {
                id: nextKeywordId
              }
            };
          }
        }

        const updated = await prisma.contentBrief.update({
          where: {
            id: request.params.id
          },
          data,
          include: {
            project: {
              select: contentBriefProjectSelect
            },
            page: {
              select: contentBriefPageSelect
            },
            keyword: {
              select: contentBriefKeywordSelect
            },
            _count: {
              select: {
                tasks: true
              }
            }
          }
        });

        return reply.send({ data: toContentBriefResponse(updated) });
      } catch (error) {
        app.log.error({ err: error }, "content brief patch failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to update content brief");
      }
    }
  );

  app.delete<{ Params: ContentBriefParams }>(
    "/v1/content-briefs/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const existing = await prisma.contentBrief.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          select: { id: true }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Content brief not found");
        }

        await prisma.contentBrief.delete({
          where: {
            id: request.params.id
          }
        });

        return reply.status(204).send();
      } catch (error) {
        app.log.error({ err: error }, "content brief delete failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to delete content brief");
      }
    }
  );

  app.post<{ Body: CreateContentTaskBody }>(
    "/v1/content-tasks",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "type"],
          properties: {
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            briefId: { type: "string", minLength: 1, maxLength: 64 },
            pageId: { type: "string", minLength: 1, maxLength: 64 },
            type: { type: "string", enum: ["WRITE", "OPTIMIZE", "REFRESH", "INTERNAL_LINKS", "OUTREACH"] },
            status: { type: "string", enum: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "FAILED"] },
            priority: { type: "integer", minimum: 1, maximum: 5 },
            payload: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: true
                },
                { type: "null" }
              ]
            },
            result: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: true
                },
                { type: "null" }
              ]
            },
            error: { type: "string", minLength: 1, maxLength: 5000 },
            dueAt: { type: "string", minLength: 1, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const projectId = request.body.projectId.trim();
      if (!projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId is required");
      }

      const briefId = request.body.briefId?.trim();
      if (request.body.briefId !== undefined && !briefId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "briefId cannot be empty");
      }

      const pageId = request.body.pageId?.trim();
      if (request.body.pageId !== undefined && !pageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "pageId cannot be empty");
      }

      const errorMessage = request.body.error?.trim();
      if (request.body.error !== undefined && !errorMessage) {
        return sendError(reply, 400, "VALIDATION_ERROR", "error cannot be empty");
      }

      const dueAt = request.body.dueAt !== undefined ? parseDateInput(request.body.dueAt) : undefined;
      if (request.body.dueAt !== undefined && !dueAt) {
        return sendError(reply, 400, "VALIDATION_ERROR", "dueAt must be a valid ISO date-time");
      }

      const initialStatus = request.body.status ?? TaskStatus.TODO;
      if (!canTransitionTaskStatus(TaskStatus.TODO, initialStatus)) {
        return sendError(reply, 400, "VALIDATION_ERROR", "invalid initial status transition");
      }

      const now = new Date();
      const startedAt = initialStatus === TaskStatus.IN_PROGRESS || initialStatus === TaskStatus.DONE ? now : null;
      const completedAt = initialStatus === TaskStatus.DONE ? now : null;

      try {
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            ownerId: owner.id
          },
          select: {
            id: true
          }
        });

        if (!project) {
          return sendError(reply, 404, "NOT_FOUND", "Project not found");
        }

        if (briefId) {
          const brief = await prisma.contentBrief.findFirst({
            where: {
              id: briefId,
              projectId: project.id
            },
            select: {
              id: true
            }
          });

          if (!brief) {
            return sendError(reply, 404, "NOT_FOUND", "Content brief not found for this project");
          }
        }

        if (pageId) {
          const page = await prisma.page.findFirst({
            where: {
              id: pageId,
              projectId: project.id
            },
            select: {
              id: true
            }
          });

          if (!page) {
            return sendError(reply, 404, "NOT_FOUND", "Page not found for this project");
          }
        }

        const created = await prisma.$transaction(async (tx) => {
          const next = await tx.contentTask.create({
            data: {
              projectId: project.id,
              briefId: briefId ?? null,
              pageId: pageId ?? null,
              type: request.body.type,
              status: initialStatus,
              priority: request.body.priority ?? 3,
              payload: toNullableJsonInput(request.body.payload ?? null),
              result: toNullableJsonInput(request.body.result ?? null),
              error: errorMessage,
              dueAt,
              startedAt,
              completedAt
            },
            include: {
              project: {
                select: contentTaskProjectSelect
              },
              brief: {
                select: contentTaskBriefSelect
              },
              page: {
                select: contentTaskPageSelect
              }
            }
          });

          if (initialStatus !== TaskStatus.TODO) {
            await tx.contentTaskTransitionEvent.create({
              data: {
                contentTaskId: next.id,
                fromStatus: TaskStatus.TODO,
                toStatus: initialStatus,
                actorUserId: owner.id,
                actorEmail: owner.email,
                actorSource: owner.authMode,
                note: null
              }
            });
          }

          return next;
        });

        return reply.status(201).send({ data: toContentTaskResponse(created) });
      } catch (error) {
        app.log.error({ err: error }, "content task create failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create content task");
      }
    }
  );

  app.get<{ Querystring: ListContentTasksQuery }>(
    "/v1/content-tasks",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            briefId: { type: "string", minLength: 1, maxLength: 64 },
            pageId: { type: "string", minLength: 1, maxLength: 64 },
            status: { type: "string", enum: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "FAILED"] },
            type: { type: "string", enum: ["WRITE", "OPTIMIZE", "REFRESH", "INTERNAL_LINKS", "OUTREACH"] },
            q: { type: "string", minLength: 1, maxLength: 255 },
            sort: {
              type: "string",
              enum: [
                "createdAt_desc",
                "createdAt_asc",
                "updatedAt_desc",
                "updatedAt_asc",
                "priority_asc",
                "priority_desc",
                "dueAt_asc",
                "dueAt_desc"
              ],
              default: "createdAt_desc"
            }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const sort = request.query.sort ?? "createdAt_desc";
      const projectId = request.query.projectId?.trim();
      const briefId = request.query.briefId?.trim();
      const pageId = request.query.pageId?.trim();
      const q = request.query.q?.trim();

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      if (request.query.briefId !== undefined && !briefId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "briefId cannot be empty");
      }

      if (request.query.pageId !== undefined && !pageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "pageId cannot be empty");
      }

      const where: Prisma.ContentTaskWhereInput = {
        project: {
          ownerId: owner.id,
          ...(projectId ? { id: projectId } : {})
        },
        ...(briefId ? { briefId } : {}),
        ...(pageId ? { pageId } : {}),
        ...(request.query.status ? { status: request.query.status } : {}),
        ...(request.query.type ? { type: request.query.type } : {}),
        ...(q
          ? {
              OR: [
                {
                  error: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  brief: {
                    is: {
                      title: {
                        contains: q,
                        mode: Prisma.QueryMode.insensitive
                      }
                    }
                  }
                },
                {
                  page: {
                    is: {
                      path: {
                        contains: q,
                        mode: Prisma.QueryMode.insensitive
                      }
                    }
                  }
                }
              ]
            }
          : {})
      };

      const orderBy: Prisma.ContentTaskOrderByWithRelationInput[] =
        sort === "createdAt_asc"
          ? [{ createdAt: "asc" }]
          : sort === "updatedAt_desc"
            ? [{ updatedAt: "desc" }]
            : sort === "updatedAt_asc"
              ? [{ updatedAt: "asc" }]
              : sort === "priority_asc"
                ? [{ priority: "asc" }, { createdAt: "desc" }]
                : sort === "priority_desc"
                  ? [{ priority: "desc" }, { createdAt: "desc" }]
                  : sort === "dueAt_asc"
                    ? [{ dueAt: "asc" }, { createdAt: "desc" }]
                    : sort === "dueAt_desc"
                      ? [{ dueAt: "desc" }, { createdAt: "desc" }]
                      : [{ createdAt: "desc" }];

      try {
        const [total, tasks] = await prisma.$transaction([
          prisma.contentTask.count({ where }),
          prisma.contentTask.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              project: {
                select: contentTaskProjectSelect
              },
              brief: {
                select: contentTaskBriefSelect
              },
              page: {
                select: contentTaskPageSelect
              }
            }
          })
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return reply.send({
          data: tasks.map(toContentTaskResponse),
          meta: {
            page,
            limit,
            total,
            totalPages
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "content tasks list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load content tasks");
      }
    }
  );

  app.get<{ Params: ContentTaskParams }>(
    "/v1/content-tasks/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const task = await prisma.contentTask.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: contentTaskProjectSelect
            },
            brief: {
              select: contentTaskBriefSelect
            },
            page: {
              select: contentTaskPageSelect
            }
          }
        });

        if (!task) {
          return sendError(reply, 404, "NOT_FOUND", "Content task not found");
        }

        return reply.send({ data: toContentTaskResponse(task) });
      } catch (error) {
        app.log.error({ err: error }, "content task get failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load content task");
      }
    }
  );

  app.get<{ Params: ContentTaskParams; Querystring: ListContentTaskHistoryQuery }>(
    "/v1/content-tasks/:id/history",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;

      try {
        const task = await prisma.contentTask.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true
          }
        });

        if (!task) {
          return sendError(reply, 404, "NOT_FOUND", "Content task not found");
        }

        const [total, history] = await prisma.$transaction([
          prisma.contentTaskTransitionEvent.count({
            where: {
              contentTaskId: task.id
            }
          }),
          prisma.contentTaskTransitionEvent.findMany({
            where: {
              contentTaskId: task.id
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            skip: (page - 1) * limit,
            take: limit
          })
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return reply.send({
          data: history.map(toContentTaskTransitionEventResponse),
          meta: {
            page,
            limit,
            total,
            totalPages,
            order: "createdAt_asc"
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "content task history list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load content task history");
      }
    }
  );

  app.patch<{ Params: ContentTaskParams; Body: UpdateContentTaskBody }>(
    "/v1/content-tasks/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            briefId: { type: ["string", "null"], minLength: 1, maxLength: 64 },
            pageId: { type: ["string", "null"], minLength: 1, maxLength: 64 },
            type: { type: "string", enum: ["WRITE", "OPTIMIZE", "REFRESH", "INTERNAL_LINKS", "OUTREACH"] },
            priority: { type: "integer", minimum: 1, maximum: 5 },
            payload: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: true
                },
                { type: "null" }
              ]
            },
            result: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: true
                },
                { type: "null" }
              ]
            },
            error: { type: ["string", "null"], minLength: 1, maxLength: 5000 },
            dueAt: { type: ["string", "null"], minLength: 1, maxLength: 64 }
          },
          anyOf: [
            { required: ["briefId"] },
            { required: ["pageId"] },
            { required: ["type"] },
            { required: ["priority"] },
            { required: ["payload"] },
            { required: ["result"] },
            { required: ["error"] },
            { required: ["dueAt"] }
          ]
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const data: Prisma.ContentTaskUpdateInput = {};
      let nextBriefId: string | null | undefined;
      let nextPageId: string | null | undefined;

      if (request.body.briefId !== undefined) {
        if (request.body.briefId === null) {
          nextBriefId = null;
        } else {
          const briefId = request.body.briefId.trim();
          if (!briefId) {
            return sendError(reply, 400, "VALIDATION_ERROR", "briefId cannot be empty");
          }
          nextBriefId = briefId;
        }
      }

      if (request.body.pageId !== undefined) {
        if (request.body.pageId === null) {
          nextPageId = null;
        } else {
          const pageId = request.body.pageId.trim();
          if (!pageId) {
            return sendError(reply, 400, "VALIDATION_ERROR", "pageId cannot be empty");
          }
          nextPageId = pageId;
        }
      }

      if (request.body.type !== undefined) {
        data.type = request.body.type;
      }

      if (request.body.priority !== undefined) {
        data.priority = request.body.priority;
      }

      if (request.body.payload !== undefined) {
        data.payload = toNullableJsonInput(request.body.payload);
      }

      if (request.body.result !== undefined) {
        data.result = toNullableJsonInput(request.body.result);
      }

      if (request.body.error !== undefined) {
        if (request.body.error === null) {
          data.error = null;
        } else {
          const errorMessage = request.body.error.trim();
          if (!errorMessage) {
            return sendError(reply, 400, "VALIDATION_ERROR", "error cannot be empty");
          }
          data.error = errorMessage;
        }
      }

      if (request.body.dueAt !== undefined) {
        if (request.body.dueAt === null) {
          data.dueAt = null;
        } else {
          const dueAt = parseDateInput(request.body.dueAt);
          if (!dueAt) {
            return sendError(reply, 400, "VALIDATION_ERROR", "dueAt must be a valid ISO date-time");
          }
          data.dueAt = dueAt;
        }
      }

      try {
        const existing = await prisma.contentTask.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true,
            projectId: true
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Content task not found");
        }

        if (nextBriefId !== undefined) {
          if (nextBriefId === null) {
            data.brief = {
              disconnect: true
            };
          } else {
            const brief = await prisma.contentBrief.findFirst({
              where: {
                id: nextBriefId,
                projectId: existing.projectId
              },
              select: {
                id: true
              }
            });

            if (!brief) {
              return sendError(reply, 404, "NOT_FOUND", "Content brief not found for this task's project");
            }

            data.brief = {
              connect: {
                id: nextBriefId
              }
            };
          }
        }

        if (nextPageId !== undefined) {
          if (nextPageId === null) {
            data.page = {
              disconnect: true
            };
          } else {
            const page = await prisma.page.findFirst({
              where: {
                id: nextPageId,
                projectId: existing.projectId
              },
              select: {
                id: true
              }
            });

            if (!page) {
              return sendError(reply, 404, "NOT_FOUND", "Page not found for this task's project");
            }

            data.page = {
              connect: {
                id: nextPageId
              }
            };
          }
        }

        const updated = await prisma.contentTask.update({
          where: {
            id: request.params.id
          },
          data,
          include: {
            project: {
              select: contentTaskProjectSelect
            },
            brief: {
              select: contentTaskBriefSelect
            },
            page: {
              select: contentTaskPageSelect
            }
          }
        });

        return reply.send({ data: toContentTaskResponse(updated) });
      } catch (error) {
        app.log.error({ err: error }, "content task update failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to update content task");
      }
    }
  );

  app.post<{ Params: ContentTaskParams; Body: TransitionContentTaskBody }>(
    "/v1/content-tasks/:id/transition",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["status"],
          properties: {
            status: { type: "string", enum: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "FAILED"] },
            error: { type: ["string", "null"], minLength: 1, maxLength: 5000 },
            result: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: true
                },
                { type: "null" }
              ]
            },
            note: { type: ["string", "null"], minLength: 1, maxLength: 2000 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const existing = await prisma.contentTask.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Content task not found");
        }

        if (!canTransitionTaskStatus(existing.status, request.body.status)) {
          return sendError(reply, 409, "TASK_INVALID_TRANSITION", `Cannot transition ${existing.status} -> ${request.body.status}`);
        }

        const data = buildTaskStatusUpdate(
          existing.status,
          request.body.status,
          existing.startedAt,
          existing.completedAt
        );

        if (request.body.error !== undefined) {
          if (request.body.error === null) {
            data.error = null;
          } else {
            const errorMessage = request.body.error.trim();
            if (!errorMessage) {
              return sendError(reply, 400, "VALIDATION_ERROR", "error cannot be empty");
            }
            data.error = errorMessage;
          }
        }

        if (request.body.result !== undefined) {
          data.result = toNullableJsonInput(request.body.result);
        }

        let note: string | null = null;
        if (request.body.note !== undefined) {
          if (request.body.note === null) {
            note = null;
          } else {
            const normalizedNote = request.body.note.trim();
            if (!normalizedNote) {
              return sendError(reply, 400, "VALIDATION_ERROR", "note cannot be empty");
            }
            note = normalizedNote;
          }
        }

        const updated = await prisma.$transaction(async (tx) => {
          const next = await tx.contentTask.update({
            where: {
              id: request.params.id
            },
            data,
            include: {
              project: {
                select: contentTaskProjectSelect
              },
              brief: {
                select: contentTaskBriefSelect
              },
              page: {
                select: contentTaskPageSelect
              }
            }
          });

          if (existing.status !== request.body.status) {
            await tx.contentTaskTransitionEvent.create({
              data: {
                contentTaskId: existing.id,
                fromStatus: existing.status,
                toStatus: request.body.status,
                actorUserId: owner.id,
                actorEmail: owner.email,
                actorSource: owner.authMode,
                note
              }
            });
          }

          return next;
        });

        return reply.send({ data: toContentTaskResponse(updated) });
      } catch (error) {
        app.log.error({ err: error }, "content task transition failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to transition content task");
      }
    }
  );

  app.delete<{ Params: ContentTaskParams }>(
    "/v1/content-tasks/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      try {
        const existing = await prisma.contentTask.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Content task not found");
        }

        await prisma.contentTask.delete({
          where: {
            id: request.params.id
          }
        });

        return reply.status(204).send();
      } catch (error) {
        app.log.error({ err: error }, "content task delete failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to delete content task");
      }
    }
  );
}
