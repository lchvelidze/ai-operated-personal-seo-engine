"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type SectionKind = "HERO" | "INTRO" | "BODY" | "FAQ" | "CTA" | "CUSTOM";
type BriefStatus = "DRAFT" | "READY" | "APPROVED" | "ARCHIVED";
type TaskType = "WRITE" | "OPTIMIZE" | "REFRESH" | "INTERNAL_LINKS" | "OUTREACH";
type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "FAILED";

type ProjectOption = {
  id: string;
  name: string;
  slug: string;
};

type PageOption = {
  id: string;
  projectId: string;
  path: string;
  url: string;
};

type KeywordOption = {
  id: string;
  projectId: string;
  term: string;
  locale: string;
  device: string;
};

type ListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ApiError = {
  code: string;
  message: string;
};

type PageSection = {
  id: string;
  pageId: string;
  page: {
    id: string;
    projectId: string;
    path: string;
    url: string;
    project: {
      id: string;
      name: string;
      slug: string;
    };
  };
  kind: SectionKind;
  heading: string | null;
  content: string;
  order: number;
  wordCount: number | null;
  createdAt: string;
  updatedAt: string;
};

type ContentBrief = {
  id: string;
  projectId: string;
  pageId: string | null;
  keywordId: string | null;
  project: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
  };
  page: {
    id: string;
    path: string;
    url: string;
  } | null;
  keyword: {
    id: string;
    term: string;
    locale: string;
    device: string;
  } | null;
  title: string;
  objective: string | null;
  audience: string | null;
  outline: Record<string, unknown> | null;
  status: BriefStatus;
  generatedBy: string | null;
  tasksCount: number;
  createdAt: string;
  updatedAt: string;
};

