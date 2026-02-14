import type { FastifyInstance, InjectOptions } from "fastify";

const DEFAULT_TEST_DATABASE_URL =
  "postgresql://seo_user:seo_dev_password@localhost:5432/seo_engine?schema=integration_tests";

process.env.NODE_ENV ??= "test";
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.TOKEN_TTL ??= "7d";
process.env.BCRYPT_ROUNDS ??= "8";
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

assertSafeTestDatabaseUrl(process.env.DATABASE_URL);

function assertSafeTestDatabaseUrl(rawUrl: string | undefined) {
  if (!rawUrl) {
    throw new Error("[test] DATABASE_URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[test] Invalid DATABASE_URL: ${rawUrl}`);
  }

  const schema = parsed.searchParams.get("schema") ?? "public";
  const databaseName = parsed.pathname.replace(/^\//, "");
  const pointsToTestTarget = /test/i.test(schema) || /test/i.test(databaseName);

  if (!pointsToTestTarget) {
    throw new Error(
      `[test] Refusing to run integration tests against non-test target (${databaseName}, schema=${schema}). ` +
        "Set TEST_DATABASE_URL (or DATABASE_URL) to an isolated test DB/schema."
    );
  }
}

export async function createTestApp() {
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();
  await app.ready();
  return app;
}

export async function resetDatabase() {
  const { prisma } = await import("../src/lib/prisma.js");

  await prisma.$transaction([
    prisma.automationDlqEvent.deleteMany(),
    prisma.automationAlertEvent.deleteMany(),
    prisma.automationSchedulerTickEvent.deleteMany(),
    prisma.schedulerLock.deleteMany(),
    prisma.user.deleteMany()
  ]);
}

export async function requestJson<T = unknown>(app: FastifyInstance, options: InjectOptions) {
  const response = await app.inject(options);
  const body = response.body ? (JSON.parse(response.body) as T) : null;

  return {
    response,
    body
  };
}

export async function registerUser(app: FastifyInstance, email: string, password: string) {
  const { response, body } = await requestJson<{
    data: {
      token: string;
      user: {
        id: string;
        email: string;
      };
    };
  }>(app, {
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password
    }
  });

  return { response, body };
}

export async function loginUser(app: FastifyInstance, email: string, password: string) {
  const { response, body } = await requestJson<{
    data: {
      token: string;
      user: {
        id: string;
        email: string;
      };
    };
  }>(app, {
    method: "POST",
    url: "/auth/login",
    payload: {
      email,
      password
    }
  });

  return { response, body };
}

export function authHeader(token: string) {
  return {
    authorization: `Bearer ${token}`
  };
}
