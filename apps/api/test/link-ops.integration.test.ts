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

test("internal links CRUD + owner scoping + relationship integrity", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-internal-links-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-internal-links-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;

  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Internal Links Project"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  const projectAId = projectA.body?.data.id;
  assert.ok(projectAId);

  const projectASecond = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Internal Links Project 2"
    }
  });

  assert.equal(projectASecond.response.statusCode, 201);
  const projectASecondId = projectASecond.body?.data.id;
  assert.ok(projectASecondId);

  const pageA1 = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "/source-page"
    }
  });

  assert.equal(pageA1.response.statusCode, 201);
  const sourcePageId = pageA1.body?.data.id;
  assert.ok(sourcePageId);

  const pageA2 = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "/target-page"
    }
  });

  assert.equal(pageA2.response.statusCode, 201);
  const targetPageId = pageA2.body?.data.id;
  assert.ok(targetPageId);

  const pageAOtherProject = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectASecondId,
      path: "/other-project-page"
    }
  });

  assert.equal(pageAOtherProject.response.statusCode, 201);
  const otherProjectPageId = pageAOtherProject.body?.data.id;
  assert.ok(otherProjectPageId);

  const createLink = await requestJson<{
    data: {
      id: string;
      projectId: string;
      sourcePageId: string;
      targetPageId: string;
      anchorText: string;
      status: string;
      reason: string | null;
    };
  }>(app, {
    method: "POST",
    url: "/v1/internal-links",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourcePageId,
      targetPageId,
      anchorText: "best practices",
      status: "SUGGESTED",
      reason: "Relevant context"
    }
  });

  assert.equal(createLink.response.statusCode, 201);
  assert.equal(createLink.body?.data.projectId, projectAId);
  assert.equal(createLink.body?.data.status, "SUGGESTED");
  assert.equal(createLink.body?.data.reason, "Relevant context");

  const linkId = createLink.body?.data.id;
  assert.ok(linkId);

  const duplicateCreate = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/internal-links",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourcePageId,
      targetPageId,
      anchorText: "best practices"
    }
  });

  assert.equal(duplicateCreate.response.statusCode, 409);
  assert.equal(duplicateCreate.body?.error.code, "INTERNAL_LINK_CREATE_CONFLICT");

  const createWithSamePages = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/internal-links",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourcePageId,
      targetPageId: sourcePageId,
      anchorText: "invalid"
    }
  });

  assert.equal(createWithSamePages.response.statusCode, 400);
  assert.equal(createWithSamePages.body?.error.code, "VALIDATION_ERROR");

  const createWithForeignProject = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/internal-links",
    headers: authHeader(tokenB!),
    payload: {
      projectId: projectAId,
      sourcePageId,
      targetPageId,
      anchorText: "forbidden"
    }
  });

  assert.equal(createWithForeignProject.response.statusCode, 404);
  assert.equal(createWithForeignProject.body?.error.code, "NOT_FOUND");

  const listForOwnerA = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: `/v1/internal-links?projectId=${projectAId}&status=SUGGESTED`,
    headers: authHeader(tokenA!)
  });

  assert.equal(listForOwnerA.response.statusCode, 200);
  assert.equal(listForOwnerA.body?.meta.total, 1);
  assert.equal(listForOwnerA.body?.data[0]?.id, linkId);

  const listForOwnerB = await requestJson<{ meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/internal-links",
    headers: authHeader(tokenB!)
  });

  assert.equal(listForOwnerB.response.statusCode, 200);
  assert.equal(listForOwnerB.body?.meta.total, 0);

  const patchWithWrongProjectPage = await requestJson<{ error: { code: string } }>(app, {
    method: "PATCH",
    url: `/v1/internal-links/${linkId}`,
    headers: authHeader(tokenA!),
    payload: {
      targetPageId: otherProjectPageId
    }
  });

  assert.equal(patchWithWrongProjectPage.response.statusCode, 404);
  assert.equal(patchWithWrongProjectPage.body?.error.code, "NOT_FOUND");

  const patchByOwnerA = await requestJson<{
    data: {
      status: string;
      reason: string | null;
      anchorText: string;
    };
  }>(app, {
    method: "PATCH",
    url: `/v1/internal-links/${linkId}`,
    headers: authHeader(tokenA!),
    payload: {
      status: "APPLIED",
      reason: null,
      anchorText: "advanced best practices"
    }
  });

  assert.equal(patchByOwnerA.response.statusCode, 200);
  assert.equal(patchByOwnerA.body?.data.status, "APPLIED");
  assert.equal(patchByOwnerA.body?.data.reason, null);
  assert.equal(patchByOwnerA.body?.data.anchorText, "advanced best practices");

  const getByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/internal-links/${linkId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(getByOwnerB.response.statusCode, 404);
  assert.equal(getByOwnerB.body?.error.code, "NOT_FOUND");

  const deleteByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "DELETE",
    url: `/v1/internal-links/${linkId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(deleteByOwnerB.response.statusCode, 404);
  assert.equal(deleteByOwnerB.body?.error.code, "NOT_FOUND");

  const deleteByOwnerA = await app.inject({
    method: "DELETE",
    url: `/v1/internal-links/${linkId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(deleteByOwnerA.statusCode, 204);
});

