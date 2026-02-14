import { LinkStatus, OutreachStatus, Prisma } from "@prisma/client";
import { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuthUser } from "../lib/request-auth.js";

type InternalLinkParams = {
  id: string;
};

type CreateInternalLinkBody = {
  projectId: string;
  sourcePageId: string;
  targetPageId: string;
  anchorText: string;
  status?: LinkStatus;
  reason?: string;
};

type UpdateInternalLinkBody = {
  sourcePageId?: string;
  targetPageId?: string;
  anchorText?: string;
  status?: LinkStatus;
  reason?: string | null;
};

type ListInternalLinksQuery = {
  page?: number;
  limit?: number;
  projectId?: string;
  sourcePageId?: string;
  targetPageId?: string;
  status?: LinkStatus;
  q?: string;
  sort?: "createdAt_desc" | "createdAt_asc" | "updatedAt_desc" | "updatedAt_asc" | "anchorText_asc" | "anchorText_desc";
};

type BacklinkOpportunityParams = {
  id: string;
};

type CreateBacklinkOpportunityBody = {
  projectId: string;
  sourceDomain: string;
  targetUrl: string;
  contactEmail?: string;
  authorityScore?: number | null;
  status?: OutreachStatus;
  notes?: string;
  nextActionAt?: string;
  lastContactedAt?: string;
};

type UpdateBacklinkOpportunityBody = {
  sourceDomain?: string;
  targetUrl?: string;
  contactEmail?: string | null;
  authorityScore?: number | null;
  status?: OutreachStatus;
  notes?: string | null;
  nextActionAt?: string | null;
  lastContactedAt?: string | null;
};

type ListBacklinkOpportunitiesQuery = {
  page?: number;
  limit?: number;
  projectId?: string;
  sourceDomain?: string;
  status?: OutreachStatus;
  minAuthorityScore?: number;
  maxAuthorityScore?: number;
  hasContactEmail?: boolean;
  q?: string;
  sort?:
    | "createdAt_desc"
    | "createdAt_asc"
    | "updatedAt_desc"
    | "updatedAt_asc"
    | "authorityScore_desc"
    | "authorityScore_asc"
    | "nextActionAt_asc"
    | "nextActionAt_desc";
};

const internalLinkProjectSelect = {
  id: true,
  name: true,
  slug: true
} as const;

const internalLinkPageSelect = {
  id: true,
  path: true,
  url: true
} as const;

type InternalLinkWithRelations = Prisma.InternalLinkGetPayload<{
  include: {
    project: {
      select: typeof internalLinkProjectSelect;
    };
    sourcePage: {
      select: typeof internalLinkPageSelect;
    };
    targetPage: {
      select: typeof internalLinkPageSelect;
    };
  };
}>;

const backlinkOpportunityProjectSelect = {
  id: true,
  name: true,
  slug: true
} as const;

