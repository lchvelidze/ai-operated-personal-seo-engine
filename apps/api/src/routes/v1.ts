import { FastifyInstance, FastifyReply } from "fastify";
import { DeviceType, KeywordIntent, PageStatus, Prisma, Project, ProjectStatus, SearchEngine } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuthUser } from "../lib/request-auth.js";
import { registerPhase8Routes } from "./v1.phase8.js";
import { registerPhase9Routes } from "./v1.phase9.js";
import { registerPhase10Routes } from "./v1.phase10.js";
import { registerPhase11Routes } from "./v1.phase11.js";

type CreateProjectBody = {
  name: string;
  domain?: string;
};

type UpdateProjectBody = {
  name?: string;
  domain?: string | null;
  status?: ProjectStatus;
  timezone?: string;
};

type ProjectParams = {
  id: string;
};

type ListProjectsQuery = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: "createdAt_desc" | "createdAt_asc" | "name_asc" | "name_desc";
};

type CreatePageBody = {
  projectId: string;
  path: string;
  title?: string;
  metaDescription?: string;
  url?: string;
  status?: PageStatus;
};

type UpdatePageBody = {
  path?: string;
  title?: string | null;
  metaDescription?: string | null;
  url?: string;
  status?: PageStatus;
};

type PageParams = {
  id: string;
};

type ListPagesQuery = {
  page?: number;
  limit?: number;
  q?: string;
  projectId?: string;
  sort?: "createdAt_desc" | "createdAt_asc" | "path_asc" | "path_desc";
};

type CreateKeywordBody = {
  projectId: string;
  pageId?: string;
  term: string;
  locale?: string;
  device?: DeviceType;
  intent?: KeywordIntent;
  isActive?: boolean;
};

type UpdateKeywordBody = {
  pageId?: string | null;
  term?: string;
  locale?: string;
  device?: DeviceType;
  intent?: KeywordIntent | null;
  isActive?: boolean;
};

type KeywordParams = {
  id: string;
};

type ListKeywordsQuery = {
  page?: number;
  limit?: number;
  q?: string;
  projectId?: string;
  pageId?: string;
  isActive?: boolean;
  locale?: string;
  device?: DeviceType;
  sort?: "createdAt_desc" | "createdAt_asc" | "term_asc" | "term_desc" | "updatedAt_desc" | "updatedAt_asc";
};

type CreateRankSnapshotBody = {
  keywordId: string;
  recordedAt?: string;
  engine?: SearchEngine;
  locale?: string;
  device?: DeviceType;
  rank?: number | null;
  url?: string;
};

type ListRankSnapshotsQuery = {
  page?: number;
  limit?: number;
  projectId?: string;
  keywordId?: string;
  from?: string;
  to?: string;
  engine?: SearchEngine;
  locale?: string;
  device?: DeviceType;
  sort?: "recordedAt_desc" | "recordedAt_asc" | "createdAt_desc" | "createdAt_asc" | "rank_asc" | "rank_desc";
};

const pageProjectSelect = {
  id: true,
  name: true,
  slug: true,
  domain: true
} as const;

type PageWithProject = Prisma.PageGetPayload<{
  include: {
    project: {
      select: typeof pageProjectSelect;
    };
  };
}>;

const keywordProjectSelect = {
  id: true,
  name: true,
  slug: true,
  domain: true
} as const;

const keywordPageSelect = {
  id: true,
  path: true,
  url: true
} as const;

type KeywordWithRelations = Prisma.KeywordGetPayload<{
  include: {
    project: {
      select: typeof keywordProjectSelect;
    };
    page: {
      select: typeof keywordPageSelect;
    };
  };
}>;

const rankSnapshotProjectSelect = {
  id: true,
  name: true,
  slug: true
} as const;

const rankSnapshotKeywordSelect = {
  id: true,
  term: true,
  projectId: true,
  pageId: true
} as const;

type RankSnapshotWithRelations = Prisma.RankSnapshotGetPayload<{
  include: {
    project: {
      select: typeof rankSnapshotProjectSelect;
    };
    keyword: {
      select: typeof rankSnapshotKeywordSelect;
    };
  };
}>;

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.status(statusCode).send({
    error: {
      code,
      message
    }
  });
}

