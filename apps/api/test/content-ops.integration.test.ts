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

test("page sections CRUD + owner scoping + conflict handling", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-sections-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-sections-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;

  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Sections Project A",
      domain: "sections-a.com"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  const projectAId = projectA.body?.data.id;
  assert.ok(projectAId);

  const pageA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "/content/overview"
    }
  });

  assert.equal(pageA.response.statusCode, 201);
  const pageAId = pageA.body?.data.id;
  assert.ok(pageAId);

  const createSectionA = await requestJson<{
    data: {
      id: string;
      pageId: string;
      order: number;
      kind: string;
      wordCount: number | null;
      content: string;
    };
  }>(app, {
    method: "POST",
    url: "/v1/page-sections",
    headers: authHeader(tokenA!),
    payload: {
      pageId: pageAId,
      kind: "INTRO",
      heading: "What this page covers",
      content: "This intro section explains the scope.",
      order: 1
    }
  });

  assert.equal(createSectionA.response.statusCode, 201);
  assert.equal(createSectionA.body?.data.pageId, pageAId);
  assert.equal(createSectionA.body?.data.kind, "INTRO");
  assert.equal(createSectionA.body?.data.order, 1);
  assert.equal(createSectionA.body?.data.wordCount, 6);

  const sectionId = createSectionA.body?.data.id;
  assert.ok(sectionId);

  const createByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/page-sections",
    headers: authHeader(tokenB!),
    payload: {
      pageId: pageAId,
      content: "nope",
      order: 1
    }
  });

  assert.equal(createByOwnerB.response.statusCode, 404);
  assert.equal(createByOwnerB.body?.error.code, "NOT_FOUND");

  const createSectionA2 = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/page-sections",
    headers: authHeader(tokenA!),
    payload: {
      pageId: pageAId,
      content: "Body details",
      order: 2
    }
  });

  assert.equal(createSectionA2.response.statusCode, 201);
  const section2Id = createSectionA2.body?.data.id;
  assert.ok(section2Id);

  const patchConflict = await requestJson<{ error: { code: string } }>(app, {
    method: "PATCH",
    url: `/v1/page-sections/${section2Id}`,
    headers: authHeader(tokenA!),
    payload: {
      order: 1
    }
  });

  assert.equal(patchConflict.response.statusCode, 409);
  assert.equal(patchConflict.body?.error.code, "PAGE_SECTION_UPDATE_CONFLICT");

  const listA = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: `/v1/page-sections?pageId=${pageAId}&sort=order_asc`,
    headers: authHeader(tokenA!)
  });

  assert.equal(listA.response.statusCode, 200);
  assert.equal(listA.body?.meta.total, 2);
  assert.equal(listA.body?.data[0]?.id, sectionId);

  const listB = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/page-sections",
    headers: authHeader(tokenB!)
  });

  assert.equal(listB.response.statusCode, 200);
  assert.equal(listB.body?.meta.total, 0);

  const patchByOwnerA = await requestJson<{ data: { content: string; wordCount: number | null } }>(app, {
    method: "PATCH",
    url: `/v1/page-sections/${sectionId}`,
    headers: authHeader(tokenA!),
    payload: {
      content: "Updated section body with more words for counting"
    }
  });

  assert.equal(patchByOwnerA.response.statusCode, 200);
  assert.equal(patchByOwnerA.body?.data.content, "Updated section body with more words for counting");
  assert.equal(patchByOwnerA.body?.data.wordCount, 8);

  const deleteByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "DELETE",
    url: `/v1/page-sections/${sectionId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(deleteByOwnerB.response.statusCode, 404);

  const deleteByOwnerA = await app.inject({
    method: "DELETE",
    url: `/v1/page-sections/${sectionId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(deleteByOwnerA.statusCode, 204);
});

