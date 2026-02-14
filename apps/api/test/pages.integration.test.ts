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

test("pages CRUD and owner scoping", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-pages-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-pages-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;

  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Project A",
      domain: "project-a.com"
    }
  });

  const projectB = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenB!),
    payload: {
      name: "Project B",
      domain: "project-b.com"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  assert.equal(projectB.response.statusCode, 201);

  const projectAId = projectA.body?.data.id;
  const projectBId = projectB.body?.data.id;
  assert.ok(projectAId);
  assert.ok(projectBId);

  const createPageA = await requestJson<{
    data: {
      id: string;
      projectId: string;
      path: string;
      url: string;
      status: string;
    };
  }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "about",
      title: "About",
      status: "DRAFT"
    }
  });

  assert.equal(createPageA.response.statusCode, 201);
  assert.equal(createPageA.body?.data.projectId, projectAId);
  assert.equal(createPageA.body?.data.path, "/about");
  assert.equal(createPageA.body?.data.url, "https://project-a.com/about");

  const pageId = createPageA.body?.data.id;
  assert.ok(pageId);

  const createPageByOwnerBOnProjectA = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenB!),
    payload: {
      projectId: projectAId,
      path: "/should-not-work"
    }
  });

  assert.equal(createPageByOwnerBOnProjectA.response.statusCode, 404);
  assert.equal(createPageByOwnerBOnProjectA.body?.error.code, "NOT_FOUND");

  const listA = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/pages",
    headers: authHeader(tokenA!)
  });

  assert.equal(listA.response.statusCode, 200);
  assert.equal(listA.body?.meta.total, 1);
  assert.equal(listA.body?.data[0]?.id, pageId);

  const listB = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/pages",
    headers: authHeader(tokenB!)
  });

  assert.equal(listB.response.statusCode, 200);
  assert.equal(listB.body?.meta.total, 0);

  const getByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/pages/${pageId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(getByOwnerB.response.statusCode, 404);

  const patchByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "PATCH",
    url: `/v1/pages/${pageId}`,
    headers: authHeader(tokenB!),
    payload: {
      title: "Nope"
    }
  });

  assert.equal(patchByOwnerB.response.statusCode, 404);

  const patchByOwnerA = await requestJson<{ data: { path: string; status: string; url: string } }>(app, {
    method: "PATCH",
    url: `/v1/pages/${pageId}`,
    headers: authHeader(tokenA!),
    payload: {
      path: "/about-us/",
      status: "REVIEW"
    }
  });

  assert.equal(patchByOwnerA.response.statusCode, 200);
  assert.equal(patchByOwnerA.body?.data.path, "/about-us");
  assert.equal(patchByOwnerA.body?.data.status, "REVIEW");
  assert.equal(patchByOwnerA.body?.data.url, "https://project-a.com/about-us");

  const deleteByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "DELETE",
    url: `/v1/pages/${pageId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(deleteByOwnerB.response.statusCode, 404);

  const deleteByOwnerA = await app.inject({
    method: "DELETE",
    url: `/v1/pages/${pageId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(deleteByOwnerA.statusCode, 204);

  const getAfterDelete = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/pages/${pageId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(getAfterDelete.response.statusCode, 404);
});