function toProjectResponse(project: Project) {
  return {
    id: project.id,
    ownerId: project.ownerId,
    name: project.name,
    slug: project.slug,
    domain: project.domain,
    timezone: project.timezone,
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

function toPageResponse(page: PageWithProject) {
  return {
    id: page.id,
    projectId: page.projectId,
    project: {
      id: page.project.id,
      name: page.project.name,
      slug: page.project.slug,
      domain: page.project.domain
    },
    url: page.url,
    path: page.path,
    title: page.title,
    metaDescription: page.metaDescription,
    status: page.status,
    lastPublishedAt: page.lastPublishedAt?.toISOString() ?? null,
    lastCrawledAt: page.lastCrawledAt?.toISOString() ?? null,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString()
  };
}

function toKeywordResponse(keyword: KeywordWithRelations) {
  return {
    id: keyword.id,
    projectId: keyword.projectId,
    pageId: keyword.pageId,
    project: {
      id: keyword.project.id,
      name: keyword.project.name,
      slug: keyword.project.slug,
      domain: keyword.project.domain
    },
    page: keyword.page
      ? {
          id: keyword.page.id,
          path: keyword.page.path,
          url: keyword.page.url
        }
      : null,
    term: keyword.term,
    intent: keyword.intent,
    locale: keyword.locale,
    device: keyword.device,
    isActive: keyword.isActive,
    difficulty: keyword.difficulty,
    cpc: keyword.cpc?.toString() ?? null,
    searchVolume: keyword.searchVolume,
    createdAt: keyword.createdAt.toISOString(),
    updatedAt: keyword.updatedAt.toISOString()
  };
}

function toRankSnapshotResponse(snapshot: RankSnapshotWithRelations) {
  return {
    id: snapshot.id,
    projectId: snapshot.projectId,
    keywordId: snapshot.keywordId,
    project: {
      id: snapshot.project.id,
      name: snapshot.project.name,
      slug: snapshot.project.slug
    },
    keyword: {
      id: snapshot.keyword.id,
      term: snapshot.keyword.term,
      projectId: snapshot.keyword.projectId,
      pageId: snapshot.keyword.pageId
    },
    recordedAt: snapshot.recordedAt.toISOString(),
    engine: snapshot.engine,
    locale: snapshot.locale,
    device: snapshot.device,
    rank: snapshot.rank,
    url: snapshot.url,
    serpFeatures: snapshot.serpFeatures,
    createdAt: snapshot.createdAt.toISOString()
  };
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function normalizeDomain(domain?: string | null): string | null {
  if (domain === null) return null;
  if (typeof domain !== "string") return null;

  const raw = domain.trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname || parsed.hostname.includes(" ")) return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normalizePath(path: string): string | null {
  const raw = path.trim();
  if (!raw) return null;
  if (/\s/.test(raw)) return null;
  if (raw.includes("://")) return null;

  const noQuery = raw.split("?")[0]?.split("#")[0] ?? "";
  if (!noQuery) return null;

  let normalized = noQuery.replace(/\/{2,}/g, "/");
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  try {
    const parsed = new URL(`https://example.com${normalized}`);
    return parsed.pathname;
  } catch {
    return null;
  }
}

function normalizeUrl(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname || parsed.hostname.includes(" ")) return null;

    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeLocale(locale: string): string | null {
  const value = locale.trim();
  if (!value) return null;
  return value;
}

function parseDateInput(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function derivePageUrl(domain: string | null, path: string) {
  if (!domain) return path;

  try {
    const parsed = new URL(`https://${domain}`);
    parsed.pathname = path;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return path;
  }
}

async function makeUniqueSlug(ownerId: string, projectName: string) {
  const baseSlug = slugify(projectName) || "project";

  for (let i = 0; i < 1000; i += 1) {
    const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
    const exists = await prisma.project.findUnique({
      where: {
        ownerId_slug: {
          ownerId,
          slug: candidate
        }
      },
      select: { id: true }
    });

    if (!exists) return candidate;
  }

  throw new Error("Unable to generate a unique project slug");
}

export async function v1Routes(app: FastifyInstance) {
  app.get("/v1", async (request, reply) => {
    const user = await requireAuthUser(request, reply);
    if (!user) return;

    return {
      message: "v1 routes online",
      user: {
        id: user.id,
        email: user.email,
        authMode: user.authMode
      }
    };
  });

  app.post<{ Body: CreateProjectBody }>(
    "/v1/projects",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            domain: { type: "string", minLength: 1, maxLength: 255 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const name = request.body.name.trim();
      if (!name) {
        return sendError(reply, 400, "VALIDATION_ERROR", "name is required");
      }

      const normalizedDomain = normalizeDomain(request.body.domain);
      if (request.body.domain !== undefined && normalizedDomain === null) {
        return sendError(reply, 400, "VALIDATION_ERROR", "domain must be a valid hostname or URL");
      }

      try {
        const slug = await makeUniqueSlug(owner.id, name);

        const created = await prisma.project.create({
          data: {
            ownerId: owner.id,
            name,
            slug,
            domain: normalizedDomain
          }
        });

        return reply.status(201).send({ data: toProjectResponse(created) });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          app.log.error({ err: error, code: error.code }, "project create prisma error");
          return sendError(reply, 409, "PROJECT_CREATE_CONFLICT", "Unable to create project");
        }

        app.log.error({ err: error }, "project create failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create project");
      }
    }
  );

  app.get<{ Querystring: ListProjectsQuery }>(
    "/v1/projects",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            q: { type: "string", minLength: 1, maxLength: 120 },
            sort: {
              type: "string",
              enum: ["createdAt_desc", "createdAt_asc", "name_asc", "name_desc"],
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
      const q = request.query.q?.trim();

      const where: Prisma.ProjectWhereInput = {
        ownerId: owner.id,
        ...(q
          ? {
              name: {
                contains: q,
                mode: Prisma.QueryMode.insensitive
              }
            }
          : {})
      };

      const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
        sort === "createdAt_asc"
          ? [{ createdAt: "asc" }]
          : sort === "name_asc"
            ? [{ name: "asc" }, { createdAt: "desc" }]
            : sort === "name_desc"
              ? [{ name: "desc" }, { createdAt: "desc" }]
              : [{ createdAt: "desc" }];

      try {
        const [total, projects] = await prisma.$transaction([
          prisma.project.count({ where }),
          prisma.project.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit
          })
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return reply.send({
          data: projects.map(toProjectResponse),
          meta: {
            page,
            limit,
            total,
            totalPages
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "project list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load projects");
      }
    }
  );

  app.get<{ Params: ProjectParams }>(
    "/v1/projects/:id",
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
        const project = await prisma.project.findFirst({
          where: {
            id: request.params.id,
            ownerId: owner.id
          }
        });

        if (!project) {
          return sendError(reply, 404, "NOT_FOUND", "Project not found");
        }

        return reply.send({ data: toProjectResponse(project) });
      } catch (error) {
        app.log.error({ err: error }, "project get failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load project");
      }
    }
  );

  app.patch<{ Params: ProjectParams; Body: UpdateProjectBody }>(
    "/v1/projects/:id",
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
            name: { type: "string", minLength: 1, maxLength: 120 },
            domain: { type: ["string", "null"], minLength: 1, maxLength: 255 },
            status: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED"] },
            timezone: { type: "string", minLength: 1, maxLength: 80 }
          },
          anyOf: [{ required: ["name"] }, { required: ["domain"] }, { required: ["status"] }, { required: ["timezone"] }]
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const data: Prisma.ProjectUpdateInput = {};

      if (typeof request.body.name === "string") {
        const trimmed = request.body.name.trim();
        if (!trimmed) {
          return sendError(reply, 400, "VALIDATION_ERROR", "name cannot be empty");
        }

        data.name = trimmed;
      }

      if (request.body.domain !== undefined) {
        const normalizedDomain = normalizeDomain(request.body.domain);
        if (request.body.domain !== null && normalizedDomain === null) {
          return sendError(reply, 400, "VALIDATION_ERROR", "domain must be a valid hostname or URL");
        }

        data.domain = normalizedDomain;
      }

      if (request.body.status !== undefined) {
        data.status = request.body.status;
      }

      if (typeof request.body.timezone === "string") {
        const timezone = request.body.timezone.trim();
        if (!timezone) {
          return sendError(reply, 400, "VALIDATION_ERROR", "timezone cannot be empty");
        }
        data.timezone = timezone;
      }

      try {
        const existing = await prisma.project.findFirst({
          where: {
            id: request.params.id,
            ownerId: owner.id
          },
          select: { id: true }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Project not found");
        }

        const updated = await prisma.project.update({
          where: { id: request.params.id },
          data
        });

        return reply.send({ data: toProjectResponse(updated) });
      } catch (error) {
        app.log.error({ err: error }, "project patch failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to update project");
      }
    }
  );

  app.delete<{ Params: ProjectParams }>(
    "/v1/projects/:id",
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
        const existing = await prisma.project.findFirst({
          where: {
            id: request.params.id,
            ownerId: owner.id
          },
          select: { id: true }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Project not found");
        }

        await prisma.project.delete({
          where: { id: request.params.id }
        });

        return reply.status(204).send();
      } catch (error) {
        app.log.error({ err: error }, "project delete failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to delete project");
      }
    }
  );

  app.post<{ Body: CreatePageBody }>(
    "/v1/pages",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "path"],
          properties: {
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            path: { type: "string", minLength: 1, maxLength: 500 },
            title: { type: "string", minLength: 1, maxLength: 255 },
            metaDescription: { type: "string", minLength: 1, maxLength: 320 },
            url: { type: "string", minLength: 1, maxLength: 2048 },
            status: { type: "string", enum: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] }
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

      const normalizedPath = normalizePath(request.body.path);
      if (!normalizedPath) {
        return sendError(reply, 400, "VALIDATION_ERROR", "path must be a valid URL path");
      }

      const title = typeof request.body.title === "string" ? request.body.title.trim() : undefined;
      if (request.body.title !== undefined && !title) {
        return sendError(reply, 400, "VALIDATION_ERROR", "title cannot be empty");
      }

      const metaDescription =
        typeof request.body.metaDescription === "string" ? request.body.metaDescription.trim() : undefined;
      if (request.body.metaDescription !== undefined && !metaDescription) {
        return sendError(reply, 400, "VALIDATION_ERROR", "metaDescription cannot be empty");
      }

      const normalizedProvidedUrl =
        typeof request.body.url === "string" ? normalizeUrl(request.body.url) : null;
      if (request.body.url !== undefined && normalizedProvidedUrl === null) {
        return sendError(reply, 400, "VALIDATION_ERROR", "url must be a valid HTTP(S) URL or hostname");
      }

      try {
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            ownerId: owner.id
          },
          select: {
            id: true,
            domain: true
          }
        });

        if (!project) {
          return sendError(reply, 404, "NOT_FOUND", "Project not found");
        }

        const url = normalizedProvidedUrl ?? derivePageUrl(project.domain, normalizedPath);

        const created = await prisma.page.create({
          data: {
            projectId: project.id,
            path: normalizedPath,
            url,
            title,
            metaDescription,
            status: request.body.status ?? PageStatus.DRAFT
          },
          include: {
            project: {
              select: pageProjectSelect
            }
          }
        });

        return reply.status(201).send({ data: toPageResponse(created) });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return sendError(reply, 409, "PAGE_CREATE_CONFLICT", "A page with this path already exists for the project");
        }

        app.log.error({ err: error }, "page create failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create page");
      }
    }
  );

  app.get<{ Querystring: ListPagesQuery }>(
    "/v1/pages",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            q: { type: "string", minLength: 1, maxLength: 255 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            sort: {
              type: "string",
              enum: ["createdAt_desc", "createdAt_asc", "path_asc", "path_desc"],
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
      const q = request.query.q?.trim();
      const projectId = request.query.projectId?.trim();

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      const where: Prisma.PageWhereInput = {
        project: {
          ownerId: owner.id,
          ...(projectId ? { id: projectId } : {})
        },
        ...(q
          ? {
              OR: [
                {
                  path: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  url: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  title: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  metaDescription: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                }
              ]
            }
          : {})
      };

      const orderBy: Prisma.PageOrderByWithRelationInput[] =
        sort === "createdAt_asc"
          ? [{ createdAt: "asc" }]
          : sort === "path_asc"
            ? [{ path: "asc" }, { createdAt: "desc" }]
            : sort === "path_desc"
              ? [{ path: "desc" }, { createdAt: "desc" }]
              : [{ createdAt: "desc" }];

      try {
        const [total, pages] = await prisma.$transaction([
          prisma.page.count({ where }),
          prisma.page.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              project: {
                select: pageProjectSelect
              }
            }
          })
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return reply.send({
          data: pages.map(toPageResponse),
          meta: {
            page,
            limit,
            total,
            totalPages
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "page list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load pages");
      }
    }
  );

  app.get<{ Params: PageParams }>(
    "/v1/pages/:id",
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
        const page = await prisma.page.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: pageProjectSelect
            }
          }
        });

        if (!page) {
          return sendError(reply, 404, "NOT_FOUND", "Page not found");
        }

        return reply.send({ data: toPageResponse(page) });
      } catch (error) {
        app.log.error({ err: error }, "page get failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load page");
      }
    }
  );

  app.patch<{ Params: PageParams; Body: UpdatePageBody }>(
    "/v1/pages/:id",
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
            path: { type: "string", minLength: 1, maxLength: 500 },
            title: { type: ["string", "null"], minLength: 1, maxLength: 255 },
            metaDescription: { type: ["string", "null"], minLength: 1, maxLength: 320 },
            url: { type: "string", minLength: 1, maxLength: 2048 },
            status: { type: "string", enum: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] }
          },
          anyOf: [
            { required: ["path"] },
            { required: ["title"] },
            { required: ["metaDescription"] },
            { required: ["url"] },
            { required: ["status"] }
          ]
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const data: Prisma.PageUpdateInput = {};
      let nextPath: string | null = null;

      if (typeof request.body.path === "string") {
        const normalizedPath = normalizePath(request.body.path);
        if (!normalizedPath) {
          return sendError(reply, 400, "VALIDATION_ERROR", "path must be a valid URL path");
        }

        data.path = normalizedPath;
        nextPath = normalizedPath;
      }

      if (request.body.title !== undefined) {
        if (request.body.title === null) {
          data.title = null;
        } else {
          const title = request.body.title.trim();
          if (!title) {
            return sendError(reply, 400, "VALIDATION_ERROR", "title cannot be empty");
          }

          data.title = title;
        }
      }

      if (request.body.metaDescription !== undefined) {
        if (request.body.metaDescription === null) {
          data.metaDescription = null;
        } else {
          const metaDescription = request.body.metaDescription.trim();
          if (!metaDescription) {
            return sendError(reply, 400, "VALIDATION_ERROR", "metaDescription cannot be empty");
          }

          data.metaDescription = metaDescription;
        }
      }

      if (typeof request.body.url === "string") {
        const normalizedUrl = normalizeUrl(request.body.url);
        if (!normalizedUrl) {
          return sendError(reply, 400, "VALIDATION_ERROR", "url must be a valid HTTP(S) URL or hostname");
        }

        data.url = normalizedUrl;
      }

      if (request.body.status !== undefined) {
        data.status = request.body.status;
      }

      try {
        const existing = await prisma.page.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true,
            project: {
              select: {
                domain: true
              }
            }
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Page not found");
        }

        if (nextPath && data.url === undefined) {
          data.url = derivePageUrl(existing.project.domain, nextPath);
        }

        const updated = await prisma.page.update({
          where: { id: request.params.id },
          data,
          include: {
            project: {
              select: pageProjectSelect
            }
          }
        });

        return reply.send({ data: toPageResponse(updated) });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return sendError(reply, 409, "PAGE_UPDATE_CONFLICT", "A page with this path already exists for the project");
        }

        app.log.error({ err: error }, "page patch failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to update page");
      }
    }
  );

  app.delete<{ Params: PageParams }>(
    "/v1/pages/:id",
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
        const existing = await prisma.page.findFirst({
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
          return sendError(reply, 404, "NOT_FOUND", "Page not found");
        }

        await prisma.page.delete({
          where: {
            id: request.params.id
          }
        });

        return reply.status(204).send();
      } catch (error) {
        app.log.error({ err: error }, "page delete failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to delete page");
      }
    }
  );

  app.post<{ Body: CreateKeywordBody }>(
    "/v1/keywords",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "term"],
          properties: {
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            pageId: { type: "string", minLength: 1, maxLength: 64 },
            term: { type: "string", minLength: 1, maxLength: 255 },
            locale: { type: "string", minLength: 1, maxLength: 32 },
            device: { type: "string", enum: ["DESKTOP", "MOBILE"] },
            intent: {
              type: "string",
              enum: ["INFORMATIONAL", "COMMERCIAL", "TRANSACTIONAL", "NAVIGATIONAL"]
            },
            isActive: { type: "boolean" }
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

      const term = request.body.term.trim();
      if (!term) {
        return sendError(reply, 400, "VALIDATION_ERROR", "term is required");
      }

      const locale = request.body.locale !== undefined ? normalizeLocale(request.body.locale) : "en-US";
      if (!locale) {
        return sendError(reply, 400, "VALIDATION_ERROR", "locale cannot be empty");
      }

      const pageId = request.body.pageId?.trim();
      if (request.body.pageId !== undefined && !pageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "pageId cannot be empty");
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

        const created = await prisma.keyword.create({
          data: {
            projectId: project.id,
            pageId: pageId ?? null,
            term,
            locale,
            device: request.body.device ?? DeviceType.DESKTOP,
            intent: request.body.intent,
            isActive: request.body.isActive ?? true
          },
          include: {
            project: {
              select: keywordProjectSelect
            },
            page: {
              select: keywordPageSelect
            }
          }
        });

        return reply.status(201).send({ data: toKeywordResponse(created) });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return sendError(
            reply,
            409,
            "KEYWORD_CREATE_CONFLICT",
            "A keyword with this term/locale/device already exists for the project"
          );
        }

        app.log.error({ err: error }, "keyword create failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create keyword");
      }
    }
  );

  app.get<{ Querystring: ListKeywordsQuery }>(
    "/v1/keywords",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            q: { type: "string", minLength: 1, maxLength: 255 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            pageId: { type: "string", minLength: 1, maxLength: 64 },
            isActive: { type: "boolean" },
            locale: { type: "string", minLength: 1, maxLength: 32 },
            device: { type: "string", enum: ["DESKTOP", "MOBILE"] },
            sort: {
              type: "string",
              enum: [
                "createdAt_desc",
                "createdAt_asc",
                "term_asc",
                "term_desc",
                "updatedAt_desc",
                "updatedAt_asc"
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
      const q = request.query.q?.trim();
      const projectId = request.query.projectId?.trim();
      const pageId = request.query.pageId?.trim();
      const locale = request.query.locale?.trim();

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      if (request.query.pageId !== undefined && !pageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "pageId cannot be empty");
      }

      if (request.query.locale !== undefined && !locale) {
        return sendError(reply, 400, "VALIDATION_ERROR", "locale cannot be empty");
      }

      const where: Prisma.KeywordWhereInput = {
        project: {
          ownerId: owner.id,
          ...(projectId ? { id: projectId } : {})
        },
        ...(pageId ? { pageId } : {}),
        ...(request.query.isActive !== undefined ? { isActive: request.query.isActive } : {}),
        ...(locale ? { locale } : {}),
        ...(request.query.device ? { device: request.query.device } : {}),
        ...(q
          ? {
              term: {
                contains: q,
                mode: Prisma.QueryMode.insensitive
              }
            }
          : {})
      };

      const orderBy: Prisma.KeywordOrderByWithRelationInput[] =
        sort === "createdAt_asc"
          ? [{ createdAt: "asc" }]
          : sort === "term_asc"
            ? [{ term: "asc" }, { createdAt: "desc" }]
            : sort === "term_desc"
              ? [{ term: "desc" }, { createdAt: "desc" }]
              : sort === "updatedAt_desc"
                ? [{ updatedAt: "desc" }]
                : sort === "updatedAt_asc"
                  ? [{ updatedAt: "asc" }]
                  : [{ createdAt: "desc" }];

      try {
        const [total, keywords] = await prisma.$transaction([
          prisma.keyword.count({ where }),
          prisma.keyword.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              project: {
                select: keywordProjectSelect
              },
              page: {
                select: keywordPageSelect
              }
            }
          })
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return reply.send({
          data: keywords.map(toKeywordResponse),
          meta: {
            page,
            limit,
            total,
            totalPages
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "keyword list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load keywords");
      }
    }
  );

  app.get<{ Params: KeywordParams }>(
    "/v1/keywords/:id",
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
        const keyword = await prisma.keyword.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: keywordProjectSelect
            },
            page: {
              select: keywordPageSelect
            }
          }
        });

        if (!keyword) {
          return sendError(reply, 404, "NOT_FOUND", "Keyword not found");
        }

        return reply.send({ data: toKeywordResponse(keyword) });
      } catch (error) {
        app.log.error({ err: error }, "keyword get failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load keyword");
      }
    }
  );

  app.patch<{ Params: KeywordParams; Body: UpdateKeywordBody }>(
    "/v1/keywords/:id",
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
            term: { type: "string", minLength: 1, maxLength: 255 },
            locale: { type: "string", minLength: 1, maxLength: 32 },
            device: { type: "string", enum: ["DESKTOP", "MOBILE"] },
            intent: {
              type: ["string", "null"],
              enum: ["INFORMATIONAL", "COMMERCIAL", "TRANSACTIONAL", "NAVIGATIONAL", null]
            },
            isActive: { type: "boolean" }
          },
          anyOf: [
            { required: ["pageId"] },
            { required: ["term"] },
            { required: ["locale"] },
            { required: ["device"] },
            { required: ["intent"] },
            { required: ["isActive"] }
          ]
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const data: Prisma.KeywordUpdateInput = {};
      let nextPageId: string | null | undefined;

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

      if (typeof request.body.term === "string") {
        const term = request.body.term.trim();
        if (!term) {
          return sendError(reply, 400, "VALIDATION_ERROR", "term cannot be empty");
        }

        data.term = term;
      }

      if (typeof request.body.locale === "string") {
        const locale = normalizeLocale(request.body.locale);
        if (!locale) {
          return sendError(reply, 400, "VALIDATION_ERROR", "locale cannot be empty");
        }

        data.locale = locale;
      }

      if (request.body.device !== undefined) {
        data.device = request.body.device;
      }

      if (request.body.intent !== undefined) {
        data.intent = request.body.intent;
      }

      if (request.body.isActive !== undefined) {
        data.isActive = request.body.isActive;
      }

      try {
        const existing = await prisma.keyword.findFirst({
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
          return sendError(reply, 404, "NOT_FOUND", "Keyword not found");
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
              return sendError(reply, 404, "NOT_FOUND", "Page not found for this keyword's project");
            }

            data.page = {
              connect: {
                id: nextPageId
              }
            };
          }
        }

        const updated = await prisma.keyword.update({
          where: { id: request.params.id },
          data,
          include: {
            project: {
              select: keywordProjectSelect
            },
            page: {
              select: keywordPageSelect
            }
          }
        });

        return reply.send({ data: toKeywordResponse(updated) });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return sendError(
            reply,
            409,
            "KEYWORD_UPDATE_CONFLICT",
            "A keyword with this term/locale/device already exists for the project"
          );
        }

        app.log.error({ err: error }, "keyword patch failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to update keyword");
      }
    }
  );

  app.delete<{ Params: KeywordParams }>(
    "/v1/keywords/:id",
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
        const existing = await prisma.keyword.findFirst({
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
          return sendError(reply, 404, "NOT_FOUND", "Keyword not found");
        }

        await prisma.keyword.delete({
          where: { id: request.params.id }
        });

        return reply.status(204).send();
      } catch (error) {
        app.log.error({ err: error }, "keyword delete failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to delete keyword");
      }
    }
  );

  app.post<{ Body: CreateRankSnapshotBody }>(
    "/v1/rank-snapshots",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["keywordId"],
          properties: {
            keywordId: { type: "string", minLength: 1, maxLength: 64 },
            recordedAt: { type: "string", minLength: 1, maxLength: 64 },
            engine: { type: "string", enum: ["GOOGLE", "BING"] },
            locale: { type: "string", minLength: 1, maxLength: 32 },
            device: { type: "string", enum: ["DESKTOP", "MOBILE"] },
            rank: { type: ["integer", "null"], minimum: 1, maximum: 100 },
            url: { type: "string", minLength: 1, maxLength: 2048 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const keywordId = request.body.keywordId.trim();
      if (!keywordId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "keywordId is required");
      }

      const locale = request.body.locale !== undefined ? normalizeLocale(request.body.locale) : undefined;
      if (request.body.locale !== undefined && !locale) {
        return sendError(reply, 400, "VALIDATION_ERROR", "locale cannot be empty");
      }

      const recordedAt =
        request.body.recordedAt !== undefined ? parseDateInput(request.body.recordedAt) : new Date();
      if (!recordedAt) {
        return sendError(reply, 400, "VALIDATION_ERROR", "recordedAt must be a valid ISO date-time");
      }

      const normalizedUrl = request.body.url !== undefined ? normalizeUrl(request.body.url) : undefined;
      if (request.body.url !== undefined && !normalizedUrl) {
        return sendError(reply, 400, "VALIDATION_ERROR", "url must be a valid HTTP(S) URL or hostname");
      }

      try {
        const keyword = await prisma.keyword.findFirst({
          where: {
            id: keywordId,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true,
            projectId: true,
            locale: true,
            device: true
          }
        });

        if (!keyword) {
          return sendError(reply, 404, "NOT_FOUND", "Keyword not found");
        }

        const created = await prisma.rankSnapshot.create({
          data: {
            projectId: keyword.projectId,
            keywordId: keyword.id,
            recordedAt,
            engine: request.body.engine ?? SearchEngine.GOOGLE,
            locale: locale ?? keyword.locale,
            device: request.body.device ?? keyword.device,
            rank: request.body.rank ?? null,
            url: normalizedUrl ?? null
          },
          include: {
            project: {
              select: rankSnapshotProjectSelect
            },
            keyword: {
              select: rankSnapshotKeywordSelect
            }
          }
        });

        return reply.status(201).send({ data: toRankSnapshotResponse(created) });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return sendError(
            reply,
            409,
            "RANK_SNAPSHOT_CREATE_CONFLICT",
            "A snapshot already exists for keyword/recordedAt/engine/locale/device"
          );
        }

        app.log.error({ err: error }, "rank snapshot create failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create rank snapshot");
      }
    }
  );

  app.get<{ Querystring: ListRankSnapshotsQuery }>(
    "/v1/rank-snapshots",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            keywordId: { type: "string", minLength: 1, maxLength: 64 },
            from: { type: "string", minLength: 1, maxLength: 64 },
            to: { type: "string", minLength: 1, maxLength: 64 },
            engine: { type: "string", enum: ["GOOGLE", "BING"] },
            locale: { type: "string", minLength: 1, maxLength: 32 },
            device: { type: "string", enum: ["DESKTOP", "MOBILE"] },
            sort: {
              type: "string",
              enum: ["recordedAt_desc", "recordedAt_asc", "createdAt_desc", "createdAt_asc", "rank_asc", "rank_desc"],
              default: "recordedAt_desc"
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
      const sort = request.query.sort ?? "recordedAt_desc";
      const projectId = request.query.projectId?.trim();
      const keywordId = request.query.keywordId?.trim();
      const locale = request.query.locale?.trim();

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      if (request.query.keywordId !== undefined && !keywordId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "keywordId cannot be empty");
      }

      if (request.query.locale !== undefined && !locale) {
        return sendError(reply, 400, "VALIDATION_ERROR", "locale cannot be empty");
      }

      const from = request.query.from !== undefined ? parseDateInput(request.query.from) : undefined;
      if (request.query.from !== undefined && !from) {
        return sendError(reply, 400, "VALIDATION_ERROR", "from must be a valid ISO date-time");
      }

      const to = request.query.to !== undefined ? parseDateInput(request.query.to) : undefined;
      if (request.query.to !== undefined && !to) {
        return sendError(reply, 400, "VALIDATION_ERROR", "to must be a valid ISO date-time");
      }

      if (from && to && from.getTime() > to.getTime()) {
        return sendError(reply, 400, "VALIDATION_ERROR", "from must be <= to");
      }

      const where: Prisma.RankSnapshotWhereInput = {
        project: {
          ownerId: owner.id,
          ...(projectId ? { id: projectId } : {})
        },
        ...(keywordId ? { keywordId } : {}),
        ...(request.query.engine ? { engine: request.query.engine } : {}),
        ...(locale ? { locale } : {}),
        ...(request.query.device ? { device: request.query.device } : {}),
        ...((from || to)
          ? {
              recordedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {})
              }
            }
          : {})
      };

      const orderBy: Prisma.RankSnapshotOrderByWithRelationInput[] =
        sort === "recordedAt_asc"
          ? [{ recordedAt: "asc" }]
          : sort === "createdAt_desc"
            ? [{ createdAt: "desc" }]
            : sort === "createdAt_asc"
              ? [{ createdAt: "asc" }]
              : sort === "rank_asc"
                ? [{ rank: "asc" }, { recordedAt: "desc" }]
                : sort === "rank_desc"
                  ? [{ rank: "desc" }, { recordedAt: "desc" }]
                  : [{ recordedAt: "desc" }];

      try {
        const [total, snapshots] = await prisma.$transaction([
          prisma.rankSnapshot.count({ where }),
          prisma.rankSnapshot.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              project: {
                select: rankSnapshotProjectSelect
              },
              keyword: {
                select: rankSnapshotKeywordSelect
              }
            }
          })
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return reply.send({
          data: snapshots.map(toRankSnapshotResponse),
          meta: {
            page,
            limit,
            total,
            totalPages
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "rank snapshot list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load rank snapshots");
      }
    }
  );

  registerPhase8Routes(app);
  registerPhase9Routes(app);
  registerPhase10Routes(app);
  registerPhase11Routes(app);
}