type ContentTask = {
  id: string;
  projectId: string;
  briefId: string | null;
  pageId: string | null;
  jobRunId: string | null;
  project: {
    id: string;
    name: string;
    slug: string;
  };
  brief: {
    id: string;
    title: string;
    status: BriefStatus;
  } | null;
  page: {
    id: string;
    path: string;
    url: string;
  } | null;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse<T> = {
  data?: T[];
  meta?: ListMeta;
  error?: ApiError;
};

type SingleResponse<T> = {
  data?: T;
  error?: ApiError;
};

type Props = {
  token: string | null;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
  projects: ProjectOption[];
  pages: PageOption[];
  keywords: KeywordOption[];
};

function createEmptyMeta(limit = 20): ListMeta {
  return {
    page: 1,
    limit,
    total: 0,
    totalPages: 0
  };
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(localValue: string): string | null {
  const trimmed = localValue.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function Phase8ContentOpsPanel({ token, authFetch, projects, pages, keywords }: Props) {
  const [pageSections, setPageSections] = useState<PageSection[]>([]);
  const [pageSectionsMeta, setPageSectionsMeta] = useState<ListMeta>(createEmptyMeta(20));
  const [pageSectionsLoading, setPageSectionsLoading] = useState(false);
  const [pageSectionsError, setPageSectionsError] = useState<string | null>(null);

  const [sectionPage, setSectionPage] = useState(1);
  const [sectionLimit, setSectionLimit] = useState(20);
  const [sectionSort, setSectionSort] = useState<
    "order_asc" | "order_desc" | "createdAt_desc" | "createdAt_asc" | "updatedAt_desc" | "updatedAt_asc"
  >("order_asc");
  const [sectionProjectFilterId, setSectionProjectFilterId] = useState("");
  const [sectionPageFilterId, setSectionPageFilterId] = useState("");
  const [sectionKindFilter, setSectionKindFilter] = useState<"" | SectionKind>("");
  const [sectionQuery, setSectionQuery] = useState("");

  const [createSectionPageId, setCreateSectionPageId] = useState("");
  const [createSectionKind, setCreateSectionKind] = useState<SectionKind>("BODY");
  const [createSectionHeading, setCreateSectionHeading] = useState("");
  const [createSectionContent, setCreateSectionContent] = useState("");
  const [createSectionOrder, setCreateSectionOrder] = useState("1");
  const [createSectionWordCount, setCreateSectionWordCount] = useState("");
  const [createSectionError, setCreateSectionError] = useState<string | null>(null);
  const [creatingSection, setCreatingSection] = useState(false);

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [editSectionKind, setEditSectionKind] = useState<SectionKind>("BODY");
  const [editSectionHeading, setEditSectionHeading] = useState("");
  const [editSectionContent, setEditSectionContent] = useState("");
  const [editSectionOrder, setEditSectionOrder] = useState("1");
  const [editSectionWordCount, setEditSectionWordCount] = useState("");
  const [editSectionError, setEditSectionError] = useState<string | null>(null);
  const [updatingSection, setUpdatingSection] = useState(false);
  const [deletingSection, setDeletingSection] = useState(false);

  const [briefs, setBriefs] = useState<ContentBrief[]>([]);
  const [briefsMeta, setBriefsMeta] = useState<ListMeta>(createEmptyMeta(20));
  const [briefsLoading, setBriefsLoading] = useState(false);
  const [briefsError, setBriefsError] = useState<string | null>(null);

  const [briefPage, setBriefPage] = useState(1);
  const [briefLimit, setBriefLimit] = useState(20);
  const [briefSort, setBriefSort] = useState<
    "createdAt_desc" | "createdAt_asc" | "updatedAt_desc" | "updatedAt_asc" | "title_asc" | "title_desc"
  >("createdAt_desc");
  const [briefProjectFilterId, setBriefProjectFilterId] = useState("");
  const [briefPageFilterId, setBriefPageFilterId] = useState("");
  const [briefKeywordFilterId, setBriefKeywordFilterId] = useState("");
  const [briefStatusFilter, setBriefStatusFilter] = useState<"" | BriefStatus>("");
  const [briefQuery, setBriefQuery] = useState("");

  const [createBriefProjectId, setCreateBriefProjectId] = useState("");
  const [createBriefPageId, setCreateBriefPageId] = useState("");
  const [createBriefKeywordId, setCreateBriefKeywordId] = useState("");
  const [createBriefTitle, setCreateBriefTitle] = useState("");
  const [createBriefObjective, setCreateBriefObjective] = useState("");
  const [createBriefAudience, setCreateBriefAudience] = useState("");
  const [createBriefOutline, setCreateBriefOutline] = useState("");
  const [createBriefStatus, setCreateBriefStatus] = useState<BriefStatus>("DRAFT");
  const [createBriefGeneratedBy, setCreateBriefGeneratedBy] = useState("");
  const [createBriefError, setCreateBriefError] = useState<string | null>(null);
  const [creatingBrief, setCreatingBrief] = useState(false);

  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [editBriefPageId, setEditBriefPageId] = useState("");
  const [editBriefKeywordId, setEditBriefKeywordId] = useState("");
  const [editBriefTitle, setEditBriefTitle] = useState("");
  const [editBriefObjective, setEditBriefObjective] = useState("");
  const [editBriefAudience, setEditBriefAudience] = useState("");
  const [editBriefOutline, setEditBriefOutline] = useState("");
  const [editBriefStatus, setEditBriefStatus] = useState<BriefStatus>("DRAFT");
  const [editBriefGeneratedBy, setEditBriefGeneratedBy] = useState("");
  const [editBriefError, setEditBriefError] = useState<string | null>(null);
  const [updatingBrief, setUpdatingBrief] = useState(false);
  const [deletingBrief, setDeletingBrief] = useState(false);

  const [tasks, setTasks] = useState<ContentTask[]>([]);
  const [tasksMeta, setTasksMeta] = useState<ListMeta>(createEmptyMeta(20));
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const [taskPage, setTaskPage] = useState(1);
  const [taskLimit, setTaskLimit] = useState(20);
  const [taskSort, setTaskSort] = useState<
    "createdAt_desc" | "createdAt_asc" | "updatedAt_desc" | "updatedAt_asc" | "priority_asc" | "priority_desc" | "dueAt_asc" | "dueAt_desc"
  >("createdAt_desc");
  const [taskProjectFilterId, setTaskProjectFilterId] = useState("");
  const [taskBriefFilterId, setTaskBriefFilterId] = useState("");
  const [taskPageFilterId, setTaskPageFilterId] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<"" | TaskStatus>("");
  const [taskTypeFilter, setTaskTypeFilter] = useState<"" | TaskType>("");
  const [taskQuery, setTaskQuery] = useState("");

  const [createTaskProjectId, setCreateTaskProjectId] = useState("");
  const [createTaskBriefId, setCreateTaskBriefId] = useState("");
  const [createTaskPageId, setCreateTaskPageId] = useState("");
  const [createTaskType, setCreateTaskType] = useState<TaskType>("WRITE");
  const [createTaskStatus, setCreateTaskStatus] = useState<TaskStatus>("TODO");
  const [createTaskPriority, setCreateTaskPriority] = useState("3");
  const [createTaskDueAt, setCreateTaskDueAt] = useState("");
  const [createTaskPayload, setCreateTaskPayload] = useState("");
  const [createTaskErrorText, setCreateTaskErrorText] = useState("");
  const [createTaskError, setCreateTaskError] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editTaskBriefId, setEditTaskBriefId] = useState("");
  const [editTaskPageId, setEditTaskPageId] = useState("");
  const [editTaskType, setEditTaskType] = useState<TaskType>("WRITE");
  const [editTaskPriority, setEditTaskPriority] = useState("3");
  const [editTaskDueAt, setEditTaskDueAt] = useState("");
  const [editTaskPayload, setEditTaskPayload] = useState("");
  const [editTaskResult, setEditTaskResult] = useState("");
  const [editTaskErrorText, setEditTaskErrorText] = useState("");
  const [transitionTaskStatus, setTransitionTaskStatus] = useState<TaskStatus>("TODO");
  const [transitionTaskResult, setTransitionTaskResult] = useState("");
  const [transitionTaskErrorText, setTransitionTaskErrorText] = useState("");
  const [editTaskError, setEditTaskError] = useState<string | null>(null);
  const [updatingTask, setUpdatingTask] = useState(false);
  const [transitioningTask, setTransitioningTask] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);

  const selectedSection = useMemo(
    () => pageSections.find((section) => section.id === selectedSectionId) ?? null,
    [pageSections, selectedSectionId]
  );

  const selectedBrief = useMemo(() => briefs.find((brief) => brief.id === selectedBriefId) ?? null, [briefs, selectedBriefId]);
  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  const pagesForSectionProjectFilter = useMemo(
    () => pages.filter((pageItem) => !sectionProjectFilterId || pageItem.projectId === sectionProjectFilterId),
    [pages, sectionProjectFilterId]
  );

  const pagesForCreateBriefProject = useMemo(
    () => pages.filter((pageItem) => pageItem.projectId === createBriefProjectId),
    [createBriefProjectId, pages]
  );

  const keywordsForCreateBriefProject = useMemo(
    () => keywords.filter((keyword) => keyword.projectId === createBriefProjectId),
    [createBriefProjectId, keywords]
  );

  const pagesForBriefFilterProject = useMemo(
    () => pages.filter((pageItem) => !briefProjectFilterId || pageItem.projectId === briefProjectFilterId),
    [briefProjectFilterId, pages]
  );

  const keywordsForBriefFilterProject = useMemo(
    () => keywords.filter((keyword) => !briefProjectFilterId || keyword.projectId === briefProjectFilterId),
    [briefProjectFilterId, keywords]
  );

  const pagesForSelectedBriefProject = useMemo(
    () => pages.filter((pageItem) => pageItem.projectId === (selectedBrief?.projectId ?? "")),
    [pages, selectedBrief?.projectId]
  );

  const keywordsForSelectedBriefProject = useMemo(
    () => keywords.filter((keyword) => keyword.projectId === (selectedBrief?.projectId ?? "")),
    [keywords, selectedBrief?.projectId]
  );

  const briefsForTaskProject = useMemo(
    () => briefs.filter((brief) => brief.projectId === createTaskProjectId),
    [briefs, createTaskProjectId]
  );

  const pagesForTaskProject = useMemo(
    () => pages.filter((pageItem) => pageItem.projectId === createTaskProjectId),
    [createTaskProjectId, pages]
  );

  const briefsForTaskFilterProject = useMemo(
    () => briefs.filter((brief) => !taskProjectFilterId || brief.projectId === taskProjectFilterId),
    [briefs, taskProjectFilterId]
  );

  const pagesForTaskFilterProject = useMemo(
    () => pages.filter((pageItem) => !taskProjectFilterId || pageItem.projectId === taskProjectFilterId),
    [pages, taskProjectFilterId]
  );

  const briefsForSelectedTaskProject = useMemo(
    () => briefs.filter((brief) => brief.projectId === (selectedTask?.projectId ?? "")),
    [briefs, selectedTask?.projectId]
  );

  const pagesForSelectedTaskProject = useMemo(
    () => pages.filter((pageItem) => pageItem.projectId === (selectedTask?.projectId ?? "")),
    [pages, selectedTask?.projectId]
  );

  const loadPageSections = useCallback(async () => {
    if (!token) {
      setPageSections([]);
      setPageSectionsMeta(createEmptyMeta(sectionLimit));
      return;
    }

    setPageSectionsLoading(true);
    setPageSectionsError(null);

    try {
      const params = new URLSearchParams({
        page: String(sectionPage),
        limit: String(sectionLimit),
        sort: sectionSort
      });

      if (sectionProjectFilterId) params.set("projectId", sectionProjectFilterId);
      if (sectionPageFilterId) params.set("pageId", sectionPageFilterId);
      if (sectionKindFilter) params.set("kind", sectionKindFilter);
      if (sectionQuery.trim()) params.set("q", sectionQuery.trim());

      const response = await authFetch(`/v1/page-sections?${params.toString()}`, { cache: "no-store" });
      const payload = (await parseJson<ListResponse<PageSection>>(response)) ?? undefined;

      if (!response.ok || !payload?.data || !payload.meta) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setPageSections(payload.data);
      setPageSectionsMeta(payload.meta);

      if (selectedSectionId && !payload.data.some((section) => section.id === selectedSectionId)) {
        setSelectedSectionId(null);
      }
    } catch (error) {
      setPageSections([]);
      setPageSectionsMeta(createEmptyMeta(sectionLimit));
      setPageSectionsError(error instanceof Error ? error.message : "Failed to load page sections");
    } finally {
      setPageSectionsLoading(false);
    }
  }, [
    authFetch,
    sectionKindFilter,
    sectionLimit,
    sectionPage,
    sectionPageFilterId,
    sectionProjectFilterId,
    sectionQuery,
    sectionSort,
    selectedSectionId,
    token
  ]);

  const loadBriefs = useCallback(async () => {
    if (!token) {
      setBriefs([]);
      setBriefsMeta(createEmptyMeta(briefLimit));
      return;
    }

    setBriefsLoading(true);
    setBriefsError(null);

    try {
      const params = new URLSearchParams({
        page: String(briefPage),
        limit: String(briefLimit),
        sort: briefSort
      });

      if (briefProjectFilterId) params.set("projectId", briefProjectFilterId);
      if (briefPageFilterId) params.set("pageId", briefPageFilterId);
      if (briefKeywordFilterId) params.set("keywordId", briefKeywordFilterId);
      if (briefStatusFilter) params.set("status", briefStatusFilter);
      if (briefQuery.trim()) params.set("q", briefQuery.trim());

      const response = await authFetch(`/v1/content-briefs?${params.toString()}`, { cache: "no-store" });
      const payload = (await parseJson<ListResponse<ContentBrief>>(response)) ?? undefined;

      if (!response.ok || !payload?.data || !payload.meta) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setBriefs(payload.data);
      setBriefsMeta(payload.meta);

      if (selectedBriefId && !payload.data.some((brief) => brief.id === selectedBriefId)) {
        setSelectedBriefId(null);
      }
    } catch (error) {
      setBriefs([]);
      setBriefsMeta(createEmptyMeta(briefLimit));
      setBriefsError(error instanceof Error ? error.message : "Failed to load content briefs");
    } finally {
      setBriefsLoading(false);
    }
  }, [
    authFetch,
    briefKeywordFilterId,
    briefLimit,
    briefPage,
    briefPageFilterId,
    briefProjectFilterId,
    briefQuery,
    briefSort,
    briefStatusFilter,
    selectedBriefId,
    token
  ]);

  const loadTasks = useCallback(async () => {
    if (!token) {
      setTasks([]);
      setTasksMeta(createEmptyMeta(taskLimit));
      return;
    }

    setTasksLoading(true);
    setTasksError(null);

    try {
      const params = new URLSearchParams({
        page: String(taskPage),
        limit: String(taskLimit),
        sort: taskSort
      });

      if (taskProjectFilterId) params.set("projectId", taskProjectFilterId);
      if (taskBriefFilterId) params.set("briefId", taskBriefFilterId);
      if (taskPageFilterId) params.set("pageId", taskPageFilterId);
      if (taskStatusFilter) params.set("status", taskStatusFilter);
      if (taskTypeFilter) params.set("type", taskTypeFilter);
      if (taskQuery.trim()) params.set("q", taskQuery.trim());

      const response = await authFetch(`/v1/content-tasks?${params.toString()}`, { cache: "no-store" });
      const payload = (await parseJson<ListResponse<ContentTask>>(response)) ?? undefined;

      if (!response.ok || !payload?.data || !payload.meta) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setTasks(payload.data);
      setTasksMeta(payload.meta);

      if (selectedTaskId && !payload.data.some((task) => task.id === selectedTaskId)) {
        setSelectedTaskId(null);
      }
    } catch (error) {
      setTasks([]);
      setTasksMeta(createEmptyMeta(taskLimit));
      setTasksError(error instanceof Error ? error.message : "Failed to load content tasks");
    } finally {
      setTasksLoading(false);
    }
  }, [
    authFetch,
    selectedTaskId,
    taskBriefFilterId,
    taskLimit,
    taskPage,
    taskPageFilterId,
    taskProjectFilterId,
    taskQuery,
    taskSort,
    taskStatusFilter,
    taskTypeFilter,
    token
  ]);

  useEffect(() => {
    void loadPageSections();
  }, [loadPageSections]);

  useEffect(() => {
    void loadBriefs();
  }, [loadBriefs]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!token) {
      setCreateSectionPageId("");
      setCreateBriefProjectId("");
      setCreateBriefPageId("");
      setCreateBriefKeywordId("");
      setCreateTaskProjectId("");
      setCreateTaskBriefId("");
      setCreateTaskPageId("");
      return;
    }

    if (!createSectionPageId && pages.length > 0) {
      setCreateSectionPageId(pages[0].id);
    }

    if (!createBriefProjectId && projects.length > 0) {
      setCreateBriefProjectId(projects[0].id);
    }

    if (!createTaskProjectId && projects.length > 0) {
      setCreateTaskProjectId(projects[0].id);
    }
  }, [createBriefProjectId, createSectionPageId, createTaskProjectId, pages, projects, token]);

  useEffect(() => {
    if (createBriefPageId && !pagesForCreateBriefProject.some((pageItem) => pageItem.id === createBriefPageId)) {
      setCreateBriefPageId("");
    }
  }, [createBriefPageId, pagesForCreateBriefProject]);

  useEffect(() => {
    if (createBriefKeywordId && !keywordsForCreateBriefProject.some((keyword) => keyword.id === createBriefKeywordId)) {
      setCreateBriefKeywordId("");
    }
  }, [createBriefKeywordId, keywordsForCreateBriefProject]);

  useEffect(() => {
    if (createTaskBriefId && !briefsForTaskProject.some((brief) => brief.id === createTaskBriefId)) {
      setCreateTaskBriefId("");
    }
  }, [briefsForTaskProject, createTaskBriefId]);

  useEffect(() => {
    if (createTaskPageId && !pagesForTaskProject.some((pageItem) => pageItem.id === createTaskPageId)) {
      setCreateTaskPageId("");
    }
  }, [createTaskPageId, pagesForTaskProject]);

  useEffect(() => {
    if (!selectedSection) return;

    setEditSectionKind(selectedSection.kind);
    setEditSectionHeading(selectedSection.heading ?? "");
    setEditSectionContent(selectedSection.content);
    setEditSectionOrder(String(selectedSection.order));
    setEditSectionWordCount(selectedSection.wordCount === null ? "" : String(selectedSection.wordCount));
    setEditSectionError(null);
  }, [selectedSection]);

  useEffect(() => {
    if (!selectedBrief) return;

    setEditBriefPageId(selectedBrief.pageId ?? "");
    setEditBriefKeywordId(selectedBrief.keywordId ?? "");
    setEditBriefTitle(selectedBrief.title);
    setEditBriefObjective(selectedBrief.objective ?? "");
    setEditBriefAudience(selectedBrief.audience ?? "");
    setEditBriefOutline(selectedBrief.outline ? JSON.stringify(selectedBrief.outline, null, 2) : "");
    setEditBriefStatus(selectedBrief.status);
    setEditBriefGeneratedBy(selectedBrief.generatedBy ?? "");
    setEditBriefError(null);
  }, [selectedBrief]);

  useEffect(() => {
    if (!selectedTask) return;

    setEditTaskBriefId(selectedTask.briefId ?? "");
    setEditTaskPageId(selectedTask.pageId ?? "");
    setEditTaskType(selectedTask.type);
    setEditTaskPriority(String(selectedTask.priority));
    setEditTaskDueAt(toDateTimeLocalValue(selectedTask.dueAt));
    setEditTaskPayload(selectedTask.payload ? JSON.stringify(selectedTask.payload, null, 2) : "");
    setEditTaskResult(selectedTask.result ? JSON.stringify(selectedTask.result, null, 2) : "");
    setEditTaskErrorText(selectedTask.error ?? "");
    setTransitionTaskStatus(selectedTask.status);
    setTransitionTaskResult("");
    setTransitionTaskErrorText("");
    setEditTaskError(null);
  }, [selectedTask]);

  const parseOptionalObject = (raw: string, fieldName: string): Record<string, unknown> | null | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    let parsed: unknown;

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`${fieldName} must be valid JSON object.`);
    }

    if (parsed === null) return null;

    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${fieldName} must be a JSON object (or null).`);
    }

    return parsed as Record<string, unknown>;
  };

  const handleCreateSection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createSectionPageId) {
      setCreateSectionError("Page is required.");
      return;
    }

    if (!createSectionContent.trim()) {
      setCreateSectionError("Content is required.");
      return;
    }

    const order = Number(createSectionOrder);
    if (!Number.isInteger(order) || order < 0) {
      setCreateSectionError("Order must be a non-negative integer.");
      return;
    }

    let wordCount: number | null | undefined;
    const wordCountRaw = createSectionWordCount.trim();
    if (wordCountRaw) {
      const parsed = Number(wordCountRaw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        setCreateSectionError("Word count must be a non-negative integer.");
        return;
      }
      wordCount = parsed;
    }

    setCreatingSection(true);
    setCreateSectionError(null);

    try {
      const response = await authFetch("/v1/page-sections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pageId: createSectionPageId,
          kind: createSectionKind,
          heading: createSectionHeading.trim() || undefined,
          content: createSectionContent.trim(),
          order,
          ...(wordCount !== undefined ? { wordCount } : {})
        })
      });

      const payload = (await parseJson<SingleResponse<PageSection>>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setCreateSectionHeading("");
      setCreateSectionContent("");
      setCreateSectionOrder(String(order + 1));
      setCreateSectionWordCount("");
      setSelectedSectionId(payload.data.id);

      if (sectionPage !== 1) {
        setSectionPage(1);
      } else {
        await loadPageSections();
      }
    } catch (error) {
      setCreateSectionError(error instanceof Error ? error.message : "Failed to create page section");
    } finally {
      setCreatingSection(false);
    }
  };

  const handleUpdateSection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSection) return;

    if (!editSectionContent.trim()) {
      setEditSectionError("Content is required.");
      return;
    }

    const order = Number(editSectionOrder);
    if (!Number.isInteger(order) || order < 0) {
      setEditSectionError("Order must be a non-negative integer.");
      return;
    }

    let wordCount: number | null | undefined;
    const wordCountRaw = editSectionWordCount.trim();
    if (wordCountRaw) {
      const parsed = Number(wordCountRaw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        setEditSectionError("Word count must be a non-negative integer.");
        return;
      }
      wordCount = parsed;
    } else {
      wordCount = null;
    }

    setUpdatingSection(true);
    setEditSectionError(null);

    try {
      const response = await authFetch(`/v1/page-sections/${selectedSection.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind: editSectionKind,
          heading: editSectionHeading.trim() ? editSectionHeading.trim() : null,
          content: editSectionContent.trim(),
          order,
          wordCount
        })
      });

      const payload = (await parseJson<SingleResponse<PageSection>>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      await loadPageSections();
    } catch (error) {
      setEditSectionError(error instanceof Error ? error.message : "Failed to update section");
    } finally {
      setUpdatingSection(false);
    }
  };

  const handleDeleteSection = async () => {
    if (!selectedSection) return;

    const confirmed = window.confirm(`Delete section #${selectedSection.order} from ${selectedSection.page.path}?`);
    if (!confirmed) return;

    setDeletingSection(true);
    setEditSectionError(null);

    try {
      const response = await authFetch(`/v1/page-sections/${selectedSection.id}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await parseJson<SingleResponse<PageSection>>(response)) ?? undefined;
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedSectionId(null);
      await loadPageSections();
    } catch (error) {
      setEditSectionError(error instanceof Error ? error.message : "Failed to delete section");
    } finally {
      setDeletingSection(false);
    }
  };

  const handleCreateBrief = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createBriefProjectId) {
      setCreateBriefError("Project is required.");
      return;
    }

    if (!createBriefTitle.trim()) {
      setCreateBriefError("Title is required.");
      return;
    }

    setCreatingBrief(true);
    setCreateBriefError(null);

    try {
      const outline = parseOptionalObject(createBriefOutline, "Outline");

      const response = await authFetch("/v1/content-briefs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: createBriefProjectId,
          pageId: createBriefPageId || undefined,
          keywordId: createBriefKeywordId || undefined,
          title: createBriefTitle.trim(),
          objective: createBriefObjective.trim() || undefined,
          audience: createBriefAudience.trim() || undefined,
          ...(outline !== undefined ? { outline } : {}),
          status: createBriefStatus,
          generatedBy: createBriefGeneratedBy.trim() || undefined
        })
      });

      const payload = (await parseJson<SingleResponse<ContentBrief>>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setCreateBriefTitle("");
      setCreateBriefObjective("");
      setCreateBriefAudience("");
      setCreateBriefOutline("");
      setCreateBriefGeneratedBy("");
      setCreateBriefPageId("");
      setCreateBriefKeywordId("");
      setCreateBriefStatus("DRAFT");
      setSelectedBriefId(payload.data.id);

      if (briefPage !== 1) {
        setBriefPage(1);
      } else {
        await loadBriefs();
      }
    } catch (error) {
      setCreateBriefError(error instanceof Error ? error.message : "Failed to create brief");
    } finally {
      setCreatingBrief(false);
    }
  };

  const handleUpdateBrief = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBrief) return;

    if (!editBriefTitle.trim()) {
      setEditBriefError("Title is required.");
      return;
    }

    setUpdatingBrief(true);
    setEditBriefError(null);

    try {
      const outline = parseOptionalObject(editBriefOutline, "Outline");

      const response = await authFetch(`/v1/content-briefs/${selectedBrief.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pageId: editBriefPageId || null,
          keywordId: editBriefKeywordId || null,
          title: editBriefTitle.trim(),
          objective: editBriefObjective.trim() ? editBriefObjective.trim() : null,
          audience: editBriefAudience.trim() ? editBriefAudience.trim() : null,
          ...(outline !== undefined ? { outline } : { outline: null }),
          status: editBriefStatus,
          generatedBy: editBriefGeneratedBy.trim() ? editBriefGeneratedBy.trim() : null
        })
      });

      const payload = (await parseJson<SingleResponse<ContentBrief>>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      await loadBriefs();
    } catch (error) {
      setEditBriefError(error instanceof Error ? error.message : "Failed to update brief");
    } finally {
      setUpdatingBrief(false);
    }
  };

  const handleDeleteBrief = async () => {
    if (!selectedBrief) return;

    const confirmed = window.confirm(`Delete content brief "${selectedBrief.title}"?`);
    if (!confirmed) return;

    setDeletingBrief(true);
    setEditBriefError(null);

    try {
      const response = await authFetch(`/v1/content-briefs/${selectedBrief.id}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await parseJson<SingleResponse<ContentBrief>>(response)) ?? undefined;
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedBriefId(null);
      await loadBriefs();
      await loadTasks();
    } catch (error) {
      setEditBriefError(error instanceof Error ? error.message : "Failed to delete brief");
    } finally {
      setDeletingBrief(false);
    }
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createTaskProjectId) {
      setCreateTaskError("Project is required.");
      return;
    }

    const priority = Number(createTaskPriority);
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      setCreateTaskError("Priority must be an integer from 1 to 5.");
      return;
    }

    const dueAtIso = createTaskDueAt.trim() ? fromDateTimeLocalValue(createTaskDueAt) : null;
    if (createTaskDueAt.trim() && !dueAtIso) {
      setCreateTaskError("Due date/time is invalid.");
      return;
    }

    setCreatingTask(true);
    setCreateTaskError(null);

    try {
      const payload = parseOptionalObject(createTaskPayload, "Payload");

      const response = await authFetch("/v1/content-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: createTaskProjectId,
          briefId: createTaskBriefId || undefined,
          pageId: createTaskPageId || undefined,
          type: createTaskType,
          status: createTaskStatus,
          priority,
          ...(payload !== undefined ? { payload } : {}),
          error: createTaskErrorText.trim() || undefined,
          dueAt: dueAtIso || undefined
        })
      });

      const body = (await parseJson<SingleResponse<ContentTask>>(response)) ?? undefined;
      if (!response.ok || !body?.data) {
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }

      setCreateTaskBriefId("");
      setCreateTaskPageId("");
      setCreateTaskType("WRITE");
      setCreateTaskStatus("TODO");
      setCreateTaskPriority("3");
      setCreateTaskDueAt("");
      setCreateTaskPayload("");
      setCreateTaskErrorText("");
      setSelectedTaskId(body.data.id);

      if (taskPage !== 1) {
        setTaskPage(1);
      } else {
        await loadTasks();
      }
      await loadBriefs();
    } catch (error) {
      setCreateTaskError(error instanceof Error ? error.message : "Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  };

  const handleUpdateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTask) return;

    const priority = Number(editTaskPriority);
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      setEditTaskError("Priority must be an integer from 1 to 5.");
      return;
    }

    const dueAtIso = editTaskDueAt.trim() ? fromDateTimeLocalValue(editTaskDueAt) : null;
    if (editTaskDueAt.trim() && !dueAtIso) {
      setEditTaskError("Due date/time is invalid.");
      return;
    }

    setUpdatingTask(true);
    setEditTaskError(null);

    try {
      const payload = parseOptionalObject(editTaskPayload, "Payload");
      const result = parseOptionalObject(editTaskResult, "Result");

      const response = await authFetch(`/v1/content-tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          briefId: editTaskBriefId || null,
          pageId: editTaskPageId || null,
          type: editTaskType,
          priority,
          ...(payload !== undefined ? { payload } : { payload: null }),
          ...(result !== undefined ? { result } : { result: null }),
          error: editTaskErrorText.trim() ? editTaskErrorText.trim() : null,
          dueAt: dueAtIso
        })
      });

      const body = (await parseJson<SingleResponse<ContentTask>>(response)) ?? undefined;
      if (!response.ok || !body?.data) {
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }

      await loadTasks();
    } catch (error) {
      setEditTaskError(error instanceof Error ? error.message : "Failed to update task");
    } finally {
      setUpdatingTask(false);
    }
  };

  const handleTransitionTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTask) return;

    setTransitioningTask(true);
    setEditTaskError(null);

    try {
      const result = parseOptionalObject(transitionTaskResult, "Transition result");

      const response = await authFetch(`/v1/content-tasks/${selectedTask.id}/transition`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: transitionTaskStatus,
          error: transitionTaskErrorText.trim() ? transitionTaskErrorText.trim() : null,
          ...(result !== undefined ? { result } : {})
        })
      });

      const body = (await parseJson<SingleResponse<ContentTask>>(response)) ?? undefined;
      if (!response.ok || !body?.data) {
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }

      setTransitionTaskResult("");
      setTransitionTaskErrorText("");
      await loadTasks();
      await loadBriefs();
    } catch (error) {
      setEditTaskError(error instanceof Error ? error.message : "Failed to transition task");
    } finally {
      setTransitioningTask(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) return;

    const confirmed = window.confirm(`Delete task ${selectedTask.type} (${selectedTask.status})?`);
    if (!confirmed) return;

    setDeletingTask(true);
    setEditTaskError(null);

    try {
      const response = await authFetch(`/v1/content-tasks/${selectedTask.id}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 204) {
        const body = (await parseJson<SingleResponse<ContentTask>>(response)) ?? undefined;
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedTaskId(null);
      await loadTasks();
      await loadBriefs();
    } catch (error) {
      setEditTaskError(error instanceof Error ? error.message : "Failed to delete task");
    } finally {
      setDeletingTask(false);
    }
  };

  const sectionsCanPrev = sectionPage > 1;
  const sectionsCanNext = pageSectionsMeta.totalPages > 0 && sectionPage < pageSectionsMeta.totalPages;

  const briefsCanPrev = briefPage > 1;
  const briefsCanNext = briefsMeta.totalPages > 0 && briefPage < briefsMeta.totalPages;

  const tasksCanPrev = taskPage > 1;
  const tasksCanNext = tasksMeta.totalPages > 0 && taskPage < tasksMeta.totalPages;

  return (
    <>
      <section className="panel">
        <h2>Create Page Section</h2>
        <form className="form" onSubmit={handleCreateSection}>
          <label>
            Page
            <select
              value={createSectionPageId}
              onChange={(event) => setCreateSectionPageId(event.target.value)}
              disabled={!token || creatingSection || pages.length === 0}
              required
            >
              <option value="" disabled>
                {pages.length === 0 ? "Create/select a page first" : "Select page"}
              </option>
              {pages.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Kind
            <select value={createSectionKind} onChange={(event) => setCreateSectionKind(event.target.value as SectionKind)}>
              <option value="HERO">HERO</option>
              <option value="INTRO">INTRO</option>
              <option value="BODY">BODY</option>
              <option value="FAQ">FAQ</option>
              <option value="CTA">CTA</option>
              <option value="CUSTOM">CUSTOM</option>
            </select>
          </label>

          <label>
            Heading (optional)
            <input value={createSectionHeading} onChange={(event) => setCreateSectionHeading(event.target.value)} maxLength={255} />
          </label>

          <label>
            Content
            <textarea value={createSectionContent} onChange={(event) => setCreateSectionContent(event.target.value)} rows={4} required />
          </label>

          <label>
            Order
            <input type="number" min={0} value={createSectionOrder} onChange={(event) => setCreateSectionOrder(event.target.value)} required />
          </label>

          <label>
            Word Count (optional override)
            <input
              type="number"
              min={0}
              value={createSectionWordCount}
              onChange={(event) => setCreateSectionWordCount(event.target.value)}
            />
          </label>

          <button type="submit" disabled={!token || creatingSection || pages.length === 0}>
            {creatingSection ? "Creating..." : "Create Section"}
          </button>

          {createSectionError ? <p className="error">{createSectionError}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Page Sections</h2>
          <button type="button" onClick={() => void loadPageSections()} disabled={!token || pageSectionsLoading}>
            Refresh
          </button>
        </div>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setSectionPage(1);
          }}
        >
          <label>
            Filter by project
            <select
              value={sectionProjectFilterId}
              onChange={(event) => {
                setSectionProjectFilterId(event.target.value);
                setSectionPageFilterId("");
                setSectionPage(1);
              }}
              disabled={!token || projects.length === 0}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.slug})
                </option>
              ))}
            </select>
          </label>

          <label>
            Filter by page
            <select
              value={sectionPageFilterId}
              onChange={(event) => {
                setSectionPageFilterId(event.target.value);
                setSectionPage(1);
              }}
              disabled={!token || pagesForSectionProjectFilter.length === 0}
            >
              <option value="">All pages</option>
              {pagesForSectionProjectFilter.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Kind
            <select
              value={sectionKindFilter}
              onChange={(event) => {
                setSectionKindFilter(event.target.value as "" | SectionKind);
                setSectionPage(1);
              }}
            >
              <option value="">All kinds</option>
              <option value="HERO">HERO</option>
              <option value="INTRO">INTRO</option>
              <option value="BODY">BODY</option>
              <option value="FAQ">FAQ</option>
              <option value="CTA">CTA</option>
              <option value="CUSTOM">CUSTOM</option>
            </select>
          </label>

          <label>
            Search heading/content
            <input
              type="text"
              value={sectionQuery}
              onChange={(event) => {
                setSectionQuery(event.target.value);
                setSectionPage(1);
              }}
            />
          </label>

          <label>
            Sort
            <select
              value={sectionSort}
              onChange={(event) => {
                setSectionSort(event.target.value as typeof sectionSort);
                setSectionPage(1);
              }}
            >
              <option value="order_asc">Order asc</option>
              <option value="order_desc">Order desc</option>
              <option value="createdAt_desc">Created newest</option>
              <option value="createdAt_asc">Created oldest</option>
              <option value="updatedAt_desc">Updated newest</option>
              <option value="updatedAt_asc">Updated oldest</option>
            </select>
          </label>
        </form>

        <p className="muted">{pageSectionsLoading ? "Loading..." : `${pageSectionsMeta.total} total sections`}</p>
        {pageSectionsError ? <p className="error">{pageSectionsError}</p> : null}

        {!pageSectionsError && pageSections.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Kind</th>
                  <th>Order</th>
                  <th>Heading</th>
                  <th>Word Count</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageSections.map((section) => (
                  <tr key={section.id}>
                    <td>
                      {section.page.path} ({section.page.project.slug})
                    </td>
                    <td>{section.kind}</td>
                    <td>{section.order}</td>
                    <td>{section.heading ?? "—"}</td>
                    <td>{section.wordCount ?? "—"}</td>
                    <td>{new Date(section.updatedAt).toLocaleString()}</td>
                    <td>
                      <button type="button" onClick={() => setSelectedSectionId(section.id)}>
                        View / Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="panel-header">
          <button type="button" onClick={() => setSectionPage((prev) => Math.max(1, prev - 1))} disabled={!sectionsCanPrev}>
            Previous
          </button>
          <p className="muted">
            Page {pageSectionsMeta.page} of {Math.max(pageSectionsMeta.totalPages, 1)}
          </p>
          <button type="button" onClick={() => setSectionPage((prev) => prev + 1)} disabled={!sectionsCanNext}>
            Next
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Page Section Detail</h2>
        {!selectedSection ? <p className="muted">Select a section to edit.</p> : null}
        {selectedSection ? (
          <form className="form" onSubmit={handleUpdateSection}>
            <p className="muted">
              Page: <strong>{selectedSection.page.path}</strong> ({selectedSection.page.project.name})
            </p>

            <label>
              Kind
              <select value={editSectionKind} onChange={(event) => setEditSectionKind(event.target.value as SectionKind)}>
                <option value="HERO">HERO</option>
                <option value="INTRO">INTRO</option>
                <option value="BODY">BODY</option>
                <option value="FAQ">FAQ</option>
                <option value="CTA">CTA</option>
                <option value="CUSTOM">CUSTOM</option>
              </select>
            </label>

            <label>
              Heading (blank clears)
              <input value={editSectionHeading} onChange={(event) => setEditSectionHeading(event.target.value)} maxLength={255} />
            </label>

            <label>
              Content
              <textarea value={editSectionContent} onChange={(event) => setEditSectionContent(event.target.value)} rows={5} required />
            </label>

            <label>
              Order
              <input type="number" min={0} value={editSectionOrder} onChange={(event) => setEditSectionOrder(event.target.value)} required />
            </label>

            <label>
              Word Count (blank auto)
              <input type="number" min={0} value={editSectionWordCount} onChange={(event) => setEditSectionWordCount(event.target.value)} />
            </label>

            <div className="panel-header">
              <button type="submit" disabled={updatingSection || deletingSection}>
                {updatingSection ? "Saving..." : "Save changes"}
              </button>
              <button type="button" onClick={handleDeleteSection} disabled={updatingSection || deletingSection}>
                {deletingSection ? "Deleting..." : "Delete section"}
              </button>
            </div>

            {editSectionError ? <p className="error">{editSectionError}</p> : null}
          </form>
        ) : null}
      </section>

      <section className="panel">
        <h2>Create Content Brief</h2>
        <form className="form" onSubmit={handleCreateBrief}>
          <label>
            Project
            <select
              value={createBriefProjectId}
              onChange={(event) => {
                setCreateBriefProjectId(event.target.value);
                setCreateBriefPageId("");
                setCreateBriefKeywordId("");
              }}
              disabled={!token || creatingBrief || projects.length === 0}
              required
            >
              <option value="" disabled>
                {projects.length === 0 ? "Create/select a project first" : "Select project"}
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.slug})
                </option>
              ))}
            </select>
          </label>

          <label>
            Page (optional)
            <select value={createBriefPageId} onChange={(event) => setCreateBriefPageId(event.target.value)}>
              <option value="">No linked page</option>
              {pagesForCreateBriefProject.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Keyword (optional)
            <select value={createBriefKeywordId} onChange={(event) => setCreateBriefKeywordId(event.target.value)}>
              <option value="">No linked keyword</option>
              {keywordsForCreateBriefProject.map((keyword) => (
                <option key={keyword.id} value={keyword.id}>
                  {keyword.term}
                </option>
              ))}
            </select>
          </label>

          <label>
            Title
            <input value={createBriefTitle} onChange={(event) => setCreateBriefTitle(event.target.value)} maxLength={255} required />
          </label>

          <label>
            Objective (optional)
            <textarea value={createBriefObjective} onChange={(event) => setCreateBriefObjective(event.target.value)} rows={2} />
          </label>

          <label>
            Audience (optional)
            <textarea value={createBriefAudience} onChange={(event) => setCreateBriefAudience(event.target.value)} rows={2} />
          </label>

          <label>
            Outline JSON (optional object)
            <textarea value={createBriefOutline} onChange={(event) => setCreateBriefOutline(event.target.value)} rows={4} />
          </label>

          <label>
            Status
            <select value={createBriefStatus} onChange={(event) => setCreateBriefStatus(event.target.value as BriefStatus)}>
              <option value="DRAFT">DRAFT</option>
              <option value="READY">READY</option>
              <option value="APPROVED">APPROVED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>

          <label>
            Generated By (optional)
            <input value={createBriefGeneratedBy} onChange={(event) => setCreateBriefGeneratedBy(event.target.value)} maxLength={120} />
          </label>

          <button type="submit" disabled={!token || creatingBrief || projects.length === 0}>
            {creatingBrief ? "Creating..." : "Create Brief"}
          </button>

          {createBriefError ? <p className="error">{createBriefError}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Content Briefs</h2>
          <button type="button" onClick={() => void loadBriefs()} disabled={!token || briefsLoading}>
            Refresh
          </button>
        </div>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setBriefPage(1);
          }}
        >
          <label>
            Filter by project
            <select
              value={briefProjectFilterId}
              onChange={(event) => {
                setBriefProjectFilterId(event.target.value);
                setBriefPageFilterId("");
                setBriefKeywordFilterId("");
                setBriefPage(1);
              }}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.slug})
                </option>
              ))}
            </select>
          </label>

          <label>
            Filter by page
            <select
              value={briefPageFilterId}
              onChange={(event) => {
                setBriefPageFilterId(event.target.value);
                setBriefPage(1);
              }}
              disabled={pagesForBriefFilterProject.length === 0}
            >
              <option value="">All pages</option>
              {pagesForBriefFilterProject.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Filter by keyword
            <select
              value={briefKeywordFilterId}
              onChange={(event) => {
                setBriefKeywordFilterId(event.target.value);
                setBriefPage(1);
              }}
              disabled={keywordsForBriefFilterProject.length === 0}
            >
              <option value="">All keywords</option>
              {keywordsForBriefFilterProject.map((keyword) => (
                <option key={keyword.id} value={keyword.id}>
                  {keyword.term}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={briefStatusFilter}
              onChange={(event) => {
                setBriefStatusFilter(event.target.value as "" | BriefStatus);
                setBriefPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="READY">READY</option>
              <option value="APPROVED">APPROVED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>

          <label>
            Search title/objective/audience
            <input
              value={briefQuery}
              onChange={(event) => {
                setBriefQuery(event.target.value);
                setBriefPage(1);
              }}
            />
          </label>

          <label>
            Sort
            <select
              value={briefSort}
              onChange={(event) => {
                setBriefSort(event.target.value as typeof briefSort);
                setBriefPage(1);
              }}
            >
              <option value="createdAt_desc">Created newest</option>
              <option value="createdAt_asc">Created oldest</option>
              <option value="updatedAt_desc">Updated newest</option>
              <option value="updatedAt_asc">Updated oldest</option>
              <option value="title_asc">Title A-Z</option>
              <option value="title_desc">Title Z-A</option>
            </select>
          </label>
        </form>

        <p className="muted">{briefsLoading ? "Loading..." : `${briefsMeta.total} total briefs`}</p>
        {briefsError ? <p className="error">{briefsError}</p> : null}

        {!briefsError && briefs.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Page</th>
                  <th>Keyword</th>
                  <th>Tasks</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {briefs.map((brief) => (
                  <tr key={brief.id}>
                    <td>{brief.title}</td>
                    <td>{brief.project.name}</td>
                    <td>{brief.status}</td>
                    <td>{brief.page?.path ?? "—"}</td>
                    <td>{brief.keyword?.term ?? "—"}</td>
                    <td>{brief.tasksCount}</td>
                    <td>{new Date(brief.updatedAt).toLocaleString()}</td>
                    <td>
                      <button type="button" onClick={() => setSelectedBriefId(brief.id)}>
                        View / Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="panel-header">
          <button type="button" onClick={() => setBriefPage((prev) => Math.max(1, prev - 1))} disabled={!briefsCanPrev}>
            Previous
          </button>
          <p className="muted">
            Page {briefsMeta.page} of {Math.max(briefsMeta.totalPages, 1)}
          </p>
          <button type="button" onClick={() => setBriefPage((prev) => prev + 1)} disabled={!briefsCanNext}>
            Next
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Content Brief Detail</h2>
        {!selectedBrief ? <p className="muted">Select a brief to edit.</p> : null}
        {selectedBrief ? (
          <form className="form" onSubmit={handleUpdateBrief}>
            <p className="muted">
              Project: <strong>{selectedBrief.project.name}</strong>
            </p>

            <label>
              Linked page
              <select value={editBriefPageId} onChange={(event) => setEditBriefPageId(event.target.value)}>
                <option value="">No linked page</option>
                {pagesForSelectedBriefProject.map((pageItem) => (
                  <option key={pageItem.id} value={pageItem.id}>
                    {pageItem.path}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Linked keyword
              <select value={editBriefKeywordId} onChange={(event) => setEditBriefKeywordId(event.target.value)}>
                <option value="">No linked keyword</option>
                {keywordsForSelectedBriefProject.map((keyword) => (
                  <option key={keyword.id} value={keyword.id}>
                    {keyword.term}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Title
              <input value={editBriefTitle} onChange={(event) => setEditBriefTitle(event.target.value)} maxLength={255} required />
            </label>

            <label>
              Objective (blank clears)
              <textarea value={editBriefObjective} onChange={(event) => setEditBriefObjective(event.target.value)} rows={2} />
            </label>

            <label>
              Audience (blank clears)
              <textarea value={editBriefAudience} onChange={(event) => setEditBriefAudience(event.target.value)} rows={2} />
            </label>

            <label>
              Outline JSON (blank clears)
              <textarea value={editBriefOutline} onChange={(event) => setEditBriefOutline(event.target.value)} rows={4} />
            </label>

            <label>
              Status
              <select value={editBriefStatus} onChange={(event) => setEditBriefStatus(event.target.value as BriefStatus)}>
                <option value="DRAFT">DRAFT</option>
                <option value="READY">READY</option>
                <option value="APPROVED">APPROVED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>

            <label>
              Generated By (blank clears)
              <input value={editBriefGeneratedBy} onChange={(event) => setEditBriefGeneratedBy(event.target.value)} maxLength={120} />
            </label>

            <div className="panel-header">
              <button type="submit" disabled={updatingBrief || deletingBrief}>
                {updatingBrief ? "Saving..." : "Save changes"}
              </button>
              <button type="button" onClick={handleDeleteBrief} disabled={updatingBrief || deletingBrief}>
                {deletingBrief ? "Deleting..." : "Delete brief"}
              </button>
            </div>

            {editBriefError ? <p className="error">{editBriefError}</p> : null}
          </form>
        ) : null}
      </section>

      <section className="panel">
        <h2>Create Content Task</h2>
        <form className="form" onSubmit={handleCreateTask}>
          <label>
            Project
            <select
              value={createTaskProjectId}
              onChange={(event) => {
                setCreateTaskProjectId(event.target.value);
                setCreateTaskBriefId("");
                setCreateTaskPageId("");
              }}
              required
            >
              <option value="" disabled>
                {projects.length === 0 ? "Create/select a project first" : "Select project"}
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.slug})
                </option>
              ))}
            </select>
          </label>

          <label>
            Brief (optional)
            <select value={createTaskBriefId} onChange={(event) => setCreateTaskBriefId(event.target.value)}>
              <option value="">No linked brief</option>
              {briefsForTaskProject.map((brief) => (
                <option key={brief.id} value={brief.id}>
                  {brief.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            Page (optional)
            <select value={createTaskPageId} onChange={(event) => setCreateTaskPageId(event.target.value)}>
              <option value="">No linked page</option>
              {pagesForTaskProject.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Type
            <select value={createTaskType} onChange={(event) => setCreateTaskType(event.target.value as TaskType)}>
              <option value="WRITE">WRITE</option>
              <option value="OPTIMIZE">OPTIMIZE</option>
              <option value="REFRESH">REFRESH</option>
              <option value="INTERNAL_LINKS">INTERNAL_LINKS</option>
              <option value="OUTREACH">OUTREACH</option>
            </select>
          </label>

          <label>
            Initial Status
            <select value={createTaskStatus} onChange={(event) => setCreateTaskStatus(event.target.value as TaskStatus)}>
              <option value="TODO">TODO</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="BLOCKED">BLOCKED</option>
              <option value="DONE">DONE</option>
              <option value="FAILED">FAILED</option>
            </select>
          </label>

          <label>
            Priority (1-5)
            <input type="number" min={1} max={5} value={createTaskPriority} onChange={(event) => setCreateTaskPriority(event.target.value)} required />
          </label>

          <label>
            Due At (optional)
            <input type="datetime-local" value={createTaskDueAt} onChange={(event) => setCreateTaskDueAt(event.target.value)} />
          </label>

          <label>
            Payload JSON (optional object)
            <textarea value={createTaskPayload} onChange={(event) => setCreateTaskPayload(event.target.value)} rows={3} />
          </label>

          <label>
            Initial error text (optional)
            <textarea value={createTaskErrorText} onChange={(event) => setCreateTaskErrorText(event.target.value)} rows={2} />
          </label>

          <button type="submit" disabled={!token || creatingTask || projects.length === 0}>
            {creatingTask ? "Creating..." : "Create Task"}
          </button>

          {createTaskError ? <p className="error">{createTaskError}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Content Tasks</h2>
          <button type="button" onClick={() => void loadTasks()} disabled={!token || tasksLoading}>
            Refresh
          </button>
        </div>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setTaskPage(1);
          }}
        >
          <label>
            Filter by project
            <select
              value={taskProjectFilterId}
              onChange={(event) => {
                setTaskProjectFilterId(event.target.value);
                setTaskBriefFilterId("");
                setTaskPageFilterId("");
                setTaskPage(1);
              }}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.slug})
                </option>
              ))}
            </select>
          </label>

          <label>
            Filter by brief
            <select
              value={taskBriefFilterId}
              onChange={(event) => {
                setTaskBriefFilterId(event.target.value);
                setTaskPage(1);
              }}
              disabled={briefsForTaskFilterProject.length === 0}
            >
              <option value="">All briefs</option>
              {briefsForTaskFilterProject.map((brief) => (
                <option key={brief.id} value={brief.id}>
                  {brief.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            Filter by page
            <select
              value={taskPageFilterId}
              onChange={(event) => {
                setTaskPageFilterId(event.target.value);
                setTaskPage(1);
              }}
              disabled={pagesForTaskFilterProject.length === 0}
            >
              <option value="">All pages</option>
              {pagesForTaskFilterProject.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={taskStatusFilter}
              onChange={(event) => {
                setTaskStatusFilter(event.target.value as "" | TaskStatus);
                setTaskPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="TODO">TODO</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="BLOCKED">BLOCKED</option>
              <option value="DONE">DONE</option>
              <option value="FAILED">FAILED</option>
            </select>
          </label>

          <label>
            Type
            <select
              value={taskTypeFilter}
              onChange={(event) => {
                setTaskTypeFilter(event.target.value as "" | TaskType);
                setTaskPage(1);
              }}
            >
              <option value="">All types</option>
              <option value="WRITE">WRITE</option>
              <option value="OPTIMIZE">OPTIMIZE</option>
              <option value="REFRESH">REFRESH</option>
              <option value="INTERNAL_LINKS">INTERNAL_LINKS</option>
              <option value="OUTREACH">OUTREACH</option>
            </select>
          </label>

          <label>
            Search error/brief title/page path
            <input
              value={taskQuery}
              onChange={(event) => {
                setTaskQuery(event.target.value);
                setTaskPage(1);
              }}
            />
          </label>

          <label>
            Sort
            <select
              value={taskSort}
              onChange={(event) => {
                setTaskSort(event.target.value as typeof taskSort);
                setTaskPage(1);
              }}
            >
              <option value="createdAt_desc">Created newest</option>
              <option value="createdAt_asc">Created oldest</option>
              <option value="updatedAt_desc">Updated newest</option>
              <option value="updatedAt_asc">Updated oldest</option>
              <option value="priority_asc">Priority low-high</option>
              <option value="priority_desc">Priority high-low</option>
              <option value="dueAt_asc">Due date soonest</option>
              <option value="dueAt_desc">Due date latest</option>
            </select>
          </label>
        </form>

        <p className="muted">{tasksLoading ? "Loading..." : `${tasksMeta.total} total tasks`}</p>
        {tasksError ? <p className="error">{tasksError}</p> : null}

        {!tasksError && tasks.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Project</th>
                  <th>Brief</th>
                  <th>Page</th>
                  <th>Due</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.type}</td>
                    <td>{task.status}</td>
                    <td>{task.priority}</td>
                    <td>{task.project.name}</td>
                    <td>{task.brief?.title ?? "—"}</td>
                    <td>{task.page?.path ?? "—"}</td>
                    <td>{task.dueAt ? new Date(task.dueAt).toLocaleString() : "—"}</td>
                    <td>{new Date(task.updatedAt).toLocaleString()}</td>
                    <td>
                      <button type="button" onClick={() => setSelectedTaskId(task.id)}>
                        View / Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="panel-header">
          <button type="button" onClick={() => setTaskPage((prev) => Math.max(1, prev - 1))} disabled={!tasksCanPrev}>
            Previous
          </button>
          <p className="muted">
            Page {tasksMeta.page} of {Math.max(tasksMeta.totalPages, 1)}
          </p>
          <button type="button" onClick={() => setTaskPage((prev) => prev + 1)} disabled={!tasksCanNext}>
            Next
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Content Task Detail + Workflow</h2>
        {!selectedTask ? <p className="muted">Select a task to edit and transition status.</p> : null}

        {selectedTask ? (
          <>
            <form className="form" onSubmit={handleUpdateTask}>
              <p className="muted">
                Project: <strong>{selectedTask.project.name}</strong> | Current status: <strong>{selectedTask.status}</strong>
              </p>

              <label>
                Brief
                <select value={editTaskBriefId} onChange={(event) => setEditTaskBriefId(event.target.value)}>
                  <option value="">No linked brief</option>
                  {briefsForSelectedTaskProject.map((brief) => (
                    <option key={brief.id} value={brief.id}>
                      {brief.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Page
                <select value={editTaskPageId} onChange={(event) => setEditTaskPageId(event.target.value)}>
                  <option value="">No linked page</option>
                  {pagesForSelectedTaskProject.map((pageItem) => (
                    <option key={pageItem.id} value={pageItem.id}>
                      {pageItem.path}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Type
                <select value={editTaskType} onChange={(event) => setEditTaskType(event.target.value as TaskType)}>
                  <option value="WRITE">WRITE</option>
                  <option value="OPTIMIZE">OPTIMIZE</option>
                  <option value="REFRESH">REFRESH</option>
                  <option value="INTERNAL_LINKS">INTERNAL_LINKS</option>
                  <option value="OUTREACH">OUTREACH</option>
                </select>
              </label>

              <label>
                Priority (1-5)
                <input type="number" min={1} max={5} value={editTaskPriority} onChange={(event) => setEditTaskPriority(event.target.value)} required />
              </label>

              <label>
                Due At
                <input type="datetime-local" value={editTaskDueAt} onChange={(event) => setEditTaskDueAt(event.target.value)} />
              </label>

              <label>
                Payload JSON (blank clears)
                <textarea value={editTaskPayload} onChange={(event) => setEditTaskPayload(event.target.value)} rows={3} />
              </label>

              <label>
                Result JSON (blank clears)
                <textarea value={editTaskResult} onChange={(event) => setEditTaskResult(event.target.value)} rows={3} />
              </label>

              <label>
                Error text (blank clears)
                <textarea value={editTaskErrorText} onChange={(event) => setEditTaskErrorText(event.target.value)} rows={2} />
              </label>

              <div className="panel-header">
                <button type="submit" disabled={updatingTask || deletingTask || transitioningTask}>
                  {updatingTask ? "Saving..." : "Save task details"}
                </button>
                <button type="button" onClick={handleDeleteTask} disabled={updatingTask || deletingTask || transitioningTask}>
                  {deletingTask ? "Deleting..." : "Delete task"}
                </button>
              </div>
            </form>

            <form className="form" onSubmit={handleTransitionTask}>
              <h3>Transition Status</h3>

              <label>
                Next status
                <select value={transitionTaskStatus} onChange={(event) => setTransitionTaskStatus(event.target.value as TaskStatus)}>
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="BLOCKED">BLOCKED</option>
                  <option value="DONE">DONE</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </label>

              <label>
                Transition result JSON (optional)
                <textarea value={transitionTaskResult} onChange={(event) => setTransitionTaskResult(event.target.value)} rows={3} />
              </label>

              <label>
                Transition error text (optional)
                <textarea value={transitionTaskErrorText} onChange={(event) => setTransitionTaskErrorText(event.target.value)} rows={2} />
              </label>

              <button type="submit" disabled={transitioningTask || updatingTask || deletingTask}>
                {transitioningTask ? "Transitioning..." : "Apply status transition"}
              </button>
            </form>

            {editTaskError ? <p className="error">{editTaskError}</p> : null}
          </>
        ) : null}
      </section>
    </>
  );
}
