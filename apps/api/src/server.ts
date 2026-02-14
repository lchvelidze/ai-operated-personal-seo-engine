import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

const start = async () => {
  try {
    const app = await buildApp();

    if (!process.env.JWT_SECRET?.trim()) {
      app.log.warn("JWT_SECRET is not set; auth endpoints will fail until configured");
    }

    await app.listen({ port, host });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

start();