test("content briefs CRUD + owner scoping", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-briefs-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-briefs-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;

  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Briefs Project A"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  const projectAId = projectA.body?.data.id;
  assert.ok(projectAId);

  const pageA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "/brief-target-page"
    }
  });

  assert.equal(pageA.response.statusCode, 201);
  const pageAId = pageA.body?.data.id;
  assert.ok(pageAId);

  const keywordA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/keywords",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      pageId: pageAId,
      term: "content brief keyword"
    }
  });

  assert.equal(keywordA.response.statusCode, 201);
  const keywordAId = keywordA.body?.data.id;
  assert.ok(keywordAId);

  const createBriefA = await requestJson<{
    data: {
      id: string;
      projectId: string;
      pageId: string | null;
      keywordId: string | null;
      title: string;
      status: string;
      tasksCount: number;
    };
  }>(app, {
    method: "POST",
    url: "/v1/content-briefs",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      pageId: pageAId,
      keywordId: keywordAId,
      title: "Phase 8 Brief",
      objective: "Ship a usable content brief flow",
      audience: "SEO operators",
      status: "DRAFT",
      outline: {
        intro: "Why this matters",
        sections: ["problem", "workflow", "examples"]
      }
    }
  });

  assert.equal(createBriefA.response.statusCode, 201);
  assert.equal(createBriefA.body?.data.projectId, projectAId);
  assert.equal(createBriefA.body?.data.pageId, pageAId);
  assert.equal(createBriefA.body?.data.keywordId, keywordAId);
  assert.equal(createBriefA.body?.data.tasksCount, 0);

  const briefId = createBriefA.body?.data.id;
  assert.ok(briefId);

  const createByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/content-briefs",
    headers: authHeader(tokenB!),
    payload: {
      projectId: projectAId,
      title: "Should fail"
    }
  });

  assert.equal(createByOwnerB.response.statusCode, 404);
  assert.equal(createByOwnerB.body?.error.code, "NOT_FOUND");

  const listA = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: `/v1/content-briefs?projectId=${projectAId}&status=DRAFT`,
    headers: authHeader(tokenA!)
  });

  assert.equal(listA.response.statusCode, 200);
  assert.equal(listA.body?.meta.total, 1);
  assert.equal(listA.body?.data[0]?.id, briefId);

  const listB = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/content-briefs",
    headers: authHeader(tokenB!)
  });

  assert.equal(listB.response.statusCode, 200);
  assert.equal(listB.body?.meta.total, 0);

  const patchByOwnerA = await requestJson<{ data: { status: string; pageId: string | null } }>(app, {
    method: "PATCH",
    url: `/v1/content-briefs/${briefId}`,
    headers: authHeader(tokenA!),
    payload: {
      status: "READY",
      pageId: null,
      generatedBy: "manual"
    }
  });

  assert.equal(patchByOwnerA.response.statusCode, 200);
  assert.equal(patchByOwnerA.body?.data.status, "READY");
  assert.equal(patchByOwnerA.body?.data.pageId, null);

  const deleteByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "DELETE",
    url: `/v1/content-briefs/${briefId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(deleteByOwnerB.response.statusCode, 404);

  const deleteByOwnerA = await app.inject({
    method: "DELETE",
    url: `/v1/content-briefs/${briefId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(deleteByOwnerA.statusCode, 204);
});

