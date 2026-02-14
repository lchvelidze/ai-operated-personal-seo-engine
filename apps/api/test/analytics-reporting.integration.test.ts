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

test("phase 10 analytics: KPI summary + funnels + owner scoping + date filters", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-analytics-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-analytics-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;

  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Analytics Project A"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  const projectAId = projectA.body?.data.id;
  assert.ok(projectAId);

  const sourcePage = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "/source"
    }
  });

  assert.equal(sourcePage.response.statusCode, 201);
  const sourcePageId = sourcePage.body?.data.id;
  assert.ok(sourcePageId);

  const targetPage = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "/target"
    }
  });

  assert.equal(targetPage.response.statusCode, 201);
  const targetPageId = targetPage.body?.data.id;
  assert.ok(targetPageId);

  const keyword = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/keywords",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      pageId: sourcePageId,
      term: "phase 10 analytics",
      locale: "en-US",
      device: "DESKTOP"
    }
  });

  assert.equal(keyword.response.statusCode, 201);
  const keywordId = keyword.body?.data.id;
  assert.ok(keywordId);

  const snapshotA1 = await requestJson(app, {
    method: "POST",
    url: "/v1/rank-snapshots",
    headers: authHeader(tokenA!),
    payload: {
      keywordId,
      recordedAt: "2026-02-10T10:00:00.000Z",
      rank: 4,
      engine: "GOOGLE",
      locale: "en-US",
      device: "DESKTOP"
    }
  });

  assert.equal(snapshotA1.response.statusCode, 201);

  const snapshotA2 = await requestJson(app, {
    method: "POST",
    url: "/v1/rank-snapshots",
    headers: authHeader(tokenA!),
    payload: {
      keywordId,
      recordedAt: "2026-02-11T10:00:00.000Z",
      rank: 18,
      engine: "GOOGLE",
      locale: "en-US",
      device: "DESKTOP"
    }
  });

  assert.equal(snapshotA2.response.statusCode, 201);

  const taskTodo = await requestJson(app, {
    method: "POST",
    url: "/v1/content-tasks",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      type: "WRITE",
      status: "TODO"
    }
  });

  assert.equal(taskTodo.response.statusCode, 201);

  const taskDone = await requestJson(app, {
    method: "POST",
    url: "/v1/content-tasks",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      type: "OPTIMIZE",
      status: "DONE"
    }
  });

  assert.equal(taskDone.response.statusCode, 201);

  const linkSuggested = await requestJson(app, {
    method: "POST",
    url: "/v1/internal-links",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourcePageId,
      targetPageId,
      anchorText: "suggested anchor",
      status: "SUGGESTED"
    }
  });

  assert.equal(linkSuggested.response.statusCode, 201);

  const linkApplied = await requestJson(app, {
    method: "POST",
    url: "/v1/internal-links",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourcePageId,
      targetPageId,
      anchorText: "applied anchor",
      status: "APPLIED"
    }
  });

  assert.equal(linkApplied.response.statusCode, 201);

  const backlinkWon = await requestJson(app, {
    method: "POST",
    url: "/v1/backlink-opportunities",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourceDomain: "partner-a-won.example.com",
      targetUrl: "https://acme.com/analytics",
      status: "WON"
    }
  });

  assert.equal(backlinkWon.response.statusCode, 201);

  const backlinkNew = await requestJson(app, {
    method: "POST",
    url: "/v1/backlink-opportunities",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourceDomain: "partner-a-new.example.com",
      targetUrl: "https://acme.com/analytics",
      status: "NEW"
    }
  });

  assert.equal(backlinkNew.response.statusCode, 201);

  const projectB = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenB!),
    payload: {
      name: "Analytics Project B"
    }
  });

  assert.equal(projectB.response.statusCode, 201);
  const projectBId = projectB.body?.data.id;
  assert.ok(projectBId);

  const ownerBTask = await requestJson(app, {
    method: "POST",
    url: "/v1/content-tasks",
    headers: authHeader(tokenB!),
    payload: {
      projectId: projectBId,
      type: "WRITE",
      status: "DONE"
    }
  });

  assert.equal(ownerBTask.response.statusCode, 201);

  const kpis = await requestJson<{
    data: {
      inventory: {
        projects: number;
        pages: number;
        keywords: number;
        activeKeywords: number;
        contentTasks: number;
        internalLinks: number;
        backlinkOpportunities: number;
      };
      activity: {
        rankSnapshots: number;
        averageRank: number | null;
        top10Rate: number | null;
        contentTasksCreated: number;
        contentTasksCompleted: number;
        contentTaskCompletionRate: number | null;
        backlinksCreated: number;
        backlinksWon: number;
        backlinkWinRate: number | null;
      };
    };
  }>(app, {
    method: "GET",
    url: `/v1/analytics/kpis?projectId=${projectAId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(kpis.response.statusCode, 200);
  assert.equal(kpis.body?.data.inventory.projects, 1);
  assert.equal(kpis.body?.data.inventory.pages, 2);
  assert.equal(kpis.body?.data.inventory.keywords, 1);
  assert.equal(kpis.body?.data.inventory.activeKeywords, 1);
  assert.equal(kpis.body?.data.inventory.contentTasks, 2);
  assert.equal(kpis.body?.data.inventory.internalLinks, 2);
  assert.equal(kpis.body?.data.inventory.backlinkOpportunities, 2);
  assert.equal(kpis.body?.data.activity.rankSnapshots, 2);
  assert.equal(kpis.body?.data.activity.averageRank, 11);
  assert.equal(kpis.body?.data.activity.top10Rate, 50);
  assert.equal(kpis.body?.data.activity.contentTasksCreated, 2);
  assert.equal(kpis.body?.data.activity.contentTasksCompleted, 1);
  assert.equal(kpis.body?.data.activity.contentTaskCompletionRate, 50);
  assert.equal(kpis.body?.data.activity.backlinksCreated, 2);
  assert.equal(kpis.body?.data.activity.backlinksWon, 1);
  assert.equal(kpis.body?.data.activity.backlinkWinRate, 50);

  const funnels = await requestJson<{
    data: {
      contentTasks: {
        total: number;
        stages: Array<{ stage: string; count: number }>;
      };
      backlinkOutreach: {
        total: number;
        stages: Array<{ stage: string; count: number }>;
      };
      internalLinkStatus: {
        total: number;
        stages: Array<{ stage: string; count: number }>;
      };
    };
  }>(app, {
    method: "GET",
    url: `/v1/analytics/funnels?projectId=${projectAId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(funnels.response.statusCode, 200);
  assert.equal(funnels.body?.data.contentTasks.total, 2);
  assert.equal(funnels.body?.data.contentTasks.stages.find((stage) => stage.stage === "TODO")?.count, 1);
  assert.equal(funnels.body?.data.contentTasks.stages.find((stage) => stage.stage === "DONE")?.count, 1);
  assert.equal(funnels.body?.data.backlinkOutreach.total, 2);
  assert.equal(funnels.body?.data.backlinkOutreach.stages.find((stage) => stage.stage === "NEW")?.count, 1);
  assert.equal(funnels.body?.data.backlinkOutreach.stages.find((stage) => stage.stage === "WON")?.count, 1);
  assert.equal(funnels.body?.data.internalLinkStatus.total, 2);
  assert.equal(funnels.body?.data.internalLinkStatus.stages.find((stage) => stage.stage === "SUGGESTED")?.count, 1);
  assert.equal(funnels.body?.data.internalLinkStatus.stages.find((stage) => stage.stage === "APPLIED")?.count, 1);

  const futureScopedFunnels = await requestJson<{
    data: {
      contentTasks: { total: number };
      backlinkOutreach: { total: number };
      internalLinkStatus: { total: number };
    };
  }>(app, {
    method: "GET",
    url: `/v1/analytics/funnels?projectId=${projectAId}&from=2100-01-01T00:00:00.000Z`,
    headers: authHeader(tokenA!)
  });

  assert.equal(futureScopedFunnels.response.statusCode, 200);
  assert.equal(futureScopedFunnels.body?.data.contentTasks.total, 0);
  assert.equal(futureScopedFunnels.body?.data.backlinkOutreach.total, 0);
  assert.equal(futureScopedFunnels.body?.data.internalLinkStatus.total, 0);

  const projectScopeDenied = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/analytics/kpis?projectId=${projectAId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(projectScopeDenied.response.statusCode, 404);
  assert.equal(projectScopeDenied.body?.error.code, "NOT_FOUND");
});

test("phase 10 analytics export: JSON + CSV + scoping + filter validation", async () => {
  const password = "change-me-12345";

  const ownerA = await registerUser(app, "owner-export-a@local.dev", password);
  const ownerB = await registerUser(app, "owner-export-b@local.dev", password);

  const tokenA = ownerA.body?.data.token;
  const tokenB = ownerB.body?.data.token;

  assert.ok(tokenA);
  assert.ok(tokenB);

  const projectA = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenA!),
    payload: {
      name: "Export Project A"
    }
  });

  assert.equal(projectA.response.statusCode, 201);
  const projectAId = projectA.body?.data.id;
  assert.ok(projectAId);

  const pageA1 = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "/a-1"
    }
  });

  assert.equal(pageA1.response.statusCode, 201);
  const pageA1Id = pageA1.body?.data.id;
  assert.ok(pageA1Id);

  const pageA2 = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/pages",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      path: "/a-2"
    }
  });

  assert.equal(pageA2.response.statusCode, 201);
  const pageA2Id = pageA2.body?.data.id;
  assert.ok(pageA2Id);

  const contentTaskDone = await requestJson(app, {
    method: "POST",
    url: "/v1/content-tasks",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      type: "WRITE",
      status: "DONE"
    }
  });

  assert.equal(contentTaskDone.response.statusCode, 201);

  const contentTaskTodo = await requestJson(app, {
    method: "POST",
    url: "/v1/content-tasks",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      type: "REFRESH",
      status: "TODO"
    }
  });

  assert.equal(contentTaskTodo.response.statusCode, 201);

  const internalLink = await requestJson(app, {
    method: "POST",
    url: "/v1/internal-links",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourcePageId: pageA1Id,
      targetPageId: pageA2Id,
      anchorText: "phase 10 export",
      status: "APPLIED"
    }
  });

  assert.equal(internalLink.response.statusCode, 201);

  const backlinkA = await requestJson(app, {
    method: "POST",
    url: "/v1/backlink-opportunities",
    headers: authHeader(tokenA!),
    payload: {
      projectId: projectAId,
      sourceDomain: "owner-a-won.example.com",
      targetUrl: "https://acme.com/export",
      status: "WON"
    }
  });

  assert.equal(backlinkA.response.statusCode, 201);

  const projectB = await requestJson<{ data: { id: string } }>(app, {
    method: "POST",
    url: "/v1/projects",
    headers: authHeader(tokenB!),
    payload: {
      name: "Export Project B"
    }
  });

  assert.equal(projectB.response.statusCode, 201);
  const projectBId = projectB.body?.data.id;
  assert.ok(projectBId);

  const backlinkB = await requestJson(app, {
    method: "POST",
    url: "/v1/backlink-opportunities",
    headers: authHeader(tokenB!),
    payload: {
      projectId: projectBId,
      sourceDomain: "owner-b-hidden.example.com",
      targetUrl: "https://other.com/export",
      status: "WON"
    }
  });

  assert.equal(backlinkB.response.statusCode, 201);

  const exportTasksJson = await requestJson<{
    data: {
      dataset: string;
      records: Array<{ id: string; status: string }>;
      meta: { total: number };
    };
  }>(app, {
    method: "GET",
    url: `/v1/analytics/export?dataset=contentTasks&format=json&projectId=${projectAId}&contentTaskStatus=DONE&page=1&limit=10`,
    headers: authHeader(tokenA!)
  });

  assert.equal(exportTasksJson.response.statusCode, 200);
  assert.equal(exportTasksJson.body?.data.dataset, "contentTasks");
  assert.equal(exportTasksJson.body?.data.meta.total, 1);
  assert.equal(exportTasksJson.body?.data.records.length, 1);
  assert.equal(exportTasksJson.body?.data.records[0]?.status, "DONE");

  const exportBacklinksCsv = await app.inject({
    method: "GET",
    url: `/v1/analytics/export?dataset=backlinkOpportunities&format=csv&projectId=${projectAId}`,
    headers: authHeader(tokenA!)
  });

  assert.equal(exportBacklinksCsv.statusCode, 200);
  assert.match(exportBacklinksCsv.headers["content-type"] ?? "", /text\/csv/i);
  assert.match(exportBacklinksCsv.body, /sourceDomain/);
  assert.match(exportBacklinksCsv.body, /owner-a-won\.example\.com/);
  assert.doesNotMatch(exportBacklinksCsv.body, /owner-b-hidden\.example\.com/);

  const ownerScopeDenied = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: `/v1/analytics/export?dataset=kpis&projectId=${projectAId}`,
    headers: authHeader(tokenB!)
  });

  assert.equal(ownerScopeDenied.response.statusCode, 404);
  assert.equal(ownerScopeDenied.body?.error.code, "NOT_FOUND");

  const invalidFilter = await requestJson<{ error: { code: string } }>(app, {
    method: "GET",
    url: "/v1/analytics/export?dataset=internalLinks&contentTaskStatus=DONE",
    headers: authHeader(tokenA!)
  });

  assert.equal(invalidFilter.response.statusCode, 400);
  assert.equal(invalidFilter.body?.error.code, "VALIDATION_ERROR");
});
