import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { authHeader, createTestApp, registerUser, requestJson, resetDatabase } from "./helpers.js";

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

test("projects require auth", async () => {
  const create = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    payload: {
      name: "No Auth Project"
    }
  });

  assert.equal(create.response.statusCode, 401);
  assert.equal(create.body?.error.code, "UNAUTHORIZED");
});

test("projects CRUD and owner scoping", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;

  assert.ok(tokenA);
  assert.ok(tokenB);

  const create = await requestJson<{
    data: {
      id: string;
      ownerId: string;
      name: string;
      slug: string;
      domain: string | null;
      status: string;
    };
  }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Acme Blog",
      domain: "https://Acme.COM"
    }
  });

  assert.equal(create.response.statusCode, 201);
  assert.equal(create.body?.data.ownerId, ownerA.body?.data.user.id);
  assert.equal(create.body?.data.name, "Acme Blog");
  assert.equal(create.body?.data.slug, "acme-blog");
  assert.equal(create.body?.data.domain, "acme.com");

  const projectId = create.body?.data.id;
  assert.ok(projectId);

  const listA = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/projects",
    headers: authHeader(tokenA!)
  });

  assert.equal(listA.response.statusCode, 200);
  assert.equal(listA.body?.meta.total, 1);
  assert.equal(listA.body?.data[0]?.id, projectId);

  const getByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/projects/${projectId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(getByOwnerB.response.statusCode, 404);
  assert.equal(getByOwnerB.body?.error.code, "NOT_FOUND");

  const patchByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "PATCH",
    url: `/v1/projects/${projectId}`,
    headers: authHeader(tokenB!),
    payload: {
      name: "Hacked Name"
    }
  });

  assert.equal(patchByOwnerB.response.statusCode, 404);

  const patchByOwnerA = await requestJson<{ data: { name: string; status: string } }>(app, {
    method: "PATCH",
    url: `/v1/projects/${projectId}`,
    headers: authHeader(tokenA!),
    payload: {
      name: "Acme Blog Updated",
      status: "PAUSED"
    }
  });

  assert.equal(patchByOwnerA.response.statusCode, 200);
  assert.equal(patchByOwnerA.body?.data.name, "Acme Blog Updated");
  assert.equal(patchByOwnerA.body?.data.status, "PAUSED");

  const deleteByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "DELETE",
    url: `/v1/projects/${projectId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(deleteByOwnerB.response.statusCode, 404);

  const deleteByOwnerA = await app.inject({
    method: "DELETE",
    url: `/v1/projects/${projectId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(deleteByOwnerA.statusCode, 204);

  const getAfterDelete = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/projects/${projectId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(getAfterDelete.response.statusCode, 404);

  const listB = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/projects",
    headers: authHeader(tokenB!)
  });

  assert.equal(listB.response.statusCode, 200);
  assert.equal(listB.body?.meta.total, 0);
  assert.equal(listB.body?.data.length, 0);
});