test("backlink opportunities CRUD + owner scoping + validation", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-backlinks-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-backlinks-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;

  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Backlink Project"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  const projectAId = projectA.body?.data.id;
  assert.ok(projectAId);

  const createOpportunity = await requestJson<{
    data: {
      id: string;
      sourceDomain: string;
      targetUrl: string;
      contactEmail: string | null;
      authorityScore: number | null;
      status: string;
      nextActionAt: string | null;
      lastContactedAt: string | null;
    };
  }>(app, {
    method: "POST",
    url: "/v1/backlink-opportunities",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourceDomain: "HTTPS://News.Example.com/articles",
      targetUrl: "acme.com/blog/link-ops",
      contactEmail: "editor@example.com",
      authorityScore: 76,
      status: "NEW",
      notes: "Strong topical alignment",
      nextActionAt: "2026-03-01T10:00:00.000Z"
    }
  });

  assert.equal(createOpportunity.response.statusCode, 201);
  assert.equal(createOpportunity.body?.data.sourceDomain, "news.example.com");
  assert.equal(createOpportunity.body?.data.targetUrl, "https://acme.com/blog/link-ops");
  assert.equal(createOpportunity.body?.data.contactEmail, "editor@example.com");
  assert.equal(createOpportunity.body?.data.authorityScore, 76);

  const opportunityId = createOpportunity.body?.data.id;
  assert.ok(opportunityId);

  const createInvalidEmail = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/backlink-opportunities",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourceDomain: "partner.example.com",
      targetUrl: "https://acme.com/outreach",
      contactEmail: "not-an-email"
    }
  });

  assert.equal(createInvalidEmail.response.statusCode, 400);
  assert.equal(createInvalidEmail.body?.error.code, "VALIDATION_ERROR");

  const createByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/backlink-opportunities",
    headers: authHeader(tokenB!),
    payload: {
      projectId: projectAId,
      sourceDomain: "partner.example.com",
      targetUrl: "https://acme.com/outreach"
    }
  });

  assert.equal(createByOwnerB.response.statusCode, 404);
  assert.equal(createByOwnerB.body?.error.code, "NOT_FOUND");

  const listForOwnerA = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: `/v1/backlink-opportunities?projectId=${projectAId}&status=NEW&hasContactEmail=true`,
    headers: authHeader(tokenA!)
  });

  assert.equal(listForOwnerA.response.statusCode, 200);
  assert.equal(listForOwnerA.body?.meta.total, 1);
  assert.equal(listForOwnerA.body?.data[0]?.id, opportunityId);

  const listForOwnerB = await requestJson<{ meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/backlink-opportunities",
    headers: authHeader(tokenB!)
  });

  assert.equal(listForOwnerB.response.statusCode, 200);
  assert.equal(listForOwnerB.body?.meta.total, 0);

  const patchInvalidDate = await requestJson<{ error: { code: string } }>(app, {
    method: "PATCH",
    url: `/v1/backlink-opportunities/${opportunityId}`,
    headers: authHeader(tokenA!),
    payload: {
      nextActionAt: "invalid"
    }
  });

  assert.equal(patchInvalidDate.response.statusCode, 400);
  assert.equal(patchInvalidDate.body?.error.code, "VALIDATION_ERROR");

  const patchByOwnerA = await requestJson<{
    data: {
      status: string;
      authorityScore: number | null;
      contactEmail: string | null;
      lastContactedAt: string | null;
    };
  }>(app, {
    method: "PATCH",
    url: `/v1/backlink-opportunities/${opportunityId}`,
    headers: authHeader(tokenA!),
    payload: {
      status: "CONTACTED",
      authorityScore: 80,
      contactEmail: null,
      lastContactedAt: "2026-02-15T15:00:00.000Z"
    }
  });

  assert.equal(patchByOwnerA.response.statusCode, 200);
  assert.equal(patchByOwnerA.body?.data.status, "CONTACTED");
  assert.equal(patchByOwnerA.body?.data.authorityScore, 80);
  assert.equal(patchByOwnerA.body?.data.contactEmail, null);
  assert.equal(patchByOwnerA.body?.data.lastContactedAt, "2026-02-15T15:00:00.000Z");

  const getByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/backlink-opportunities/${opportunityId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(getByOwnerB.response.statusCode, 404);
  assert.equal(getByOwnerB.body?.error.code, "NOT_FOUND");

  const deleteByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "DELETE",
    url: `/v1/backlink-opportunities/${opportunityId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(deleteByOwnerB.response.statusCode, 404);
  assert.equal(deleteByOwnerB.body?.error.code, "NOT_FOUND");

  const deleteByOwnerA = await app.inject({
    method: "DELETE",
    url: `/v1/backlink-opportunities/${opportunityId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(deleteByOwnerA.statusCode, 204);
});