type BacklinkOpportunityWithRelations = Prisma.BacklinkOpportunityGetPayload<{
  include: {
    project: {
      select: typeof backlinkOpportunityProjectSelect;
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

function parseDateInput(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function normalizeDomain(domain: string): string | null {
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toInternalLinkResponse(link: InternalLinkWithRelations) {
  return {
    id: link.id,
    projectId: link.projectId,
    sourcePageId: link.sourcePageId,
    targetPageId: link.targetPageId,
    project: {
      id: link.project.id,
      name: link.project.name,
      slug: link.project.slug
    },
    sourcePage: {
      id: link.sourcePage.id,
      path: link.sourcePage.path,
      url: link.sourcePage.url
    },
    targetPage: {
      id: link.targetPage.id,
      path: link.targetPage.path,
      url: link.targetPage.url
    },
    anchorText: link.anchorText,
    status: link.status,
    reason: link.reason,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString()
  };
}

function toBacklinkOpportunityResponse(opportunity: BacklinkOpportunityWithRelations) {
  return {
    id: opportunity.id,
    projectId: opportunity.projectId,
    project: {
      id: opportunity.project.id,
      name: opportunity.project.name,
      slug: opportunity.project.slug
    },
    sourceDomain: opportunity.sourceDomain,
    targetUrl: opportunity.targetUrl,
    contactEmail: opportunity.contactEmail,
    authorityScore: opportunity.authorityScore,
    status: opportunity.status,
    notes: opportunity.notes,
    nextActionAt: opportunity.nextActionAt?.toISOString() ?? null,
    lastContactedAt: opportunity.lastContactedAt?.toISOString() ?? null,
    createdAt: opportunity.createdAt.toISOString(),
    updatedAt: opportunity.updatedAt.toISOString()
  };
}

export function registerPhase9Routes(app: FastifyInstance) {
  app.post<{ Body: CreateInternalLinkBody }>(
    "/v1/internal-links",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "sourcePageId", "targetPageId", "anchorText"],
          properties: {
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            sourcePageId: { type: "string", minLength: 1, maxLength: 64 },
            targetPageId: { type: "string", minLength: 1, maxLength: 64 },
            anchorText: { type: "string", minLength: 1, maxLength: 255 },
            status: { type: "string", enum: ["SUGGESTED", "APPLIED", "IGNORED"] },
            reason: { type: "string", minLength: 1, maxLength: 2000 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const projectId = request.body.projectId.trim();
      const sourcePageId = request.body.sourcePageId.trim();
      const targetPageId = request.body.targetPageId.trim();
      const anchorText = request.body.anchorText.trim();
      const reason = request.body.reason?.trim();

      if (!projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId is required");
      }

      if (!sourcePageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "sourcePageId is required");
      }

      if (!targetPageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "targetPageId is required");
      }

      if (!anchorText) {
        return sendError(reply, 400, "VALIDATION_ERROR", "anchorText is required");
      }

      if (request.body.reason !== undefined && !reason) {
        return sendError(reply, 400, "VALIDATION_ERROR", "reason cannot be empty");
      }

      if (sourcePageId === targetPageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "sourcePageId and targetPageId must be different");
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

        const pages = await prisma.page.findMany({
          where: {
            projectId: project.id,
            id: {
              in: [sourcePageId, targetPageId]
            }
          },
          select: {
            id: true
          }
        });

        const hasSourcePage = pages.some((page) => page.id === sourcePageId);
        const hasTargetPage = pages.some((page) => page.id === targetPageId);

        if (!hasSourcePage) {
          return sendError(reply, 404, "NOT_FOUND", "Source page not found for this project");
        }

        if (!hasTargetPage) {
          return sendError(reply, 404, "NOT_FOUND", "Target page not found for this project");
        }

        const created = await prisma.internalLink.create({
          data: {
            projectId: project.id,
            sourcePageId,
            targetPageId,
            anchorText,
            status: request.body.status ?? LinkStatus.SUGGESTED,
            reason
          },
          include: {
            project: {
              select: internalLinkProjectSelect
            },
            sourcePage: {
              select: internalLinkPageSelect
            },
            targetPage: {
              select: internalLinkPageSelect
            }
          }
        });

        return reply.status(201).send({ data: toInternalLinkResponse(created) });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return sendError(
            reply,
            409,
            "INTERNAL_LINK_CREATE_CONFLICT",
            "An internal link with this source/target/anchorText already exists"
          );
        }

        app.log.error({ err: error }, "internal link create failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create internal link");
      }
    }
  );

  app.get<{ Querystring: ListInternalLinksQuery }>(
    "/v1/internal-links",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            sourcePageId: { type: "string", minLength: 1, maxLength: 64 },
            targetPageId: { type: "string", minLength: 1, maxLength: 64 },
            status: { type: "string", enum: ["SUGGESTED", "APPLIED", "IGNORED"] },
            q: { type: "string", minLength: 1, maxLength: 255 },
            sort: {
              type: "string",
              enum: ["createdAt_desc", "createdAt_asc", "updatedAt_desc", "updatedAt_asc", "anchorText_asc", "anchorText_desc"],
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
      const sourcePageId = request.query.sourcePageId?.trim();
      const targetPageId = request.query.targetPageId?.trim();
      const q = request.query.q?.trim();

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      if (request.query.sourcePageId !== undefined && !sourcePageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "sourcePageId cannot be empty");
      }

      if (request.query.targetPageId !== undefined && !targetPageId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "targetPageId cannot be empty");
      }

      const where: Prisma.InternalLinkWhereInput = {
        project: {
          ownerId: owner.id,
          ...(projectId ? { id: projectId } : {})
        },
        ...(sourcePageId ? { sourcePageId } : {}),
        ...(targetPageId ? { targetPageId } : {}),
        ...(request.query.status ? { status: request.query.status } : {}),
        ...(q
          ? {
              OR: [
                {
                  anchorText: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  reason: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  sourcePage: {
                    path: {
                      contains: q,
                      mode: Prisma.QueryMode.insensitive
                    }
                  }
                },
                {
                  targetPage: {
                    path: {
                      contains: q,
                      mode: Prisma.QueryMode.insensitive
                    }
                  }
                }
              ]
            }
          : {})
      };

      const orderBy: Prisma.InternalLinkOrderByWithRelationInput[] =
        sort === "createdAt_asc"
          ? [{ createdAt: "asc" }]
          : sort === "updatedAt_desc"
            ? [{ updatedAt: "desc" }]
            : sort === "updatedAt_asc"
              ? [{ updatedAt: "asc" }]
              : sort === "anchorText_asc"
                ? [{ anchorText: "asc" }, { createdAt: "desc" }]
                : sort === "anchorText_desc"
                  ? [{ anchorText: "desc" }, { createdAt: "desc" }]
                  : [{ createdAt: "desc" }];

      try {
        const [total, links] = await prisma.$transaction([
          prisma.internalLink.count({ where }),
          prisma.internalLink.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              project: {
                select: internalLinkProjectSelect
              },
              sourcePage: {
                select: internalLinkPageSelect
              },
              targetPage: {
                select: internalLinkPageSelect
              }
            }
          })
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return reply.send({
          data: links.map(toInternalLinkResponse),
          meta: {
            page,
            limit,
            total,
            totalPages
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "internal links list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load internal links");
      }
    }
  );

  app.get<{ Params: InternalLinkParams }>(
    "/v1/internal-links/:id",
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
        const link = await prisma.internalLink.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: internalLinkProjectSelect
            },
            sourcePage: {
              select: internalLinkPageSelect
            },
            targetPage: {
              select: internalLinkPageSelect
            }
          }
        });

        if (!link) {
          return sendError(reply, 404, "NOT_FOUND", "Internal link not found");
        }

        return reply.send({ data: toInternalLinkResponse(link) });
      } catch (error) {
        app.log.error({ err: error }, "internal link get failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load internal link");
      }
    }
  );

  app.patch<{ Params: InternalLinkParams; Body: UpdateInternalLinkBody }>(
    "/v1/internal-links/:id",
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
            sourcePageId: { type: "string", minLength: 1, maxLength: 64 },
            targetPageId: { type: "string", minLength: 1, maxLength: 64 },
            anchorText: { type: "string", minLength: 1, maxLength: 255 },
            status: { type: "string", enum: ["SUGGESTED", "APPLIED", "IGNORED"] },
            reason: { type: ["string", "null"], minLength: 1, maxLength: 2000 }
          },
          anyOf: [
            { required: ["sourcePageId"] },
            { required: ["targetPageId"] },
            { required: ["anchorText"] },
            { required: ["status"] },
            { required: ["reason"] }
          ]
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const data: Prisma.InternalLinkUpdateInput = {};
      let nextSourcePageId: string | undefined;
      let nextTargetPageId: string | undefined;

      if (request.body.sourcePageId !== undefined) {
        const sourcePageId = request.body.sourcePageId.trim();
        if (!sourcePageId) {
          return sendError(reply, 400, "VALIDATION_ERROR", "sourcePageId cannot be empty");
        }
        nextSourcePageId = sourcePageId;
      }

      if (request.body.targetPageId !== undefined) {
        const targetPageId = request.body.targetPageId.trim();
        if (!targetPageId) {
          return sendError(reply, 400, "VALIDATION_ERROR", "targetPageId cannot be empty");
        }
        nextTargetPageId = targetPageId;
      }

      if (request.body.anchorText !== undefined) {
        const anchorText = request.body.anchorText.trim();
        if (!anchorText) {
          return sendError(reply, 400, "VALIDATION_ERROR", "anchorText cannot be empty");
        }
        data.anchorText = anchorText;
      }

      if (request.body.status !== undefined) {
        data.status = request.body.status;
      }

      if (request.body.reason !== undefined) {
        if (request.body.reason === null) {
          data.reason = null;
        } else {
          const reason = request.body.reason.trim();
          if (!reason) {
            return sendError(reply, 400, "VALIDATION_ERROR", "reason cannot be empty");
          }
          data.reason = reason;
        }
      }

      try {
        const existing = await prisma.internalLink.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          select: {
            id: true,
            projectId: true,
            sourcePageId: true,
            targetPageId: true
          }
        });

        if (!existing) {
          return sendError(reply, 404, "NOT_FOUND", "Internal link not found");
        }

        const resolvedSourcePageId = nextSourcePageId ?? existing.sourcePageId;
        const resolvedTargetPageId = nextTargetPageId ?? existing.targetPageId;

        if (resolvedSourcePageId === resolvedTargetPageId) {
          return sendError(reply, 400, "VALIDATION_ERROR", "sourcePageId and targetPageId must be different");
        }

        if (nextSourcePageId || nextTargetPageId) {
          const pages = await prisma.page.findMany({
            where: {
              projectId: existing.projectId,
              id: {
                in: [resolvedSourcePageId, resolvedTargetPageId]
              }
            },
            select: {
              id: true
            }
          });

          const hasSourcePage = pages.some((page) => page.id === resolvedSourcePageId);
          const hasTargetPage = pages.some((page) => page.id === resolvedTargetPageId);

          if (!hasSourcePage) {
            return sendError(reply, 404, "NOT_FOUND", "Source page not found for this internal link's project");
          }

          if (!hasTargetPage) {
            return sendError(reply, 404, "NOT_FOUND", "Target page not found for this internal link's project");
          }
        }

        if (nextSourcePageId) {
          data.sourcePage = {
            connect: {
              id: nextSourcePageId
            }
          };
        }

        if (nextTargetPageId) {
          data.targetPage = {
            connect: {
              id: nextTargetPageId
            }
          };
        }

        const updated = await prisma.internalLink.update({
          where: {
            id: request.params.id
          },
          data,
          include: {
            project: {
              select: internalLinkProjectSelect
            },
            sourcePage: {
              select: internalLinkPageSelect
            },
            targetPage: {
              select: internalLinkPageSelect
            }
          }
        });

        return reply.send({ data: toInternalLinkResponse(updated) });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return sendError(
            reply,
            409,
            "INTERNAL_LINK_UPDATE_CONFLICT",
            "An internal link with this source/target/anchorText already exists"
          );
        }

        app.log.error({ err: error }, "internal link patch failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to update internal link");
      }
    }
  );

  app.delete<{ Params: InternalLinkParams }>(
    "/v1/internal-links/:id",
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
        const existing = await prisma.internalLink.findFirst({
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
          return sendError(reply, 404, "NOT_FOUND", "Internal link not found");
        }

        await prisma.internalLink.delete({
          where: {
            id: request.params.id
          }
        });

        return reply.status(204).send();
      } catch (error) {
        app.log.error({ err: error }, "internal link delete failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to delete internal link");
      }
    }
  );

  app.post<{ Body: CreateBacklinkOpportunityBody }>(
    "/v1/backlink-opportunities",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["projectId", "sourceDomain", "targetUrl"],
          properties: {
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            sourceDomain: { type: "string", minLength: 1, maxLength: 255 },
            targetUrl: { type: "string", minLength: 1, maxLength: 2048 },
            contactEmail: { type: "string", minLength: 1, maxLength: 320 },
            authorityScore: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            status: { type: "string", enum: ["NEW", "CONTACTED", "RESPONDED", "WON", "LOST"] },
            notes: { type: "string", minLength: 1, maxLength: 5000 },
            nextActionAt: { type: "string", minLength: 1, maxLength: 64 },
            lastContactedAt: { type: "string", minLength: 1, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const projectId = request.body.projectId.trim();
      const sourceDomain = normalizeDomain(request.body.sourceDomain);
      const targetUrl = normalizeUrl(request.body.targetUrl);
      const contactEmail = request.body.contactEmail?.trim();
      const notes = request.body.notes?.trim();
      const nextActionAt = request.body.nextActionAt !== undefined ? parseDateInput(request.body.nextActionAt) : undefined;
      const lastContactedAt =
        request.body.lastContactedAt !== undefined ? parseDateInput(request.body.lastContactedAt) : undefined;

      if (!projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId is required");
      }

      if (!sourceDomain) {
        return sendError(reply, 400, "VALIDATION_ERROR", "sourceDomain must be a valid hostname or URL");
      }

      if (!targetUrl) {
        return sendError(reply, 400, "VALIDATION_ERROR", "targetUrl must be a valid HTTP(S) URL or hostname");
      }

      if (request.body.contactEmail !== undefined) {
        if (!contactEmail) {
          return sendError(reply, 400, "VALIDATION_ERROR", "contactEmail cannot be empty");
        }

        if (!isValidEmail(contactEmail)) {
          return sendError(reply, 400, "VALIDATION_ERROR", "contactEmail must be a valid email address");
        }
      }

      if (request.body.notes !== undefined && !notes) {
        return sendError(reply, 400, "VALIDATION_ERROR", "notes cannot be empty");
      }

      if (request.body.nextActionAt !== undefined && !nextActionAt) {
        return sendError(reply, 400, "VALIDATION_ERROR", "nextActionAt must be a valid ISO date-time");
      }

      if (request.body.lastContactedAt !== undefined && !lastContactedAt) {
        return sendError(reply, 400, "VALIDATION_ERROR", "lastContactedAt must be a valid ISO date-time");
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

        const created = await prisma.backlinkOpportunity.create({
          data: {
            projectId: project.id,
            sourceDomain,
            targetUrl,
            contactEmail: contactEmail ?? null,
            authorityScore: request.body.authorityScore ?? null,
            status: request.body.status ?? OutreachStatus.NEW,
            notes: notes ?? null,
            nextActionAt: nextActionAt ?? null,
            lastContactedAt: lastContactedAt ?? null
          },
          include: {
            project: {
              select: backlinkOpportunityProjectSelect
            }
          }
        });

        return reply.status(201).send({ data: toBacklinkOpportunityResponse(created) });
      } catch (error) {
        app.log.error({ err: error }, "backlink opportunity create failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create backlink opportunity");
      }
    }
  );

  app.get<{ Querystring: ListBacklinkOpportunitiesQuery }>(
    "/v1/backlink-opportunities",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            projectId: { type: "string", minLength: 1, maxLength: 64 },
            sourceDomain: { type: "string", minLength: 1, maxLength: 255 },
            status: { type: "string", enum: ["NEW", "CONTACTED", "RESPONDED", "WON", "LOST"] },
            minAuthorityScore: { type: "integer", minimum: 0, maximum: 100 },
            maxAuthorityScore: { type: "integer", minimum: 0, maximum: 100 },
            hasContactEmail: { type: "boolean" },
            q: { type: "string", minLength: 1, maxLength: 255 },
            sort: {
              type: "string",
              enum: [
                "createdAt_desc",
                "createdAt_asc",
                "updatedAt_desc",
                "updatedAt_asc",
                "authorityScore_desc",
                "authorityScore_asc",
                "nextActionAt_asc",
                "nextActionAt_desc"
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
      const sourceDomainFilter = request.query.sourceDomain?.trim();
      const normalizedSourceDomainFilter = sourceDomainFilter ? normalizeDomain(sourceDomainFilter) : undefined;
      const q = request.query.q?.trim();

      if (request.query.projectId !== undefined && !projectId) {
        return sendError(reply, 400, "VALIDATION_ERROR", "projectId cannot be empty");
      }

      if (request.query.sourceDomain !== undefined && !sourceDomainFilter) {
        return sendError(reply, 400, "VALIDATION_ERROR", "sourceDomain cannot be empty");
      }

      if (sourceDomainFilter && !normalizedSourceDomainFilter) {
        return sendError(reply, 400, "VALIDATION_ERROR", "sourceDomain must be a valid hostname or URL");
      }

      if (
        request.query.minAuthorityScore !== undefined &&
        request.query.maxAuthorityScore !== undefined &&
        request.query.minAuthorityScore > request.query.maxAuthorityScore
      ) {
        return sendError(reply, 400, "VALIDATION_ERROR", "minAuthorityScore must be <= maxAuthorityScore");
      }

      const where: Prisma.BacklinkOpportunityWhereInput = {
        project: {
          ownerId: owner.id,
          ...(projectId ? { id: projectId } : {})
        },
        ...(normalizedSourceDomainFilter ? { sourceDomain: normalizedSourceDomainFilter } : {}),
        ...(request.query.status ? { status: request.query.status } : {}),
        ...((request.query.minAuthorityScore !== undefined || request.query.maxAuthorityScore !== undefined)
          ? {
              authorityScore: {
                ...(request.query.minAuthorityScore !== undefined ? { gte: request.query.minAuthorityScore } : {}),
                ...(request.query.maxAuthorityScore !== undefined ? { lte: request.query.maxAuthorityScore } : {})
              }
            }
          : {}),
        ...(request.query.hasContactEmail === true ? { contactEmail: { not: null } } : {}),
        ...(request.query.hasContactEmail === false ? { contactEmail: null } : {}),
        ...(q
          ? {
              OR: [
                {
                  sourceDomain: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  targetUrl: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  contactEmail: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                },
                {
                  notes: {
                    contains: q,
                    mode: Prisma.QueryMode.insensitive
                  }
                }
              ]
            }
          : {})
      };

      const orderBy: Prisma.BacklinkOpportunityOrderByWithRelationInput[] =
        sort === "createdAt_asc"
          ? [{ createdAt: "asc" }]
          : sort === "updatedAt_desc"
            ? [{ updatedAt: "desc" }]
            : sort === "updatedAt_asc"
              ? [{ updatedAt: "asc" }]
              : sort === "authorityScore_desc"
                ? [{ authorityScore: "desc" }, { createdAt: "desc" }]
                : sort === "authorityScore_asc"
                  ? [{ authorityScore: "asc" }, { createdAt: "desc" }]
                  : sort === "nextActionAt_asc"
                    ? [{ nextActionAt: "asc" }, { createdAt: "desc" }]
                    : sort === "nextActionAt_desc"
                      ? [{ nextActionAt: "desc" }, { createdAt: "desc" }]
                      : [{ createdAt: "desc" }];

      try {
        const [total, opportunities] = await prisma.$transaction([
          prisma.backlinkOpportunity.count({ where }),
          prisma.backlinkOpportunity.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              project: {
                select: backlinkOpportunityProjectSelect
              }
            }
          })
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return reply.send({
          data: opportunities.map(toBacklinkOpportunityResponse),
          meta: {
            page,
            limit,
            total,
            totalPages
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "backlink opportunities list failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load backlink opportunities");
      }
    }
  );

  app.get<{ Params: BacklinkOpportunityParams }>(
    "/v1/backlink-opportunities/:id",
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
        const opportunity = await prisma.backlinkOpportunity.findFirst({
          where: {
            id: request.params.id,
            project: {
              ownerId: owner.id
            }
          },
          include: {
            project: {
              select: backlinkOpportunityProjectSelect
            }
          }
        });

        if (!opportunity) {
          return sendError(reply, 404, "NOT_FOUND", "Backlink opportunity not found");
        }

        return reply.send({ data: toBacklinkOpportunityResponse(opportunity) });
      } catch (error) {
        app.log.error({ err: error }, "backlink opportunity get failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to load backlink opportunity");
      }
    }
  );

  app.patch<{ Params: BacklinkOpportunityParams; Body: UpdateBacklinkOpportunityBody }>(
    "/v1/backlink-opportunities/:id",
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
            sourceDomain: { type: "string", minLength: 1, maxLength: 255 },
            targetUrl: { type: "string", minLength: 1, maxLength: 2048 },
            contactEmail: { type: ["string", "null"], minLength: 1, maxLength: 320 },
            authorityScore: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            status: { type: "string", enum: ["NEW", "CONTACTED", "RESPONDED", "WON", "LOST"] },
            notes: { type: ["string", "null"], minLength: 1, maxLength: 5000 },
            nextActionAt: { type: ["string", "null"], minLength: 1, maxLength: 64 },
            lastContactedAt: { type: ["string", "null"], minLength: 1, maxLength: 64 }
          },
          anyOf: [
            { required: ["sourceDomain"] },
            { required: ["targetUrl"] },
            { required: ["contactEmail"] },
            { required: ["authorityScore"] },
            { required: ["status"] },
            { required: ["notes"] },
            { required: ["nextActionAt"] },
            { required: ["lastContactedAt"] }
          ]
        }
      }
    },
    async (request, reply) => {
      const owner = await requireAuthUser(request, reply);
      if (!owner) return;

      const data: Prisma.BacklinkOpportunityUpdateInput = {};

      if (request.body.sourceDomain !== undefined) {
        const sourceDomain = normalizeDomain(request.body.sourceDomain);
        if (!sourceDomain) {
          return sendError(reply, 400, "VALIDATION_ERROR", "sourceDomain must be a valid hostname or URL");
        }
        data.sourceDomain = sourceDomain;
      }

      if (request.body.targetUrl !== undefined) {
        const targetUrl = normalizeUrl(request.body.targetUrl);
        if (!targetUrl) {
          return sendError(reply, 400, "VALIDATION_ERROR", "targetUrl must be a valid HTTP(S) URL or hostname");
        }
        data.targetUrl = targetUrl;
      }

      if (request.body.contactEmail !== undefined) {
        if (request.body.contactEmail === null) {
          data.contactEmail = null;
        } else {
          const contactEmail = request.body.contactEmail.trim();
          if (!contactEmail) {
            return sendError(reply, 400, "VALIDATION_ERROR", "contactEmail cannot be empty");
          }

          if (!isValidEmail(contactEmail)) {
            return sendError(reply, 400, "VALIDATION_ERROR", "contactEmail must be a valid email address");
          }

          data.contactEmail = contactEmail;
        }
      }

      if (request.body.authorityScore !== undefined) {
        data.authorityScore = request.body.authorityScore;
      }

      if (request.body.status !== undefined) {
        data.status = request.body.status;
      }

      if (request.body.notes !== undefined) {
        if (request.body.notes === null) {
          data.notes = null;
        } else {
          const notes = request.body.notes.trim();
          if (!notes) {
            return sendError(reply, 400, "VALIDATION_ERROR", "notes cannot be empty");
          }
          data.notes = notes;
        }
      }

      if (request.body.nextActionAt !== undefined) {
        if (request.body.nextActionAt === null) {
          data.nextActionAt = null;
        } else {
          const nextActionAt = parseDateInput(request.body.nextActionAt);
          if (!nextActionAt) {
            return sendError(reply, 400, "VALIDATION_ERROR", "nextActionAt must be a valid ISO date-time");
          }
          data.nextActionAt = nextActionAt;
        }
      }

      if (request.body.lastContactedAt !== undefined) {
        if (request.body.lastContactedAt === null) {
          data.lastContactedAt = null;
        } else {
          const lastContactedAt = parseDateInput(request.body.lastContactedAt);
          if (!lastContactedAt) {
            return sendError(reply, 400, "VALIDATION_ERROR", "lastContactedAt must be a valid ISO date-time");
          }
          data.lastContactedAt = lastContactedAt;
        }
      }

      try {
        const existing = await prisma.backlinkOpportunity.findFirst({
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
          return sendError(reply, 404, "NOT_FOUND", "Backlink opportunity not found");
        }

        const updated = await prisma.backlinkOpportunity.update({
          where: {
            id: request.params.id
          },
          data,
          include: {
            project: {
              select: backlinkOpportunityProjectSelect
            }
          }
        });

        return reply.send({ data: toBacklinkOpportunityResponse(updated) });
      } catch (error) {
        app.log.error({ err: error }, "backlink opportunity patch failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to update backlink opportunity");
      }
    }
  );

  app.delete<{ Params: BacklinkOpportunityParams }>(
    "/v1/backlink-opportunities/:id",
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
        const existing = await prisma.backlinkOpportunity.findFirst({
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
          return sendError(reply, 404, "NOT_FOUND", "Backlink opportunity not found");
        }

        await prisma.backlinkOpportunity.delete({
          where: {
            id: request.params.id
          }
        });

        return reply.status(204).send();
      } catch (error) {
        app.log.error({ err: error }, "backlink opportunity delete failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to delete backlink opportunity");
      }
    }
  );
}
