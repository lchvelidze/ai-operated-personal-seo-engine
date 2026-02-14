import "fastify";
import type { CurrentUser } from "../lib/request-auth.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: CurrentUser;
  }
}

export {};
