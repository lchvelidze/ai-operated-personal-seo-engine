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

test("keywords CRUD and owner scoping", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-keywords-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-keywords-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;

  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Keyword Project A",
      domain: "keywords-a.com"
    }
  });

  const projectB = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenB!),
    payload: {
      name: "Keyword Project B",
      domain: "keywords-b.com"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  assert.equal(projectB.response.statusCode, 201);

  const projectAId = projectA.body?.data.id;
  const projectBId = projectB.body?.data.id;
  assert.ok(projectAId);
  assert.ok(projectBId);

  const pageA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "/best-seo-tools"
    }
  });

  assert.equal(pageA.response.statusCode, 201);

  const pageAId = pageA.body?.data.id;
  assert.ok(pageAId);

  const createKeywordA = await requestJson<{
    data: {
      id: string;
      projectId: string;
      pageId: string | null;
      term: string;
      locale: string;
      device: string;
      intent: string | null;
      isActive: boolean;
    };
  }>(app, {
    method: "POST",
    url: "/v1/keywords",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      pageId: pageAId,
      term: "best seo tools",
      locale: "en-US",
      device: "DESKTOP",
      intent: "COMMERCIAL",
      isActive: true
    }
  });

  assert.equal(createKeywordA.response.statusCode, 201);
  assert.equal(createKeywordA.body?.data.projectId, projectAId);
  assert.equal(createKeywordA.body?.data.pageId, pageAId);
  assert.equal(createKeywordA.body?.data.term, "best seo tools");

  const keywordId = createKeywordA.body?.data.id;
  assert.ok(keywordId);

  const createKeywordByOwnerBOnProjectA = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/keywords",
    headers: authHeader(tokenB!),
    payload: {
      projectId: projectAId,
      term: "should fail"
    }
  });

  assert.equal(createKeywordByOwnerBOnProjectA.response.statusCode, 404);
  assert.equal(createKeywordByOwnerBOnProjectA.body?.error.code, "NOT_FOUND");

  const listA = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: `/v1/keywords?projectId=${projectAId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(listA.response.statusCode, 200);
  assert.equal(listA.body?.meta.total, 1);
  assert.equal(listA.body?.data[0]?.id, keywordId);

  const listB = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/keywords",
    headers: authHeader(tokenB!)
  });

  assert.equal(listB.response.statusCode, 200);
  assert.equal(listB.body?.meta.total, 0);

  const getByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/keywords/${keywordId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(getByOwnerB.response.statusCode, 404);

  const patchByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "PATCH",
    url: `/v1/keywords/${keywordId}`,
    headers: authHeader(tokenB!),
    payload: {
      term: "nope"
    }
  });

  assert.equal(patchByOwnerB.response.statusCode, 404);

  const patchByOwnerA = await requestJson<{ data: { term: string; isActive: boolean; pageId: string | null } }>(app, {
    method: "PATCH",
    url: `/v1/keywords/${keywordId}`,
    headers: authHeader(tokenA!),
    payload: {
      term: "best seo tools updated",
      isActive: false,
      pageId: null,
      intent: null
    }
  });

  assert.equal(patchByOwnerA.response.statusCode, 200);
  assert.equal(patchByOwnerA.body?.data.term, "best seo tools updated");
  assert.equal(patchByOwnerA.body?.data.isActive, false);
  assert.equal(patchByOwnerA.body?.data.pageId, null);

  const deleteByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "DELETE",
    url: `/v1/keywords/${keywordId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(deleteByOwnerB.response.statusCode, 404);

  const deleteByOwnerA = await app.inject({
    method: "DELETE",
    url: `/v1/keywords/${keywordId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(deleteByOwnerA.statusCode, 204);

  const getAfterDelete = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/keywords/${keywordId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(getAfterDelete.response.statusCode, 404);
});

test("rank snapshots ingest/list and owner scoping", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-snapshots-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-snapshots-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;

  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Snapshot Project A",
      domain: "snapshots-a.com"
    }
  });

  assert.equal(projectA.response.statusCode, 201);

  const projectAId = projectA.body?.data.id;
  assert.ok(projectAId);

  const keywordA = await requestJson<{ data: { id: string; projectId: string } }>(app, {
    method: "POST",
    url: "/v1/keywords",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      term: "rank tracking keyword",
      locale: "en-US",
      device: "DESKTOP"
    }
  });

  assert.equal(keywordA.response.statusCode, 201);

  const keywordAId = keywordA.body?.data.id;
  assert.ok(keywordAId);

  const recordedAt = "2026-02-11T12:00:00.000Z";

  const createSnapshotA = await requestJson<{
    data: {
      id: string;
      keywordId: string;
      projectId: string;
      recordedAt: string;
      rank: number | null;
      engine: string;
      locale: string;
      device: string;
    };
  }>(app, {
    method: "POST",
    url: "/v1/rank-snapshots",
    headers: authHeader(tokenA!),
    payload: {
      keywordId: keywordAId,
      recordedAt,
      engine: "GOOGLE",
      locale: "en-US",
      device: "DESKTOP",
      rank: 5,
      url: "https://snapshots-a.com/rank-tracking"
    }
  });

  assert.equal(createSnapshotA.response.statusCode, 201);
  assert.equal(createSnapshotA.body?.data.keywordId, keywordAId);
  assert.equal(createSnapshotA.body?.data.projectId, projectAId);
  assert.equal(createSnapshotA.body?.data.rank, 5);

  const duplicateSnapshot = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/rank-snapshots",
    headers: authHeader(tokenA!),
    payload: {
      keywordId: keywordAId,
      recordedAt,
      engine: "GOOGLE",
      locale: "en-US",
      device: "DESKTOP",
      rank: 6
    }
  });

  assert.equal(duplicateSnapshot.response.statusCode, 409);
  assert.equal(duplicateSnapshot.body?.error.code, "RANK_SNAPSHOT_CREATE_CONFLICT");

  const createSnapshotByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/rank-snapshots",
    headers: authHeader(tokenB!),
    payload: {
      keywordId: keywordAId,
      rank: 10
    }
  });

  assert.equal(createSnapshotByOwnerB.response.statusCode, 404);
  assert.equal(createSnapshotByOwnerB.body?.error.code, "NOT_FOUND");

  const listA = await requestJson<{ data: Array<{ keywordId: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: `/v1/rank-snapshots?keywordId=${keywordAId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(listA.response.statusCode, 200);
  assert.equal(listA.body?.meta.total, 1);
  assert.equal(listA.body?.data[0]?.keywordId, keywordAId);

  const listB = await requestJson<{ data: Array<{ keywordId: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/rank-snapshots",
    headers: authHeader(tokenB!)
  });

  assert.equal(listB.response.statusCode, 200);
  assert.equal(listB.body?.meta.total, 0);

  const invalidRange = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: "/v1/rank-snapshots?from=2026-02-12T00:00:00.000Z&to=2026-02-11T00:00:00.000Z",
    headers: authHeader(tokenA!)
  });

  assert.equal(invalidRange.response.statusCode, 400);
  assert.equal(invalidRange.body?.error.code, "VALIDATION_ERROR");
});
