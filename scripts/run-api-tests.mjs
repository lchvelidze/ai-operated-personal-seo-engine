import { spawnSync } from "node:child_process";

const DEFAULT_TEST_DATABASE_URL =
  "postgresql://seo_user:seo_dev_password@localhost:5432/seo_engine?schema=integration_tests";

function assertSafeTestDatabaseUrl(rawUrl) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[test:api] Invalid TEST_DATABASE_URL: ${rawUrl}`);
  }

  const schema = parsed.searchParams.get("schema") ?? "public";
  const databaseName = parsed.pathname.replace(/^\//, "");
  const pointsToTestTarget = /test/i.test(schema) || /test/i.test(databaseName);

  if (!pointsToTestTarget) {
    throw new Error(
      `[test:api] Refusing to run tests against non-test target (${databaseName}, schema=${schema}). ` +
        "Set TEST_DATABASE_URL to a dedicated test DB or schema."
    );
  }
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertSafeTestDatabaseUrl(testDatabaseUrl);

const env = {
  ...process.env,
  TEST_DATABASE_URL: testDatabaseUrl,
  DATABASE_URL: testDatabaseUrl
};

console.log(`[test:api] TEST_DATABASE_URL=${testDatabaseUrl}`);

run("corepack", ["pnpm", "prisma:generate"], env);
run("corepack", ["pnpm", "--filter", "@seo-engine/db", "prisma:migrate:deploy"], env);
run("corepack", ["pnpm", "--filter", "@seo-engine/api", "test"], env);
