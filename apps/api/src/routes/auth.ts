import { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { comparePassword, hashPassword, signAuthToken } from "../lib/auth.js";
import { requireAuthUser } from "../lib/request-auth.js";

type AuthBody = {
  email: string;
  password: string;
};

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.status(statusCode).send({
    error: {
      code,
      message
    }
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: AuthBody }>(
    "/auth/register",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["email", "password"],
          properties: {
            email: { type: "string", minLength: 5, maxLength: 255 },
            password: { type: "string", minLength: 8, maxLength: 128 }
          }
        }
      }
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      const password = request.body.password;

      if (!isValidEmail(email)) {
        return sendError(reply, 400, "VALIDATION_ERROR", "email must be a valid email address");
      }

      try {
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true }
        });

        if (existing) {
          return sendError(reply, 409, "EMAIL_ALREADY_REGISTERED", "Email is already registered");
        }

        const passwordHash = await hashPassword(password);

        const user = await prisma.user.create({
          data: {
            email,
            passwordHash,
            name: email.split("@")[0]
          },
          select: {
            id: true,
            email: true,
            createdAt: true,
            updatedAt: true
          }
        });

        const token = signAuthToken({
          sub: user.id,
          email: user.email
        });

        return reply.status(201).send({
          data: {
            token,
            user: {
              id: user.id,
              email: user.email,
              createdAt: user.createdAt.toISOString(),
              updatedAt: user.updatedAt.toISOString()
            }
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "register failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to register account");
      }
    }
  );

  app.post<{ Body: AuthBody }>(
    "/auth/login",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["email", "password"],
          properties: {
            email: { type: "string", minLength: 5, maxLength: 255 },
            password: { type: "string", minLength: 8, maxLength: 128 }
          }
        }
      }
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      const password = request.body.password;

      if (!isValidEmail(email)) {
        return sendError(reply, 400, "VALIDATION_ERROR", "email must be a valid email address");
      }

      try {
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            createdAt: true,
            updatedAt: true
          }
        });

        if (!user?.passwordHash) {
          return sendError(reply, 401, "INVALID_CREDENTIALS", "Invalid email or password");
        }

        const ok = await comparePassword(password, user.passwordHash);
        if (!ok) {
          return sendError(reply, 401, "INVALID_CREDENTIALS", "Invalid email or password");
        }

        const token = signAuthToken({
          sub: user.id,
          email: user.email
        });

        return reply.send({
          data: {
            token,
            user: {
              id: user.id,
              email: user.email,
              createdAt: user.createdAt.toISOString(),
              updatedAt: user.updatedAt.toISOString()
            }
          }
        });
      } catch (error) {
        app.log.error({ err: error }, "login failed");
        return sendError(reply, 500, "INTERNAL_ERROR", "Failed to login");
      }
    }
  );

  app.get("/auth/me", async (request, reply) => {
    const user = await requireAuthUser(request, reply, { allowBootstrap: false });
    if (!user) return;

    return {
      data: {
        id: user.id,
        email: user.email,
        authMode: user.authMode
      }
    };
  });
}
