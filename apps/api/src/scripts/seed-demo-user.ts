import { hashPassword } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

const DEFAULT_DEMO_EMAILS = ["owner@local.dev", "levan@local.dev"];
const DEFAULT_DEMO_PASSWORD = "change-me-12345";

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    throw new Error("Demo email values must be non-empty");
  }

  return normalized;
}

function readDemoEmails() {
  const explicitSingle = process.env.DEMO_EMAIL?.trim();
  const explicitList = process.env.DEMO_EMAILS?.trim();

  const values = explicitList
    ? explicitList.split(",")
    : explicitSingle
      ? [explicitSingle]
      : DEFAULT_DEMO_EMAILS;

  const normalized = values.map(normalizeEmail);
  const unique = Array.from(new Set(normalized));

  if (unique.length === 0) {
    throw new Error("At least one demo email is required");
  }

  return unique;
}

function readDemoPassword() {
  return process.env.DEMO_PASSWORD ?? DEFAULT_DEMO_PASSWORD;
}

async function main() {
  const emails = readDemoEmails();
  const password = readDemoPassword();

  if (password.length < 8) {
    throw new Error("DEMO_PASSWORD must be at least 8 characters");
  }

  const passwordHash = await hashPassword(password);

  let created = 0;
  let updated = 0;

  for (const email of emails) {
    const name = email.split("@")[0] || email;

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        name
      },
      create: {
        email,
        passwordHash,
        name
      }
    });

    if (existingUser) {
      updated += 1;
      console.log(`[seed-demo-user] updated: ${email}`);
    } else {
      created += 1;
      console.log(`[seed-demo-user] created: ${email}`);
    }
  }

  console.log(`[seed-demo-user] done: created=${created} updated=${updated}`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[seed-demo-user] failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
