import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { v1Routes } from "./routes/v1.js";
import { authRoutes } from "./routes/auth.js";
import { prisma } from "./lib/prisma.js";
import { createAutomationScheduler } from "./lib/automation-scheduler.js";

function isLoopbackOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol) && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      if (process.env.NODE_ENV !== "production" && isLoopbackOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"), false);
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if ((error as { validation?: unknown }).validation) {
      reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload"
        }
      });
      return;
    }

    app.log.error({ err: error }, "unhandled error");
    reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error"
      }
    });
  });

  const automationScheduler = createAutomationScheduler(app.log);

  app.addHook("onReady", async () => {
    automationScheduler.start();
  });

  app.addHook("onClose", async () => {
    await automationScheduler.stop();
    await prisma.$disconnect();
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(v1Routes);

  return app;
}
