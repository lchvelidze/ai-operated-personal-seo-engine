import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { createTestApp, loginUser, registerUser, requestJson, resetDatabase } from "./helpers.js";

let app: FastifyInstance;

before(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await app.close();
});

test("auth register + login happy path", async () => {
  const email = "Owner+Auth@Local.dev ";
  const password = "change-me-12345";

  const register = await registerUser(app, email, password);
  assert.equal(register.response.statusCode, 201);
  assert.equal(typeof register.body?.data.token, "string");
  assert.ok(register.body?.data.token.length > 20);
  assert.equal(register.body?.data.user.email, "owner+auth@local.dev");

  const login = await loginUser(app, " owner+auth@local.dev", password);
  assert.equal(login.response.statusCode, 200);
  assert.equal(login.body?.data.user.id, register.body?.data.user.id);
  assert.equal(login.body?.data.user.email, "owner+auth@local.dev");
  assert.equal(typeof login.body?.data.token, "string");
  assert.ok(login.body?.data.token.length > 20);

  const me = await requestJson<{ data: { id: string; email: string; authMode: string } }>(app, {
    method: "GET",
    url: "/auth/me",
    headers: {
      authorization: `Bearer ${login.body?.data.token}`
    }
  });

  assert.equal(me.response.statusCode, 200);
  assert.equal(me.body?.data.id, register.body?.data.user.id);
  assert.equal(me.body?.data.email, "owner+auth@local.dev");
  assert.equal(me.body?.data.authMode, "jwt");
});
