import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";
import { verifyAuthToken } from "./auth.js";

export type CurrentUser = {
  id: string;
  email: string;
  authMode: "jwt" | "bootstrap";
};

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  if (typeof value === "string") {
    return value.trim() || null;
  }

  return null;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.status(statusCode).send({
    error: {
      code,
      message
    }
  });
}

async function resolveBootstrapUser(request: FastifyRequest): Promise<CurrentUser | null> {
  const configuredApiKey = process.env.API_KEY?.trim();
  if (!configuredApiKey) {
    return null;
  }

  const requestApiKey = getHeaderValue(request.headers["x-api-key"]);
  if (!requestApiKey || requestApiKey !== configuredApiKey) {
    return null;
  }

  const ownerEmail = getHeaderValue(request.headers["x-owner-email"]);
  if (!ownerEmail || !isValidEmail(ownerEmail)) {
    return null;
  }

  const normalizedEmail = ownerEmail.toLowerCase();
  const owner = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {},
    create: {
      email: normalizedEmail,
      name: normalizedEmail.split("@")[0]
    },
    select: { id: true, email: true }
  });

  return {
    id: owner.id,
    email: owner.email,
    authMode: "bootstrap"
  };
}

export async function requireAuthUser(
  request: FastifyRequest,
  reply: FastifyReply,
  options?: { allowBootstrap?: boolean }
) {
  const authHeader = getHeaderValue(request.headers.authorization);
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    const payload = verifyAuthToken(token);
    if (!payload) {
      sendError(reply, 401, "UNAUTHORIZED", "Invalid or expired bearer token");
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true }
    });

    if (!user) {
      sendError(reply, 401, "UNAUTHORIZED", "User account not found");
      return null;
    }

    const currentUser: CurrentUser = {
      id: user.id,
      email: user.email,
      authMode: "jwt"
    };

    request.currentUser = currentUser;
    return currentUser;
  }

  if (options?.allowBootstrap ?? true) {
    const bootstrapUser = await resolveBootstrapUser(request);
    if (bootstrapUser) {
      request.currentUser = bootstrapUser;
      return bootstrapUser;
    }
  }

  sendError(
    reply,
    401,
    "UNAUTHORIZED",
    options?.allowBootstrap === false
      ? "Authentication required (Bearer token)"
      : "Authentication required (Bearer token; bootstrap x-api-key + x-owner-email also supported)"
  );
  return null;
}