test("content tasks CRUD + transitions + owner scoping", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-tasks-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-tasks-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;
  const ownerAUserId = ownerA.body?.data.user.id;

  assert.ok(tokenA);
  assert.ok(tokenB);
  assert.ok(ownerAUserId);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Tasks Project A"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  const projectAId = projectA.body?.data.id;
  assert.ok(projectAId);

  const pageA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "/tasks-page"
    }
  });

  assert.equal(pageA.response.statusCode, 201);
  const pageAId = pageA.body?.data.id;
  assert.ok(pageAId);

  const briefA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/content-briefs",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      pageId: pageAId,
      title: "Tasks Brief"
    }
  });

  assert.equal(briefA.response.statusCode, 201);
  const briefAId = briefA.body?.data.id;
  assert.ok(briefAId);

  const createTaskA = await requestJson<{
    data: {
      id: string;
      status: string;
      priority: number;
      projectId: string;
      briefId: string | null;
      pageId: string | null;
      startedAt: string | null;
      completedAt: string | null;
    };
  }>(app, {
    method: "POST",
    url: "/v1/content-tasks",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      briefId: briefAId,
      pageId: pageAId,
      type: "WRITE",
      status: "TODO",
      priority: 2,
      payload: {
        draftType: "long-form"
      }
    }
  });

  assert.equal(createTaskA.response.statusCode, 201);
  assert.equal(createTaskA.body?.data.projectId, projectAId);
  assert.equal(createTaskA.body?.data.status, "TODO");
  assert.equal(createTaskA.body?.data.startedAt, null);

  const taskId = createTaskA.body?.data.id;
  assert.ok(taskId);

  const createByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: "/v1/content-tasks",
    headers: authHeader(tokenB!),
    payload: {
      projectId: projectAId,
      type: "WRITE"
    }
  });

  assert.equal(createByOwnerB.response.statusCode, 404);
  assert.equal(createByOwnerB.body?.error.code, "NOT_FOUND");

  const transitionToInProgress = await requestJson<{
    data: {
      status: string;
      startedAt: string | null;
      completedAt: string | null;
    };
  }>(app, {
    method: "POST",
    url: `/v1/content-tasks/${taskId}/transition`,
    headers: authHeader(tokenA!),
    payload: {
      status: "IN_PROGRESS"
    }
  });

  assert.equal(transitionToInProgress.response.statusCode, 200);
  assert.equal(transitionToInProgress.body?.data.status, "IN_PROGRESS");
  assert.ok(transitionToInProgress.body?.data.startedAt);
  assert.equal(transitionToInProgress.body?.data.completedAt, null);

  const transitionToDone = await requestJson<{
    data: {
      status: string;
      startedAt: string | null;
      completedAt: string | null;
    };
  }>(app, {
    method: "POST",
    url: `/v1/content-tasks/${taskId}/transition`,
    headers: authHeader(tokenA!),
    payload: {
      status: "DONE",
      result: {
        output: "draft completed"
      },
      note: "Draft is complete"
    }
  });

  assert.equal(transitionToDone.response.statusCode, 200);
  assert.equal(transitionToDone.body?.data.status, "DONE");
  assert.ok(transitionToDone.body?.data.startedAt);
  assert.ok(transitionToDone.body?.data.completedAt);

  const historyAfterValidTransitions = await requestJson<{
    data: Array<{
      fromStatus: string;
      toStatus: string;
      note: string | null;
      actor: {
        userId: string | null;
        email: string;
        source: string;
      };
      timestamp: string;
    }>;
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      order: string;
    };
  }>(app, {
    method: "GET",
    url: `/v1/content-tasks/${taskId}/history`,
    headers: authHeader(tokenA!)
  });

  assert.equal(historyAfterValidTransitions.response.statusCode, 200);
  assert.equal(historyAfterValidTransitions.body?.meta.total, 2);
  assert.equal(historyAfterValidTransitions.body?.meta.order, "createdAt_asc");
  assert.deepEqual(
    historyAfterValidTransitions.body?.data.map((entry) => `${entry.fromStatus}->${entry.toStatus}`),
    ["TODO->IN_PROGRESS", "IN_PROGRESS->DONE"]
  );
  assert.equal(historyAfterValidTransitions.body?.data[1]?.note, "Draft is complete");
  assert.equal(historyAfterValidTransitions.body?.data[0]?.actor.userId, ownerAUserId);
  assert.equal(historyAfterValidTransitions.body?.data[0]?.actor.source, "jwt");

  const firstTimestamp = Date.parse(historyAfterValidTransitions.body?.data[0]?.timestamp ?? "");
  const secondTimestamp = Date.parse(historyAfterValidTransitions.body?.data[1]?.timestamp ?? "");
  assert.ok(Number.isFinite(firstTimestamp));
  assert.ok(Number.isFinite(secondTimestamp));
  assert.ok(firstTimestamp <= secondTimestamp);

  const pagedHistory = await requestJson<{
    data: Array<{ toStatus: string }>;
    meta: { total: number; page: number; limit: number; totalPages: number };
  }>(app, {
    method: "GET",
    url: `/v1/content-tasks/${taskId}/history?page=2&limit=1`,
    headers: authHeader(tokenA!)
  });

  assert.equal(pagedHistory.response.statusCode, 200);
  assert.equal(pagedHistory.body?.meta.total, 2);
  assert.equal(pagedHistory.body?.meta.page, 2);
  assert.equal(pagedHistory.body?.meta.limit, 1);
  assert.equal(pagedHistory.body?.meta.totalPages, 2);
  assert.equal(pagedHistory.body?.data.length, 1);
  assert.equal(pagedHistory.body?.data[0]?.toStatus, "DONE");

  const invalidTransition = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: `/v1/content-tasks/${taskId}/transition`,
    headers: authHeader(tokenA!),
    payload: {
      status: "BLOCKED"
    }
  });

  assert.equal(invalidTransition.response.statusCode, 409);
  assert.equal(invalidTransition.body?.error.code, "TASK_INVALID_TRANSITION");

  const historyAfterInvalidTransition = await requestJson<{
    data: Array<{ fromStatus: string; toStatus: string }>;
    meta: { total: number };
  }>(app, {
    method: "GET",
    url: `/v1/content-tasks/${taskId}/history`,
    headers: authHeader(tokenA!)
  });

  assert.equal(historyAfterInvalidTransition.response.statusCode, 200);
  assert.equal(historyAfterInvalidTransition.body?.meta.total, 2);
  assert.deepEqual(
    historyAfterInvalidTransition.body?.data.map((entry) => `${entry.fromStatus}->${entry.toStatus}`),
    ["TODO->IN_PROGRESS", "IN_PROGRESS->DONE"]
  );

  const historyByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/content-tasks/${taskId}/history`,
    headers: authHeader(tokenB!)
  });

  assert.equal(historyByOwnerB.response.statusCode, 404);
  assert.equal(historyByOwnerB.body?.error.code, "NOT_FOUND");

  const patchTask = await requestJson<{ data: { priority: number; dueAt: string | null } }>(app, {
    method: "PATCH",
    url: `/v1/content-tasks/${taskId}`,
    headers: authHeader(tokenA!),
    payload: {
      priority: 1,
      dueAt: "2026-02-20T12:00:00.000Z"
    }
  });

  assert.equal(patchTask.response.statusCode, 200);
  assert.equal(patchTask.body?.data.priority, 1);
  assert.equal(patchTask.body?.data.dueAt, "2026-02-20T12:00:00.000Z");

  const listA = await requestJson<{ data: Array<{ id: string; status: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: `/v1/content-tasks?projectId=${projectAId}&status=DONE&sort=priority_asc`,
    headers: authHeader(tokenA!)
  });

  assert.equal(listA.response.statusCode, 200);
  assert.equal(listA.body?.meta.total, 1);
  assert.equal(listA.body?.data[0]?.id, taskId);
  assert.equal(listA.body?.data[0]?.status, "DONE");

  const listB = await requestJson<{ data: Array<{ id: string }>; meta: { total: number } }>(app, {
    method: "GET",
    url: "/v1/content-tasks",
    headers: authHeader(tokenB!)
  });

  assert.equal(listB.response.statusCode, 200);
  assert.equal(listB.body?.meta.total, 0);

  const transitionByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "POST",
    url: `/v1/content-tasks/${taskId}/transition`,
    headers: authHeader(tokenB!),
    payload: {
      status: "TODO"
    }
  });

  assert.equal(transitionByOwnerB.response.statusCode, 404);

  const deleteByOwnerB = await requestJson<{ error: { code: string } }>(app, {
    method: "DELETE",
    url: `/v1/content-tasks/${taskId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(deleteByOwnerB.response.statusCode, 404);

  const deleteByOwnerA = await app.inject({
    method: "DELETE",
    url: `/v1/content-tasks/${taskId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(deleteByOwnerA.statusCode, 204);
});
