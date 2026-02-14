"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Phase8ContentOpsPanel } from "./Phase8ContentOpsPanel";
import { Phase9LinkOpsPanel } from "./Phase9LinkOpsPanel";
import { Phase10AnalyticsPanel } from "./Phase10AnalyticsPanel";
import { Phase11AutomationPanel } from "./Phase11AutomationPanel";

type User = {
  id: string;
  email: string;
  authMode?: string;
};

type ProjectStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
type PageStatus = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
type DeviceType = "DESKTOP" | "MOBILE";
type KeywordIntent = "INFORMATIONAL" | "COMMERCIAL" | "TRANSACTIONAL" | "NAVIGATIONAL";
type SearchEngine = "GOOGLE" | "BING";

type Project = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  domain: string | null;
  status: ProjectStatus;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

type SeoPage = {
  id: string;
  projectId: string;
  project: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
  };
  url: string;
  path: string;
  title: string | null;
  metaDescription: string | null;
  status: PageStatus;
  lastPublishedAt: string | null;
  lastCrawledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Keyword = {
  id: string;
  projectId: string;
  pageId: string | null;
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
  term: string;
  intent: KeywordIntent | null;
  locale: string;
  device: DeviceType;
  isActive: boolean;
  difficulty: number | null;
  cpc: string | null;
  searchVolume: number | null;
  createdAt: string;
  updatedAt: string;
};

type RankSnapshot = {
  id: string;
  projectId: string;
  keywordId: string;
  project: {
    id: string;
    name: string;
    slug: string;
  };
  keyword: {
    id: string;
    term: string;
    projectId: string;
    pageId: string | null;
  };
  recordedAt: string;
  engine: SearchEngine;
  locale: string;
  device: DeviceType;
  rank: number | null;
  url: string | null;
  serpFeatures: unknown;
  createdAt: string;
};

type SortOption = "createdAt_desc" | "createdAt_asc" | "name_asc" | "name_desc";
type PageSortOption = "createdAt_desc" | "createdAt_asc" | "path_asc" | "path_desc";
type KeywordSortOption = "createdAt_desc" | "createdAt_asc" | "term_asc" | "term_desc" | "updatedAt_desc" | "updatedAt_asc";
type RankSnapshotSortOption =
  | "recordedAt_desc"
  | "recordedAt_asc"
  | "createdAt_desc"
  | "createdAt_asc"
  | "rank_asc"
  | "rank_desc";

type ApiError = {
  code: string;
  message: string;
};

type ListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ListProjectsResponse = {
  data?: Project[];
  meta?: ListMeta;
  error?: ApiError;
};

type ListPagesResponse = {
  data?: SeoPage[];
  meta?: ListMeta;
  error?: ApiError;
};

type ListKeywordsResponse = {
  data?: Keyword[];
  meta?: ListMeta;
  error?: ApiError;
};

type ListRankSnapshotsResponse = {
  data?: RankSnapshot[];
  meta?: ListMeta;
  error?: ApiError;
};

type AuthResponse = {
  data?: {
    token: string;
    user: User;
  };
  error?: ApiError;
};

type MeResponse = {
  data?: User;
  error?: ApiError;
};

type SingleProjectResponse = {
  data?: Project;
  error?: ApiError;
};

type SinglePageResponse = {
  data?: SeoPage;
  error?: ApiError;
};

type SingleKeywordResponse = {
  data?: Keyword;
  error?: ApiError;
};

type SingleRankSnapshotResponse = {
  data?: RankSnapshot;
  error?: ApiError;
};

const TOKEN_KEY = "seo_engine_token";
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

export function ProjectsDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsMeta, setProjectsMeta] = useState<ListMeta>(createEmptyMeta(20));
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [createProjectName, setCreateProjectName] = useState("");
  const [createProjectDomain, setCreateProjectDomain] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);

  const [projectSearchInput, setProjectSearchInput] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [projectsPage, setProjectsPage] = useState(1);
  const [projectsLimit, setProjectsLimit] = useState(20);
  const [projectsSort, setProjectsSort] = useState<SortOption>("createdAt_desc");

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectDetailLoading, setProjectDetailLoading] = useState(false);
  const [projectDetailError, setProjectDetailError] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDomain, setEditProjectDomain] = useState("");
  const [editProjectStatus, setEditProjectStatus] = useState<ProjectStatus>("ACTIVE");
  const [editProjectTimezone, setEditProjectTimezone] = useState("UTC");
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const [pages, setPages] = useState<SeoPage[]>([]);
  const [pagesMeta, setPagesMeta] = useState<ListMeta>(createEmptyMeta(20));
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);

  const [createPageProjectId, setCreatePageProjectId] = useState("");
  const [createPagePath, setCreatePagePath] = useState("");
  const [createPageTitle, setCreatePageTitle] = useState("");
  const [createPageMetaDescription, setCreatePageMetaDescription] = useState("");
  const [createPageUrl, setCreatePageUrl] = useState("");
  const [createPageStatus, setCreatePageStatus] = useState<PageStatus>("DRAFT");
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [createPageError, setCreatePageError] = useState<string | null>(null);

  const [pageSearchInput, setPageSearchInput] = useState("");
  const [pageQuery, setPageQuery] = useState("");
  const [pagesPage, setPagesPage] = useState(1);
  const [pagesLimit, setPagesLimit] = useState(20);
  const [pagesSort, setPagesSort] = useState<PageSortOption>("createdAt_desc");
  const [pagesProjectFilterId, setPagesProjectFilterId] = useState("");

  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<SeoPage | null>(null);
  const [pageDetailLoading, setPageDetailLoading] = useState(false);
  const [pageDetailError, setPageDetailError] = useState<string | null>(null);
  const [editPagePath, setEditPagePath] = useState("");
  const [editPageTitle, setEditPageTitle] = useState("");
  const [editPageMetaDescription, setEditPageMetaDescription] = useState("");
  const [editPageUrl, setEditPageUrl] = useState("");
  const [editPageStatus, setEditPageStatus] = useState<PageStatus>("DRAFT");
  const [isUpdatingPage, setIsUpdatingPage] = useState(false);
  const [isDeletingPage, setIsDeletingPage] = useState(false);

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [keywordsMeta, setKeywordsMeta] = useState<ListMeta>(createEmptyMeta(20));
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [keywordsError, setKeywordsError] = useState<string | null>(null);

  const [createKeywordProjectId, setCreateKeywordProjectId] = useState("");
  const [createKeywordPageId, setCreateKeywordPageId] = useState("");
  const [createKeywordTerm, setCreateKeywordTerm] = useState("");
  const [createKeywordLocale, setCreateKeywordLocale] = useState("en-US");
  const [createKeywordDevice, setCreateKeywordDevice] = useState<DeviceType>("DESKTOP");
  const [createKeywordIntent, setCreateKeywordIntent] = useState<"" | KeywordIntent>("");
  const [createKeywordIsActive, setCreateKeywordIsActive] = useState(true);
  const [isCreatingKeyword, setIsCreatingKeyword] = useState(false);
  const [createKeywordError, setCreateKeywordError] = useState<string | null>(null);

  const [keywordSearchInput, setKeywordSearchInput] = useState("");
  const [keywordQuery, setKeywordQuery] = useState("");
  const [keywordsPage, setKeywordsPage] = useState(1);
  const [keywordsLimit, setKeywordsLimit] = useState(20);
  const [keywordsSort, setKeywordsSort] = useState<KeywordSortOption>("createdAt_desc");
  const [keywordsProjectFilterId, setKeywordsProjectFilterId] = useState("");
  const [keywordsPageFilterId, setKeywordsPageFilterId] = useState("");
  const [keywordsLocaleFilter, setKeywordsLocaleFilter] = useState("");
  const [keywordsDeviceFilter, setKeywordsDeviceFilter] = useState<"" | DeviceType>("");
  const [keywordsIsActiveFilter, setKeywordsIsActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState<Keyword | null>(null);
  const [keywordDetailLoading, setKeywordDetailLoading] = useState(false);
  const [keywordDetailError, setKeywordDetailError] = useState<string | null>(null);
  const [editKeywordPageId, setEditKeywordPageId] = useState<string>("");
  const [editKeywordTerm, setEditKeywordTerm] = useState("");
  const [editKeywordLocale, setEditKeywordLocale] = useState("en-US");
  const [editKeywordDevice, setEditKeywordDevice] = useState<DeviceType>("DESKTOP");
  const [editKeywordIntent, setEditKeywordIntent] = useState<"" | KeywordIntent>("");
  const [editKeywordIsActive, setEditKeywordIsActive] = useState(true);
  const [isUpdatingKeyword, setIsUpdatingKeyword] = useState(false);
  const [isDeletingKeyword, setIsDeletingKeyword] = useState(false);

  const [rankSnapshots, setRankSnapshots] = useState<RankSnapshot[]>([]);
  const [rankSnapshotsMeta, setRankSnapshotsMeta] = useState<ListMeta>(createEmptyMeta(20));
  const [rankSnapshotsLoading, setRankSnapshotsLoading] = useState(false);
  const [rankSnapshotsError, setRankSnapshotsError] = useState<string | null>(null);

  const [createSnapshotKeywordId, setCreateSnapshotKeywordId] = useState("");
  const [createSnapshotRank, setCreateSnapshotRank] = useState("");
  const [createSnapshotEngine, setCreateSnapshotEngine] = useState<SearchEngine>("GOOGLE");
  const [createSnapshotLocale, setCreateSnapshotLocale] = useState("en-US");
  const [createSnapshotDevice, setCreateSnapshotDevice] = useState<DeviceType>("DESKTOP");
  const [createSnapshotRecordedAt, setCreateSnapshotRecordedAt] = useState("");
  const [createSnapshotUrl, setCreateSnapshotUrl] = useState("");
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [createSnapshotError, setCreateSnapshotError] = useState<string | null>(null);

  const [rankSnapshotsPage, setRankSnapshotsPage] = useState(1);
  const [rankSnapshotsLimit, setRankSnapshotsLimit] = useState(20);
  const [rankSnapshotsSort, setRankSnapshotsSort] = useState<RankSnapshotSortOption>("recordedAt_desc");
  const [rankSnapshotsProjectFilterId, setRankSnapshotsProjectFilterId] = useState("");
  const [rankSnapshotsKeywordFilterId, setRankSnapshotsKeywordFilterId] = useState("");
  const [rankSnapshotsEngineFilter, setRankSnapshotsEngineFilter] = useState<"" | SearchEngine>("");
  const [rankSnapshotsLocaleFilter, setRankSnapshotsLocaleFilter] = useState("");
  const [rankSnapshotsDeviceFilter, setRankSnapshotsDeviceFilter] = useState<"" | DeviceType>("");
  const [rankSnapshotsFrom, setRankSnapshotsFrom] = useState("");
  const [rankSnapshotsTo, setRankSnapshotsTo] = useState("");

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!token) {
        throw new Error("Please login first.");
      }

      const headers = new Headers(init?.headers ?? {});
      headers.set("Authorization", `Bearer ${token}`);

      return fetch(`${apiBase}${path}`, {
        ...init,
        headers
      });
    },
    [token]
  );

  const saveAuth = useCallback((newToken: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(nextUser);
  }, []);

  const loadMe = useCallback(async (existingToken: string) => {
    try {
      const response = await fetch(`${apiBase}/auth/me`, {
        headers: {
          Authorization: `Bearer ${existingToken}`
        },
        cache: "no-store"
      });

      const payload = (await parseJson<MeResponse>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setUser(payload.data);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const existingToken = localStorage.getItem(TOKEN_KEY);
    if (existingToken) {
      setToken(existingToken);
      void loadMe(existingToken);
    }
  }, [loadMe]);

  const loadProjects = useCallback(async () => {
    if (!token) {
      setProjects([]);
      setProjectsMeta(createEmptyMeta(projectsLimit));
      setProjectsLoading(false);
      return;
    }

    setProjectsLoading(true);
    setProjectsError(null);

    try {
      const params = new URLSearchParams({
        page: String(projectsPage),
        limit: String(projectsLimit),
        sort: projectsSort
      });

      if (projectQuery.trim()) {
        params.set("q", projectQuery.trim());
      }

      const response = await authFetch(`/v1/projects?${params.toString()}`, {
        cache: "no-store"
      });
      const payload = (await parseJson<ListProjectsResponse>(response)) ?? undefined;

      if (!response.ok || !payload?.data || !payload.meta) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setProjects(payload.data);
      setProjectsMeta(payload.meta);

      if (selectedProjectId && !payload.data.some((project) => project.id === selectedProjectId)) {
        setSelectedProjectId(null);
        setSelectedProject(null);
      }
    } catch (loadError) {
      setProjects([]);
      setProjectsMeta(createEmptyMeta(projectsLimit));
      setProjectsError(loadError instanceof Error ? loadError.message : "Failed to load projects");
    } finally {
      setProjectsLoading(false);
    }
  }, [authFetch, projectQuery, projectsLimit, projectsPage, projectsSort, selectedProjectId, token]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const loadProjectDetail = useCallback(
    async (projectId: string) => {
      setProjectDetailLoading(true);
      setProjectDetailError(null);

      try {
        const response = await authFetch(`/v1/projects/${projectId}`, {
          cache: "no-store"
        });
        const payload = (await parseJson<SingleProjectResponse>(response)) ?? undefined;

        if (!response.ok || !payload?.data) {
          throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
        }

        setSelectedProject(payload.data);
        setEditProjectName(payload.data.name);
        setEditProjectDomain(payload.data.domain ?? "");
        setEditProjectStatus(payload.data.status);
        setEditProjectTimezone(payload.data.timezone);
      } catch (detailError) {
        setSelectedProject(null);
        setProjectDetailError(detailError instanceof Error ? detailError.message : "Failed to load project details");
      } finally {
        setProjectDetailLoading(false);
      }
    },
    [authFetch]
  );

  const loadPages = useCallback(async () => {
    if (!token) {
      setPages([]);
      setPagesMeta(createEmptyMeta(pagesLimit));
      setPagesLoading(false);
      return;
    }

    setPagesLoading(true);
    setPagesError(null);

    try {
      const params = new URLSearchParams({
        page: String(pagesPage),
        limit: String(pagesLimit),
        sort: pagesSort
      });

      if (pageQuery.trim()) {
        params.set("q", pageQuery.trim());
      }

      if (pagesProjectFilterId.trim()) {
        params.set("projectId", pagesProjectFilterId.trim());
      }

      const response = await authFetch(`/v1/pages?${params.toString()}`, {
        cache: "no-store"
      });
      const payload = (await parseJson<ListPagesResponse>(response)) ?? undefined;

      if (!response.ok || !payload?.data || !payload.meta) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setPages(payload.data);
      setPagesMeta(payload.meta);

      if (selectedPageId && !payload.data.some((page) => page.id === selectedPageId)) {
        setSelectedPageId(null);
        setSelectedPage(null);
      }
    } catch (loadError) {
      setPages([]);
      setPagesMeta(createEmptyMeta(pagesLimit));
      setPagesError(loadError instanceof Error ? loadError.message : "Failed to load pages");
    } finally {
      setPagesLoading(false);
    }
  }, [authFetch, pageQuery, pagesLimit, pagesPage, pagesProjectFilterId, pagesSort, selectedPageId, token]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const loadPageDetail = useCallback(
    async (pageId: string) => {
      setPageDetailLoading(true);
      setPageDetailError(null);

      try {
        const response = await authFetch(`/v1/pages/${pageId}`, {
          cache: "no-store"
        });
        const payload = (await parseJson<SinglePageResponse>(response)) ?? undefined;

        if (!response.ok || !payload?.data) {
          throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
        }

        setSelectedPage(payload.data);
        setEditPagePath(payload.data.path);
        setEditPageTitle(payload.data.title ?? "");
        setEditPageMetaDescription(payload.data.metaDescription ?? "");
        setEditPageUrl(payload.data.url);
        setEditPageStatus(payload.data.status);
      } catch (detailError) {
        setSelectedPage(null);
        setPageDetailError(detailError instanceof Error ? detailError.message : "Failed to load page details");
      } finally {
        setPageDetailLoading(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    if (!token) {
      setCreatePageProjectId("");
      return;
    }

    if (createPageProjectId && projects.some((project) => project.id === createPageProjectId)) {
      return;
    }

    if (selectedProject?.id) {
      setCreatePageProjectId(selectedProject.id);
      return;
    }

    if (projects.length > 0) {
      setCreatePageProjectId(projects[0].id);
    }
  }, [createPageProjectId, projects, selectedProject, token]);

  const loadKeywords = useCallback(async () => {
    if (!token) {
      setKeywords([]);
      setKeywordsMeta(createEmptyMeta(keywordsLimit));
      setKeywordsLoading(false);
      return;
    }

    setKeywordsLoading(true);
    setKeywordsError(null);

    try {
      const params = new URLSearchParams({
        page: String(keywordsPage),
        limit: String(keywordsLimit),
        sort: keywordsSort
      });

      if (keywordQuery.trim()) {
        params.set("q", keywordQuery.trim());
      }

      if (keywordsProjectFilterId.trim()) {
        params.set("projectId", keywordsProjectFilterId.trim());
      }

      if (keywordsPageFilterId.trim()) {
        params.set("pageId", keywordsPageFilterId.trim());
      }

      if (keywordsLocaleFilter.trim()) {
        params.set("locale", keywordsLocaleFilter.trim());
      }

      if (keywordsDeviceFilter) {
        params.set("device", keywordsDeviceFilter);
      }

      if (keywordsIsActiveFilter === "active") {
        params.set("isActive", "true");
      } else if (keywordsIsActiveFilter === "inactive") {
        params.set("isActive", "false");
      }

      const response = await authFetch(`/v1/keywords?${params.toString()}`, {
        cache: "no-store"
      });
      const payload = (await parseJson<ListKeywordsResponse>(response)) ?? undefined;

      if (!response.ok || !payload?.data || !payload.meta) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setKeywords(payload.data);
      setKeywordsMeta(payload.meta);

      if (selectedKeywordId && !payload.data.some((keyword) => keyword.id === selectedKeywordId)) {
        setSelectedKeywordId(null);
        setSelectedKeyword(null);
      }
    } catch (loadError) {
      setKeywords([]);
      setKeywordsMeta(createEmptyMeta(keywordsLimit));
      setKeywordsError(loadError instanceof Error ? loadError.message : "Failed to load keywords");
    } finally {
      setKeywordsLoading(false);
    }
  }, [
    authFetch,
    keywordQuery,
    keywordsDeviceFilter,
    keywordsIsActiveFilter,
    keywordsLimit,
    keywordsLocaleFilter,
    keywordsPage,
    keywordsPageFilterId,
    keywordsProjectFilterId,
    keywordsSort,
    selectedKeywordId,
    token
  ]);

  useEffect(() => {
    void loadKeywords();
  }, [loadKeywords]);

  const loadKeywordDetail = useCallback(
    async (keywordId: string) => {
      setKeywordDetailLoading(true);
      setKeywordDetailError(null);

      try {
        const response = await authFetch(`/v1/keywords/${keywordId}`, {
          cache: "no-store"
        });
        const payload = (await parseJson<SingleKeywordResponse>(response)) ?? undefined;

        if (!response.ok || !payload?.data) {
          throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
        }

        setSelectedKeyword(payload.data);
        setEditKeywordPageId(payload.data.pageId ?? "");
        setEditKeywordTerm(payload.data.term);
        setEditKeywordLocale(payload.data.locale);
        setEditKeywordDevice(payload.data.device);
        setEditKeywordIntent(payload.data.intent ?? "");
        setEditKeywordIsActive(payload.data.isActive);
      } catch (detailError) {
        setSelectedKeyword(null);
        setKeywordDetailError(detailError instanceof Error ? detailError.message : "Failed to load keyword details");
      } finally {
        setKeywordDetailLoading(false);
      }
    },
    [authFetch]
  );

  const loadRankSnapshots = useCallback(async () => {
    if (!token) {
      setRankSnapshots([]);
      setRankSnapshotsMeta(createEmptyMeta(rankSnapshotsLimit));
      setRankSnapshotsLoading(false);
      return;
    }

    setRankSnapshotsLoading(true);
    setRankSnapshotsError(null);

    try {
      const params = new URLSearchParams({
        page: String(rankSnapshotsPage),
        limit: String(rankSnapshotsLimit),
        sort: rankSnapshotsSort
      });

      if (rankSnapshotsProjectFilterId.trim()) {
        params.set("projectId", rankSnapshotsProjectFilterId.trim());
      }

      if (rankSnapshotsKeywordFilterId.trim()) {
        params.set("keywordId", rankSnapshotsKeywordFilterId.trim());
      }

      if (rankSnapshotsEngineFilter) {
        params.set("engine", rankSnapshotsEngineFilter);
      }

      if (rankSnapshotsLocaleFilter.trim()) {
        params.set("locale", rankSnapshotsLocaleFilter.trim());
      }

      if (rankSnapshotsDeviceFilter) {
        params.set("device", rankSnapshotsDeviceFilter);
      }

      if (rankSnapshotsFrom.trim()) {
        params.set("from", rankSnapshotsFrom.trim());
      }

      if (rankSnapshotsTo.trim()) {
        params.set("to", rankSnapshotsTo.trim());
      }

      const response = await authFetch(`/v1/rank-snapshots?${params.toString()}`, {
        cache: "no-store"
      });
      const payload = (await parseJson<ListRankSnapshotsResponse>(response)) ?? undefined;

      if (!response.ok || !payload?.data || !payload.meta) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setRankSnapshots(payload.data);
      setRankSnapshotsMeta(payload.meta);
    } catch (loadError) {
      setRankSnapshots([]);
      setRankSnapshotsMeta(createEmptyMeta(rankSnapshotsLimit));
      setRankSnapshotsError(loadError instanceof Error ? loadError.message : "Failed to load rank snapshots");
    } finally {
      setRankSnapshotsLoading(false);
    }
  }, [
    authFetch,
    rankSnapshotsDeviceFilter,
    rankSnapshotsEngineFilter,
    rankSnapshotsFrom,
    rankSnapshotsKeywordFilterId,
    rankSnapshotsLimit,
    rankSnapshotsLocaleFilter,
    rankSnapshotsPage,
    rankSnapshotsProjectFilterId,
    rankSnapshotsSort,
    rankSnapshotsTo,
    token
  ]);

  useEffect(() => {
    void loadRankSnapshots();
  }, [loadRankSnapshots]);

  useEffect(() => {
    if (!token) {
      setCreateKeywordProjectId("");
      setCreateKeywordPageId("");
      return;
    }

    if (createKeywordProjectId && projects.some((project) => project.id === createKeywordProjectId)) {
      return;
    }

    if (selectedProject?.id) {
      setCreateKeywordProjectId(selectedProject.id);
      setCreateKeywordPageId("");
      return;
    }

    if (projects.length > 0) {
      setCreateKeywordProjectId(projects[0].id);
      setCreateKeywordPageId("");
    }
  }, [createKeywordProjectId, projects, selectedProject, token]);

  useEffect(() => {
    if (!token) {
      setCreateSnapshotKeywordId("");
      return;
    }

    if (createSnapshotKeywordId && keywords.some((keyword) => keyword.id === createSnapshotKeywordId)) {
      return;
    }

    if (selectedKeyword?.id) {
      setCreateSnapshotKeywordId(selectedKeyword.id);
      return;
    }

    if (keywords.length > 0) {
      setCreateSnapshotKeywordId(keywords[0].id);
    }
  }, [createSnapshotKeywordId, keywords, selectedKeyword, token]);

  useEffect(() => {
    if (!rankSnapshotsKeywordFilterId) {
      return;
    }

    const matchesProject = keywords.some(
      (keyword) =>
        keyword.id === rankSnapshotsKeywordFilterId &&
        (!rankSnapshotsProjectFilterId || keyword.projectId === rankSnapshotsProjectFilterId)
    );

    if (!matchesProject) {
      setRankSnapshotsKeywordFilterId("");
    }
  }, [keywords, rankSnapshotsKeywordFilterId, rankSnapshotsProjectFilterId]);

  const pagesForCreateKeywordProject = useMemo(
    () => pages.filter((pageItem) => pageItem.projectId === createKeywordProjectId),
    [createKeywordProjectId, pages]
  );

  const pagesForSelectedKeywordProject = useMemo(
    () => pages.filter((pageItem) => pageItem.projectId === (selectedKeyword?.projectId ?? "")),
    [pages, selectedKeyword?.projectId]
  );

  const pagesForKeywordFilterProject = useMemo(
    () => pages.filter((pageItem) => !keywordsProjectFilterId || pageItem.projectId === keywordsProjectFilterId),
    [keywordsProjectFilterId, pages]
  );

  const keywordsForRankSnapshotProject = useMemo(
    () => keywords.filter((keyword) => !rankSnapshotsProjectFilterId || keyword.projectId === rankSnapshotsProjectFilterId),
    [keywords, rankSnapshotsProjectFilterId]
  );

  const projectsTotalLabel = useMemo(() => {
    if (!token) return "Login to load projects.";
    if (projectsLoading) return "Loading projects...";
    return `${projectsMeta.total} total project${projectsMeta.total === 1 ? "" : "s"}`;
  }, [projectsLoading, projectsMeta.total, token]);

  const pagesTotalLabel = useMemo(() => {
    if (!token) return "Login to load pages.";
    if (pagesLoading) return "Loading pages...";
    return `${pagesMeta.total} total page${pagesMeta.total === 1 ? "" : "s"}`;
  }, [pagesLoading, pagesMeta.total, token]);

  const keywordsTotalLabel = useMemo(() => {
    if (!token) return "Login to load keywords.";
    if (keywordsLoading) return "Loading keywords...";
    return `${keywordsMeta.total} total keyword${keywordsMeta.total === 1 ? "" : "s"}`;
  }, [keywordsLoading, keywordsMeta.total, token]);

  const rankSnapshotsTotalLabel = useMemo(() => {
    if (!token) return "Login to load rank snapshots.";
    if (rankSnapshotsLoading) return "Loading rank snapshots...";
    return `${rankSnapshotsMeta.total} total snapshot${rankSnapshotsMeta.total === 1 ? "" : "s"}`;
  }, [rankSnapshotsLoading, rankSnapshotsMeta.total, token]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setAuthError(null);
    setAuthLoading(true);

    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword
        })
      });

      const payload = (await parseJson<AuthResponse>(response)) ?? undefined;

      if (!response.ok || !payload?.data?.token || !payload.data.user) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      saveAuth(payload.data.token, payload.data.user);
      setAuthPassword("");
      setProjectsPage(1);
      setPagesPage(1);
      setKeywordsPage(1);
      setRankSnapshotsPage(1);
    } catch (authSubmitError) {
      setAuthError(authSubmitError instanceof Error ? authSubmitError.message : "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);

    setProjects([]);
    setProjectsMeta(createEmptyMeta(projectsLimit));
    setProjectsError(null);
    setSelectedProjectId(null);
    setSelectedProject(null);
    setProjectDetailError(null);

    setPages([]);
    setPagesMeta(createEmptyMeta(pagesLimit));
    setPagesError(null);
    setSelectedPageId(null);
    setSelectedPage(null);
    setPageDetailError(null);
    setCreatePageProjectId("");

    setKeywords([]);
    setKeywordsMeta(createEmptyMeta(keywordsLimit));
    setKeywordsError(null);
    setSelectedKeywordId(null);
    setSelectedKeyword(null);
    setKeywordDetailError(null);
    setCreateKeywordProjectId("");
    setCreateKeywordPageId("");

    setRankSnapshots([]);
    setRankSnapshotsMeta(createEmptyMeta(rankSnapshotsLimit));
    setRankSnapshotsError(null);
    setCreateSnapshotKeywordId("");
    setCreateSnapshotUrl("");
    setRankSnapshotsProjectFilterId("");
    setRankSnapshotsKeywordFilterId("");
    setRankSnapshotsEngineFilter("");
    setRankSnapshotsLocaleFilter("");
    setRankSnapshotsDeviceFilter("");
    setRankSnapshotsFrom("");
    setRankSnapshotsTo("");
  };

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createProjectName.trim()) {
      setCreateProjectError("Project name is required.");
      return;
    }

    setIsCreatingProject(true);
    setCreateProjectError(null);

    try {
      const response = await authFetch("/v1/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: createProjectName.trim(),
          ...(createProjectDomain.trim() ? { domain: createProjectDomain.trim() } : {})
        })
      });

      const payload = (await parseJson<SingleProjectResponse>(response)) ?? undefined;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setCreateProjectName("");
      setCreateProjectDomain("");

      if (projectsPage !== 1) {
        setProjectsPage(1);
      } else {
        await loadProjects();
      }
    } catch (createError) {
      setCreateProjectError(createError instanceof Error ? createError.message : "Failed to create project");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleProjectSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProjectsPage(1);
    setProjectQuery(projectSearchInput.trim());
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    void loadProjectDetail(projectId);
  };

  const handleProjectUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedProject) return;

    setIsUpdatingProject(true);
    setProjectDetailError(null);

    try {
      const response = await authFetch(`/v1/projects/${selectedProject.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: editProjectName.trim(),
          domain: editProjectDomain.trim() ? editProjectDomain.trim() : null,
          status: editProjectStatus,
          timezone: editProjectTimezone.trim() || "UTC"
        })
      });

      const payload = (await parseJson<SingleProjectResponse>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedProject(payload.data);
      await loadProjects();
    } catch (updateError) {
      setProjectDetailError(updateError instanceof Error ? updateError.message : "Failed to update project");
    } finally {
      setIsUpdatingProject(false);
    }
  };

  const handleProjectDelete = async () => {
    if (!selectedProject) return;

    const confirmed = window.confirm(`Delete project "${selectedProject.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setIsDeletingProject(true);
    setProjectDetailError(null);

    try {
      const response = await authFetch(`/v1/projects/${selectedProject.id}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await parseJson<SingleProjectResponse>(response)) ?? undefined;
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedProjectId(null);
      setSelectedProject(null);
      setSelectedPageId(null);
      setSelectedPage(null);
      setSelectedKeywordId(null);
      setSelectedKeyword(null);
      await loadProjects();
      await loadPages();
      await loadKeywords();
      await loadRankSnapshots();
    } catch (deleteError) {
      setProjectDetailError(deleteError instanceof Error ? deleteError.message : "Failed to delete project");
    } finally {
      setIsDeletingProject(false);
    }
  };

  const handleCreatePage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createPageProjectId.trim()) {
      setCreatePageError("Project is required.");
      return;
    }

    if (!createPagePath.trim()) {
      setCreatePageError("Path is required.");
      return;
    }

    setIsCreatingPage(true);
    setCreatePageError(null);

    try {
      const response = await authFetch("/v1/pages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: createPageProjectId.trim(),
          path: createPagePath.trim(),
          title: createPageTitle.trim() || undefined,
          metaDescription: createPageMetaDescription.trim() || undefined,
          url: createPageUrl.trim() || undefined,
          status: createPageStatus
        })
      });

      const payload = (await parseJson<SinglePageResponse>(response)) ?? undefined;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setCreatePagePath("");
      setCreatePageTitle("");
      setCreatePageMetaDescription("");
      setCreatePageUrl("");
      setCreatePageStatus("DRAFT");

      if (pagesPage !== 1) {
        setPagesPage(1);
      } else {
        await loadPages();
      }
    } catch (createError) {
      setCreatePageError(createError instanceof Error ? createError.message : "Failed to create page");
    } finally {
      setIsCreatingPage(false);
    }
  };

  const handlePageSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPagesPage(1);
    setPageQuery(pageSearchInput.trim());
  };

  const handlePageSelect = (pageId: string) => {
    setSelectedPageId(pageId);
    void loadPageDetail(pageId);
  };

  const handlePageUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedPage) return;

    if (!editPagePath.trim()) {
      setPageDetailError("Path is required.");
      return;
    }

    setIsUpdatingPage(true);
    setPageDetailError(null);

    try {
      const response = await authFetch(`/v1/pages/${selectedPage.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path: editPagePath.trim(),
          title: editPageTitle.trim() ? editPageTitle.trim() : null,
          metaDescription: editPageMetaDescription.trim() ? editPageMetaDescription.trim() : null,
          ...(editPageUrl.trim() ? { url: editPageUrl.trim() } : {}),
          status: editPageStatus
        })
      });

      const payload = (await parseJson<SinglePageResponse>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedPage(payload.data);
      setEditPagePath(payload.data.path);
      setEditPageTitle(payload.data.title ?? "");
      setEditPageMetaDescription(payload.data.metaDescription ?? "");
      setEditPageUrl(payload.data.url);
      setEditPageStatus(payload.data.status);
      await loadPages();
    } catch (updateError) {
      setPageDetailError(updateError instanceof Error ? updateError.message : "Failed to update page");
    } finally {
      setIsUpdatingPage(false);
    }
  };

  const handlePageDelete = async () => {
    if (!selectedPage) return;

    const confirmed = window.confirm(`Delete page "${selectedPage.path}"? This cannot be undone.`);
    if (!confirmed) return;

    setIsDeletingPage(true);
    setPageDetailError(null);

    try {
      const response = await authFetch(`/v1/pages/${selectedPage.id}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await parseJson<SinglePageResponse>(response)) ?? undefined;
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedPageId(null);
      setSelectedPage(null);
      await loadPages();
      await loadKeywords();
    } catch (deleteError) {
      setPageDetailError(deleteError instanceof Error ? deleteError.message : "Failed to delete page");
    } finally {
      setIsDeletingPage(false);
    }
  };

  const handleCreateKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createKeywordProjectId.trim()) {
      setCreateKeywordError("Project is required.");
      return;
    }

    if (!createKeywordTerm.trim()) {
      setCreateKeywordError("Keyword term is required.");
      return;
    }

    if (!createKeywordLocale.trim()) {
      setCreateKeywordError("Locale is required.");
      return;
    }

    setIsCreatingKeyword(true);
    setCreateKeywordError(null);

    try {
      const response = await authFetch("/v1/keywords", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: createKeywordProjectId.trim(),
          ...(createKeywordPageId.trim() ? { pageId: createKeywordPageId.trim() } : {}),
          term: createKeywordTerm.trim(),
          locale: createKeywordLocale.trim(),
          device: createKeywordDevice,
          ...(createKeywordIntent ? { intent: createKeywordIntent } : {}),
          isActive: createKeywordIsActive
        })
      });

      const payload = (await parseJson<SingleKeywordResponse>(response)) ?? undefined;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setCreateKeywordTerm("");
      setCreateKeywordPageId("");
      setCreateKeywordIntent("");
      setCreateKeywordLocale("en-US");
      setCreateKeywordDevice("DESKTOP");
      setCreateKeywordIsActive(true);

      if (payload?.data?.id) {
        setCreateSnapshotKeywordId(payload.data.id);
      }

      if (keywordsPage !== 1) {
        setKeywordsPage(1);
      } else {
        await loadKeywords();
      }
    } catch (createError) {
      setCreateKeywordError(createError instanceof Error ? createError.message : "Failed to create keyword");
    } finally {
      setIsCreatingKeyword(false);
    }
  };

  const handleKeywordSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setKeywordsPage(1);
    setKeywordQuery(keywordSearchInput.trim());
  };

  const handleKeywordSelect = (keywordId: string) => {
    setSelectedKeywordId(keywordId);
    void loadKeywordDetail(keywordId);
  };

  const handleKeywordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedKeyword) return;

    if (!editKeywordTerm.trim()) {
      setKeywordDetailError("Keyword term is required.");
      return;
    }

    if (!editKeywordLocale.trim()) {
      setKeywordDetailError("Locale is required.");
      return;
    }

    setIsUpdatingKeyword(true);
    setKeywordDetailError(null);

    try {
      const response = await authFetch(`/v1/keywords/${selectedKeyword.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pageId: editKeywordPageId.trim() ? editKeywordPageId.trim() : null,
          term: editKeywordTerm.trim(),
          locale: editKeywordLocale.trim(),
          device: editKeywordDevice,
          intent: editKeywordIntent || null,
          isActive: editKeywordIsActive
        })
      });

      const payload = (await parseJson<SingleKeywordResponse>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedKeyword(payload.data);
      setEditKeywordPageId(payload.data.pageId ?? "");
      setEditKeywordTerm(payload.data.term);
      setEditKeywordLocale(payload.data.locale);
      setEditKeywordDevice(payload.data.device);
      setEditKeywordIntent(payload.data.intent ?? "");
      setEditKeywordIsActive(payload.data.isActive);
      await loadKeywords();
    } catch (updateError) {
      setKeywordDetailError(updateError instanceof Error ? updateError.message : "Failed to update keyword");
    } finally {
      setIsUpdatingKeyword(false);
    }
  };

  const handleKeywordDelete = async () => {
    if (!selectedKeyword) return;

    const confirmed = window.confirm(`Delete keyword "${selectedKeyword.term}"? This cannot be undone.`);
    if (!confirmed) return;

    setIsDeletingKeyword(true);
    setKeywordDetailError(null);

    try {
      const response = await authFetch(`/v1/keywords/${selectedKeyword.id}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await parseJson<SingleKeywordResponse>(response)) ?? undefined;
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedKeywordId(null);
      setSelectedKeyword(null);
      await loadKeywords();
      await loadRankSnapshots();
    } catch (deleteError) {
      setKeywordDetailError(deleteError instanceof Error ? deleteError.message : "Failed to delete keyword");
    } finally {
      setIsDeletingKeyword(false);
    }
  };

  const handleCreateRankSnapshot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createSnapshotKeywordId.trim()) {
      setCreateSnapshotError("Keyword is required.");
      return;
    }

    if (!createSnapshotLocale.trim()) {
      setCreateSnapshotError("Locale is required.");
      return;
    }

    const rankValue = createSnapshotRank.trim();
    let rank: number | null = null;

    if (rankValue) {
      const parsedRank = Number(rankValue);
      if (!Number.isInteger(parsedRank) || parsedRank < 1 || parsedRank > 100) {
        setCreateSnapshotError("Rank must be an integer between 1 and 100.");
        return;
      }
      rank = parsedRank;
    }

    const recordedAtValue = createSnapshotRecordedAt.trim();
    let recordedAtIso: string | undefined;

    if (recordedAtValue) {
      const parsedRecordedAt = new Date(recordedAtValue);
      if (Number.isNaN(parsedRecordedAt.getTime())) {
        setCreateSnapshotError("Recorded at must be a valid date/time.");
        return;
      }
      recordedAtIso = parsedRecordedAt.toISOString();
    }

    setIsCreatingSnapshot(true);
    setCreateSnapshotError(null);

    try {
      const response = await authFetch("/v1/rank-snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          keywordId: createSnapshotKeywordId.trim(),
          rank,
          engine: createSnapshotEngine,
          locale: createSnapshotLocale.trim(),
          device: createSnapshotDevice,
          ...(recordedAtIso ? { recordedAt: recordedAtIso } : {}),
          ...(createSnapshotUrl.trim() ? { url: createSnapshotUrl.trim() } : {})
        })
      });

      const payload = (await parseJson<SingleRankSnapshotResponse>(response)) ?? undefined;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setCreateSnapshotRank("");
      setCreateSnapshotRecordedAt("");
      setCreateSnapshotUrl("");

      if (rankSnapshotsPage !== 1) {
        setRankSnapshotsPage(1);
      } else {
        await loadRankSnapshots();
      }
    } catch (createError) {
      setCreateSnapshotError(createError instanceof Error ? createError.message : "Failed to create rank snapshot");
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const canGoPrevProjects = projectsPage > 1;
  const canGoNextProjects = projectsMeta.totalPages > 0 && projectsPage < projectsMeta.totalPages;

  const canGoPrevPages = pagesPage > 1;
  const canGoNextPages = pagesMeta.totalPages > 0 && pagesPage < pagesMeta.totalPages;

  const canGoPrevKeywords = keywordsPage > 1;
  const canGoNextKeywords = keywordsMeta.totalPages > 0 && keywordsPage < keywordsMeta.totalPages;

  const canGoPrevRankSnapshots = rankSnapshotsPage > 1;
  const canGoNextRankSnapshots = rankSnapshotsMeta.totalPages > 0 && rankSnapshotsPage < rankSnapshotsMeta.totalPages;

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Authentication</h2>
          {user ? <button onClick={handleLogout}>Logout</button> : null}
        </div>

        <p>
          API Base URL: <code>{apiBase}</code>
        </p>

        {!user ? (
          <form className="form" onSubmit={handleAuthSubmit}>
            <div className="panel-header">
              <button type="button" onClick={() => setAuthMode("login")} disabled={authMode === "login" || authLoading}>
                Login
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                disabled={authMode === "register" || authLoading}
              >
                Register
              </button>
            </div>

            <label>
              Email
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
                minLength={8}
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
              />
            </label>

            <button type="submit" disabled={authLoading}>
              {authLoading ? "Working..." : authMode === "login" ? "Login" : "Create account"}
            </button>

            {authError ? <p className="error">{authError}</p> : null}
          </form>
        ) : (
          <p>
            Signed in as <strong>{user.email}</strong>
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Create Project</h2>
        <form className="form" onSubmit={handleCreateProject}>
          <label>
            Name
            <input
              type="text"
              name="name"
              placeholder="Acme Blog"
              value={createProjectName}
              onChange={(event) => setCreateProjectName(event.target.value)}
              required
              maxLength={120}
              disabled={!token || isCreatingProject}
            />
          </label>

          <label>
            Domain (optional)
            <input
              type="text"
              name="domain"
              placeholder="acme.com"
              value={createProjectDomain}
              onChange={(event) => setCreateProjectDomain(event.target.value)}
              maxLength={255}
              disabled={!token || isCreatingProject}
            />
          </label>

          <button type="submit" disabled={!token || isCreatingProject}>
            {isCreatingProject ? "Creating..." : "Create Project"}
          </button>

          {createProjectError ? <p className="error">{createProjectError}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Projects</h2>
          <button type="button" onClick={() => void loadProjects()} disabled={projectsLoading || !token}>
            Refresh
          </button>
        </div>

        <form className="form" onSubmit={handleProjectSearchSubmit}>
          <label>
            Search by name
            <input
              type="text"
              value={projectSearchInput}
              onChange={(event) => setProjectSearchInput(event.target.value)}
              placeholder="Type and press Search"
              disabled={!token}
            />
          </label>

          <div className="panel-header">
            <button type="submit" disabled={projectsLoading || !token}>
              Search
            </button>
            <button
              type="button"
              disabled={projectsLoading || !token}
              onClick={() => {
                setProjectSearchInput("");
                setProjectQuery("");
                setProjectsPage(1);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <div className="panel-header">
          <p className="muted">{projectsTotalLabel}</p>
          <div className="panel-header">
            <label>
              Sort
              <select
                value={projectsSort}
                onChange={(event) => {
                  setProjectsSort(event.target.value as SortOption);
                  setProjectsPage(1);
                }}
                disabled={!token}
              >
                <option value="createdAt_desc">Newest</option>
                <option value="createdAt_asc">Oldest</option>
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
              </select>
            </label>
            <label>
              Per page
              <select
                value={projectsLimit}
                onChange={(event) => {
                  setProjectsLimit(Number(event.target.value));
                  setProjectsPage(1);
                }}
                disabled={!token}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        {projectsError ? <p className="error">{projectsError}</p> : null}

        {!projectsLoading && !projectsError && token && projects.length === 0 ? <p>No projects found.</p> : null}

        {!projectsError && projects.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Slug</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{project.domain ?? "—"}</td>
                    <td>{project.status}</td>
                    <td>
                      <code>{project.slug}</code>
                    </td>
                    <td>{new Date(project.createdAt).toLocaleString()}</td>
                    <td>
                      <button type="button" onClick={() => handleProjectSelect(project.id)} disabled={projectDetailLoading}>
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
          <button
            type="button"
            onClick={() => setProjectsPage((prev) => Math.max(1, prev - 1))}
            disabled={!canGoPrevProjects || projectsLoading || !token}
          >
            Previous
          </button>
          <p className="muted">
            Page {projectsMeta.page} of {Math.max(projectsMeta.totalPages, 1)}
          </p>
          <button
            type="button"
            onClick={() => setProjectsPage((prev) => prev + 1)}
            disabled={!canGoNextProjects || projectsLoading || !token}
          >
            Next
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Project Detail</h2>
        {!selectedProjectId ? <p className="muted">Select a project to view/edit details.</p> : null}
        {projectDetailLoading ? <p>Loading project...</p> : null}
        {projectDetailError ? <p className="error">{projectDetailError}</p> : null}

        {selectedProject ? (
          <form className="form" onSubmit={handleProjectUpdate}>
            <label>
              Name
              <input value={editProjectName} onChange={(event) => setEditProjectName(event.target.value)} maxLength={120} required />
            </label>

            <label>
              Domain (blank to clear)
              <input value={editProjectDomain} onChange={(event) => setEditProjectDomain(event.target.value)} maxLength={255} />
            </label>

            <label>
              Status
              <select value={editProjectStatus} onChange={(event) => setEditProjectStatus(event.target.value as ProjectStatus)}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>

            <label>
              Timezone
              <input
                value={editProjectTimezone}
                onChange={(event) => setEditProjectTimezone(event.target.value)}
                maxLength={80}
                required
              />
            </label>

            <div className="panel-header">
              <button type="submit" disabled={isUpdatingProject || isDeletingProject}>
                {isUpdatingProject ? "Saving..." : "Save changes"}
              </button>
              <button type="button" onClick={handleProjectDelete} disabled={isDeletingProject || isUpdatingProject}>
                {isDeletingProject ? "Deleting..." : "Delete project"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="panel">
        <h2>Create Page</h2>
        <form className="form" onSubmit={handleCreatePage}>
          <label>
            Project
            <select
              value={createPageProjectId}
              onChange={(event) => setCreatePageProjectId(event.target.value)}
              disabled={!token || isCreatingPage || projects.length === 0}
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
            Path
            <input
              type="text"
              placeholder="/blog/my-article"
              value={createPagePath}
              onChange={(event) => setCreatePagePath(event.target.value)}
              maxLength={500}
              required
              disabled={!token || isCreatingPage}
            />
          </label>

          <label>
            URL (optional, auto-derived from project domain if omitted)
            <input
              type="text"
              placeholder="https://acme.com/blog/my-article"
              value={createPageUrl}
              onChange={(event) => setCreatePageUrl(event.target.value)}
              maxLength={2048}
              disabled={!token || isCreatingPage}
            />
          </label>

          <label>
            Title (optional)
            <input
              type="text"
              value={createPageTitle}
              onChange={(event) => setCreatePageTitle(event.target.value)}
              maxLength={255}
              disabled={!token || isCreatingPage}
            />
          </label>

          <label>
            Meta Description (optional)
            <input
              type="text"
              value={createPageMetaDescription}
              onChange={(event) => setCreatePageMetaDescription(event.target.value)}
              maxLength={320}
              disabled={!token || isCreatingPage}
            />
          </label>

          <label>
            Status
            <select
              value={createPageStatus}
              onChange={(event) => setCreatePageStatus(event.target.value as PageStatus)}
              disabled={!token || isCreatingPage}
            >
              <option value="DRAFT">DRAFT</option>
              <option value="REVIEW">REVIEW</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>

          <button type="submit" disabled={!token || isCreatingPage || projects.length === 0}>
            {isCreatingPage ? "Creating..." : "Create Page"}
          </button>

          {createPageError ? <p className="error">{createPageError}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Pages</h2>
          <button type="button" onClick={() => void loadPages()} disabled={pagesLoading || !token}>
            Refresh
          </button>
        </div>

        <form className="form" onSubmit={handlePageSearchSubmit}>
          <label>
            Search by path/url/title/meta description
            <input
              type="text"
              value={pageSearchInput}
              onChange={(event) => setPageSearchInput(event.target.value)}
              placeholder="Type and press Search"
              disabled={!token}
            />
          </label>

          <label>
            Filter by project
            <select
              value={pagesProjectFilterId}
              onChange={(event) => {
                setPagesProjectFilterId(event.target.value);
                setPagesPage(1);
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

          <div className="panel-header">
            <button type="submit" disabled={pagesLoading || !token}>
              Search
            </button>
            <button
              type="button"
              disabled={pagesLoading || !token}
              onClick={() => {
                setPageSearchInput("");
                setPageQuery("");
                setPagesProjectFilterId("");
                setPagesPage(1);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <div className="panel-header">
          <p className="muted">{pagesTotalLabel}</p>
          <div className="panel-header">
            <label>
              Sort
              <select
                value={pagesSort}
                onChange={(event) => {
                  setPagesSort(event.target.value as PageSortOption);
                  setPagesPage(1);
                }}
                disabled={!token}
              >
                <option value="createdAt_desc">Newest</option>
                <option value="createdAt_asc">Oldest</option>
                <option value="path_asc">Path A-Z</option>
                <option value="path_desc">Path Z-A</option>
              </select>
            </label>
            <label>
              Per page
              <select
                value={pagesLimit}
                onChange={(event) => {
                  setPagesLimit(Number(event.target.value));
                  setPagesPage(1);
                }}
                disabled={!token}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        {pagesError ? <p className="error">{pagesError}</p> : null}

        {!pagesLoading && !pagesError && token && pages.length === 0 ? <p>No pages found.</p> : null}

        {!pagesError && pages.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Path</th>
                  <th>URL</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((pageItem) => (
                  <tr key={pageItem.id}>
                    <td>
                      <code>{pageItem.path}</code>
                    </td>
                    <td>{pageItem.url}</td>
                    <td>{pageItem.project.name}</td>
                    <td>{pageItem.status}</td>
                    <td>{new Date(pageItem.updatedAt).toLocaleString()}</td>
                    <td>
                      <button type="button" onClick={() => handlePageSelect(pageItem.id)} disabled={pageDetailLoading}>
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
          <button
            type="button"
            onClick={() => setPagesPage((prev) => Math.max(1, prev - 1))}
            disabled={!canGoPrevPages || pagesLoading || !token}
          >
            Previous
          </button>
          <p className="muted">
            Page {pagesMeta.page} of {Math.max(pagesMeta.totalPages, 1)}
          </p>
          <button
            type="button"
            onClick={() => setPagesPage((prev) => prev + 1)}
            disabled={!canGoNextPages || pagesLoading || !token}
          >
            Next
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Page Detail</h2>
        {!selectedPageId ? <p className="muted">Select a page to view/edit details.</p> : null}
        {pageDetailLoading ? <p>Loading page...</p> : null}
        {pageDetailError ? <p className="error">{pageDetailError}</p> : null}

        {selectedPage ? (
          <form className="form" onSubmit={handlePageUpdate}>
            <p className="muted">
              Project: <strong>{selectedPage.project.name}</strong>
            </p>

            <label>
              Path
              <input value={editPagePath} onChange={(event) => setEditPagePath(event.target.value)} maxLength={500} required />
            </label>

            <label>
              URL (blank keeps auto-derived behavior when path changes)
              <input value={editPageUrl} onChange={(event) => setEditPageUrl(event.target.value)} maxLength={2048} />
            </label>

            <label>
              Title (blank clears)
              <input value={editPageTitle} onChange={(event) => setEditPageTitle(event.target.value)} maxLength={255} />
            </label>

            <label>
              Meta Description (blank clears)
              <input
                value={editPageMetaDescription}
                onChange={(event) => setEditPageMetaDescription(event.target.value)}
                maxLength={320}
              />
            </label>

            <label>
              Status
              <select value={editPageStatus} onChange={(event) => setEditPageStatus(event.target.value as PageStatus)}>
                <option value="DRAFT">DRAFT</option>
                <option value="REVIEW">REVIEW</option>
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>

            <div className="panel-header">
              <button type="submit" disabled={isUpdatingPage || isDeletingPage}>
                {isUpdatingPage ? "Saving..." : "Save changes"}
              </button>
              <button type="button" onClick={handlePageDelete} disabled={isDeletingPage || isUpdatingPage}>
                {isDeletingPage ? "Deleting..." : "Delete page"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="panel">
        <h2>Create Keyword</h2>
        <form className="form" onSubmit={handleCreateKeyword}>
          <label>
            Project
            <select
              value={createKeywordProjectId}
              onChange={(event) => {
                setCreateKeywordProjectId(event.target.value);
                setCreateKeywordPageId("");
              }}
              disabled={!token || isCreatingKeyword || projects.length === 0}
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
            Landing page (optional)
            <select
              value={createKeywordPageId}
              onChange={(event) => setCreateKeywordPageId(event.target.value)}
              disabled={!token || isCreatingKeyword || !createKeywordProjectId}
            >
              <option value="">No linked page</option>
              {pagesForCreateKeywordProject.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Keyword term
            <input
              type="text"
              value={createKeywordTerm}
              onChange={(event) => setCreateKeywordTerm(event.target.value)}
              maxLength={255}
              required
              disabled={!token || isCreatingKeyword}
            />
          </label>

          <label>
            Locale
            <input
              type="text"
              value={createKeywordLocale}
              onChange={(event) => setCreateKeywordLocale(event.target.value)}
              maxLength={32}
              required
              disabled={!token || isCreatingKeyword}
            />
          </label>

          <label>
            Device
            <select
              value={createKeywordDevice}
              onChange={(event) => setCreateKeywordDevice(event.target.value as DeviceType)}
              disabled={!token || isCreatingKeyword}
            >
              <option value="DESKTOP">DESKTOP</option>
              <option value="MOBILE">MOBILE</option>
            </select>
          </label>

          <label>
            Intent (optional)
            <select
              value={createKeywordIntent}
              onChange={(event) => setCreateKeywordIntent(event.target.value as "" | KeywordIntent)}
              disabled={!token || isCreatingKeyword}
            >
              <option value="">None</option>
              <option value="INFORMATIONAL">INFORMATIONAL</option>
              <option value="COMMERCIAL">COMMERCIAL</option>
              <option value="TRANSACTIONAL">TRANSACTIONAL</option>
              <option value="NAVIGATIONAL">NAVIGATIONAL</option>
            </select>
          </label>

          <label>
            Active
            <select
              value={createKeywordIsActive ? "true" : "false"}
              onChange={(event) => setCreateKeywordIsActive(event.target.value === "true")}
              disabled={!token || isCreatingKeyword}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>

          <button type="submit" disabled={!token || isCreatingKeyword || projects.length === 0}>
            {isCreatingKeyword ? "Creating..." : "Create Keyword"}
          </button>

          {createKeywordError ? <p className="error">{createKeywordError}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Keywords</h2>
          <button type="button" onClick={() => void loadKeywords()} disabled={keywordsLoading || !token}>
            Refresh
          </button>
        </div>

        <form className="form" onSubmit={handleKeywordSearchSubmit}>
          <label>
            Search by keyword term
            <input
              type="text"
              value={keywordSearchInput}
              onChange={(event) => setKeywordSearchInput(event.target.value)}
              placeholder="Type and press Search"
              disabled={!token}
            />
          </label>

          <label>
            Filter by project
            <select
              value={keywordsProjectFilterId}
              onChange={(event) => {
                setKeywordsProjectFilterId(event.target.value);
                setKeywordsPageFilterId("");
                setKeywordsPage(1);
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
              value={keywordsPageFilterId}
              onChange={(event) => {
                setKeywordsPageFilterId(event.target.value);
                setKeywordsPage(1);
              }}
              disabled={!token || pagesForKeywordFilterProject.length === 0}
            >
              <option value="">All pages</option>
              {pagesForKeywordFilterProject.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Filter by locale
            <input
              type="text"
              value={keywordsLocaleFilter}
              onChange={(event) => {
                setKeywordsLocaleFilter(event.target.value);
                setKeywordsPage(1);
              }}
              maxLength={32}
              placeholder="en-US"
              disabled={!token}
            />
          </label>

          <label>
            Filter by device
            <select
              value={keywordsDeviceFilter}
              onChange={(event) => {
                setKeywordsDeviceFilter(event.target.value as "" | DeviceType);
                setKeywordsPage(1);
              }}
              disabled={!token}
            >
              <option value="">All devices</option>
              <option value="DESKTOP">DESKTOP</option>
              <option value="MOBILE">MOBILE</option>
            </select>
          </label>

          <label>
            Active status
            <select
              value={keywordsIsActiveFilter}
              onChange={(event) => {
                setKeywordsIsActiveFilter(event.target.value as "all" | "active" | "inactive");
                setKeywordsPage(1);
              }}
              disabled={!token}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <div className="panel-header">
            <button type="submit" disabled={keywordsLoading || !token}>
              Search
            </button>
            <button
              type="button"
              disabled={keywordsLoading || !token}
              onClick={() => {
                setKeywordSearchInput("");
                setKeywordQuery("");
                setKeywordsProjectFilterId("");
                setKeywordsPageFilterId("");
                setKeywordsLocaleFilter("");
                setKeywordsDeviceFilter("");
                setKeywordsIsActiveFilter("all");
                setKeywordsPage(1);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <div className="panel-header">
          <p className="muted">{keywordsTotalLabel}</p>
          <div className="panel-header">
            <label>
              Sort
              <select
                value={keywordsSort}
                onChange={(event) => {
                  setKeywordsSort(event.target.value as KeywordSortOption);
                  setKeywordsPage(1);
                }}
                disabled={!token}
              >
                <option value="createdAt_desc">Newest</option>
                <option value="createdAt_asc">Oldest</option>
                <option value="term_asc">Term A-Z</option>
                <option value="term_desc">Term Z-A</option>
                <option value="updatedAt_desc">Recently updated</option>
                <option value="updatedAt_asc">Least recently updated</option>
              </select>
            </label>
            <label>
              Per page
              <select
                value={keywordsLimit}
                onChange={(event) => {
                  setKeywordsLimit(Number(event.target.value));
                  setKeywordsPage(1);
                }}
                disabled={!token}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        {keywordsError ? <p className="error">{keywordsError}</p> : null}

        {!keywordsLoading && !keywordsError && token && keywords.length === 0 ? <p>No keywords found.</p> : null}

        {!keywordsError && keywords.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Project</th>
                  <th>Page</th>
                  <th>Locale</th>
                  <th>Device</th>
                  <th>Intent</th>
                  <th>Active</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((keyword) => (
                  <tr key={keyword.id}>
                    <td>{keyword.term}</td>
                    <td>{keyword.project.name}</td>
                    <td>{keyword.page?.path ?? "—"}</td>
                    <td>{keyword.locale}</td>
                    <td>{keyword.device}</td>
                    <td>{keyword.intent ?? "—"}</td>
                    <td>{keyword.isActive ? "Yes" : "No"}</td>
                    <td>{new Date(keyword.updatedAt).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleKeywordSelect(keyword.id)}
                        disabled={keywordDetailLoading || isUpdatingKeyword || isDeletingKeyword}
                      >
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
          <button
            type="button"
            onClick={() => setKeywordsPage((prev) => Math.max(1, prev - 1))}
            disabled={!canGoPrevKeywords || keywordsLoading || !token}
          >
            Previous
          </button>
          <p className="muted">
            Page {keywordsMeta.page} of {Math.max(keywordsMeta.totalPages, 1)}
          </p>
          <button
            type="button"
            onClick={() => setKeywordsPage((prev) => prev + 1)}
            disabled={!canGoNextKeywords || keywordsLoading || !token}
          >
            Next
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Keyword Detail</h2>
        {!selectedKeywordId ? <p className="muted">Select a keyword to view/edit details.</p> : null}
        {keywordDetailLoading ? <p>Loading keyword...</p> : null}
        {keywordDetailError ? <p className="error">{keywordDetailError}</p> : null}

        {selectedKeyword ? (
          <form className="form" onSubmit={handleKeywordUpdate}>
            <p className="muted">
              Project: <strong>{selectedKeyword.project.name}</strong>
            </p>

            <label>
              Linked page
              <select value={editKeywordPageId} onChange={(event) => setEditKeywordPageId(event.target.value)}>
                <option value="">No linked page</option>
                {pagesForSelectedKeywordProject.map((pageItem) => (
                  <option key={pageItem.id} value={pageItem.id}>
                    {pageItem.path}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Keyword term
              <input
                value={editKeywordTerm}
                onChange={(event) => setEditKeywordTerm(event.target.value)}
                maxLength={255}
                required
              />
            </label>

            <label>
              Locale
              <input
                value={editKeywordLocale}
                onChange={(event) => setEditKeywordLocale(event.target.value)}
                maxLength={32}
                required
              />
            </label>

            <label>
              Device
              <select value={editKeywordDevice} onChange={(event) => setEditKeywordDevice(event.target.value as DeviceType)}>
                <option value="DESKTOP">DESKTOP</option>
                <option value="MOBILE">MOBILE</option>
              </select>
            </label>

            <label>
              Intent
              <select value={editKeywordIntent} onChange={(event) => setEditKeywordIntent(event.target.value as "" | KeywordIntent)}>
                <option value="">None</option>
                <option value="INFORMATIONAL">INFORMATIONAL</option>
                <option value="COMMERCIAL">COMMERCIAL</option>
                <option value="TRANSACTIONAL">TRANSACTIONAL</option>
                <option value="NAVIGATIONAL">NAVIGATIONAL</option>
              </select>
            </label>

            <label>
              Active
              <select
                value={editKeywordIsActive ? "true" : "false"}
                onChange={(event) => setEditKeywordIsActive(event.target.value === "true")}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>

            <div className="panel-header">
              <button type="submit" disabled={isUpdatingKeyword || isDeletingKeyword}>
                {isUpdatingKeyword ? "Saving..." : "Save changes"}
              </button>
              <button type="button" onClick={handleKeywordDelete} disabled={isDeletingKeyword || isUpdatingKeyword}>
                {isDeletingKeyword ? "Deleting..." : "Delete keyword"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="panel">
        <h2>Ingest Rank Snapshot</h2>
        <form className="form" onSubmit={handleCreateRankSnapshot}>
          <label>
            Keyword
            <select
              value={createSnapshotKeywordId}
              onChange={(event) => setCreateSnapshotKeywordId(event.target.value)}
              disabled={!token || isCreatingSnapshot || keywords.length === 0}
              required
            >
              <option value="" disabled>
                {keywords.length === 0 ? "Create/select a keyword first" : "Select keyword"}
              </option>
              {keywords.map((keyword) => (
                <option key={keyword.id} value={keyword.id}>
                  {keyword.term} ({keyword.project.slug})
                </option>
              ))}
            </select>
          </label>

          <label>
            Rank (optional)
            <input
              type="number"
              min={1}
              max={100}
              value={createSnapshotRank}
              onChange={(event) => setCreateSnapshotRank(event.target.value)}
              placeholder="1-100"
              disabled={!token || isCreatingSnapshot}
            />
          </label>

          <label>
            Engine
            <select
              value={createSnapshotEngine}
              onChange={(event) => setCreateSnapshotEngine(event.target.value as SearchEngine)}
              disabled={!token || isCreatingSnapshot}
            >
              <option value="GOOGLE">GOOGLE</option>
              <option value="BING">BING</option>
            </select>
          </label>

          <label>
            Locale
            <input
              type="text"
              value={createSnapshotLocale}
              onChange={(event) => setCreateSnapshotLocale(event.target.value)}
              maxLength={32}
              required
              disabled={!token || isCreatingSnapshot}
            />
          </label>

          <label>
            Device
            <select
              value={createSnapshotDevice}
              onChange={(event) => setCreateSnapshotDevice(event.target.value as DeviceType)}
              disabled={!token || isCreatingSnapshot}
            >
              <option value="DESKTOP">DESKTOP</option>
              <option value="MOBILE">MOBILE</option>
            </select>
          </label>

          <label>
            Recorded at (optional)
            <input
              type="datetime-local"
              value={createSnapshotRecordedAt}
              onChange={(event) => setCreateSnapshotRecordedAt(event.target.value)}
              disabled={!token || isCreatingSnapshot}
            />
          </label>

          <label>
            Ranking URL (optional)
            <input
              type="text"
              value={createSnapshotUrl}
              onChange={(event) => setCreateSnapshotUrl(event.target.value)}
              maxLength={2048}
              placeholder="https://example.com/blog/post"
              disabled={!token || isCreatingSnapshot}
            />
          </label>

          <button type="submit" disabled={!token || isCreatingSnapshot || keywords.length === 0}>
            {isCreatingSnapshot ? "Ingesting..." : "Ingest Snapshot"}
          </button>

          {createSnapshotError ? <p className="error">{createSnapshotError}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Rank Snapshots</h2>
          <button type="button" onClick={() => void loadRankSnapshots()} disabled={rankSnapshotsLoading || !token}>
            Refresh
          </button>
        </div>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setRankSnapshotsPage(1);
          }}
        >
          <label>
            Filter by project
            <select
              value={rankSnapshotsProjectFilterId}
              onChange={(event) => {
                setRankSnapshotsProjectFilterId(event.target.value);
                setRankSnapshotsPage(1);
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
            Filter by keyword
            <select
              value={rankSnapshotsKeywordFilterId}
              onChange={(event) => {
                setRankSnapshotsKeywordFilterId(event.target.value);
                setRankSnapshotsPage(1);
              }}
              disabled={!token || keywordsForRankSnapshotProject.length === 0}
            >
              <option value="">All keywords</option>
              {keywordsForRankSnapshotProject.map((keyword) => (
                <option key={keyword.id} value={keyword.id}>
                  {keyword.term}
                </option>
              ))}
            </select>
          </label>

          <label>
            Filter by engine
            <select
              value={rankSnapshotsEngineFilter}
              onChange={(event) => {
                setRankSnapshotsEngineFilter(event.target.value as "" | SearchEngine);
                setRankSnapshotsPage(1);
              }}
              disabled={!token}
            >
              <option value="">All engines</option>
              <option value="GOOGLE">GOOGLE</option>
              <option value="BING">BING</option>
            </select>
          </label>

          <label>
            Filter by locale
            <input
              type="text"
              value={rankSnapshotsLocaleFilter}
              onChange={(event) => {
                setRankSnapshotsLocaleFilter(event.target.value);
                setRankSnapshotsPage(1);
              }}
              maxLength={32}
              placeholder="en-US"
              disabled={!token}
            />
          </label>

          <label>
            Filter by device
            <select
              value={rankSnapshotsDeviceFilter}
              onChange={(event) => {
                setRankSnapshotsDeviceFilter(event.target.value as "" | DeviceType);
                setRankSnapshotsPage(1);
              }}
              disabled={!token}
            >
              <option value="">All devices</option>
              <option value="DESKTOP">DESKTOP</option>
              <option value="MOBILE">MOBILE</option>
            </select>
          </label>

          <label>
            From (recorded at)
            <input
              type="datetime-local"
              value={rankSnapshotsFrom}
              onChange={(event) => {
                setRankSnapshotsFrom(event.target.value);
                setRankSnapshotsPage(1);
              }}
              disabled={!token}
            />
          </label>

          <label>
            To (recorded at)
            <input
              type="datetime-local"
              value={rankSnapshotsTo}
              onChange={(event) => {
                setRankSnapshotsTo(event.target.value);
                setRankSnapshotsPage(1);
              }}
              disabled={!token}
            />
          </label>

          <div className="panel-header">
            <button type="submit" disabled={!token || rankSnapshotsLoading}>
              Apply filters
            </button>
            <button
              type="button"
              disabled={!token || rankSnapshotsLoading}
              onClick={() => {
                setRankSnapshotsProjectFilterId("");
                setRankSnapshotsKeywordFilterId("");
                setRankSnapshotsEngineFilter("");
                setRankSnapshotsLocaleFilter("");
                setRankSnapshotsDeviceFilter("");
                setRankSnapshotsFrom("");
                setRankSnapshotsTo("");
                setRankSnapshotsPage(1);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <div className="panel-header">
          <p className="muted">{rankSnapshotsTotalLabel}</p>
          <div className="panel-header">
            <label>
              Sort
              <select
                value={rankSnapshotsSort}
                onChange={(event) => {
                  setRankSnapshotsSort(event.target.value as RankSnapshotSortOption);
                  setRankSnapshotsPage(1);
                }}
                disabled={!token}
              >
                <option value="recordedAt_desc">Recorded at (newest)</option>
                <option value="recordedAt_asc">Recorded at (oldest)</option>
                <option value="createdAt_desc">Created (newest)</option>
                <option value="createdAt_asc">Created (oldest)</option>
                <option value="rank_asc">Rank best to worst</option>
                <option value="rank_desc">Rank worst to best</option>
              </select>
            </label>
            <label>
              Per page
              <select
                value={rankSnapshotsLimit}
                onChange={(event) => {
                  setRankSnapshotsLimit(Number(event.target.value));
                  setRankSnapshotsPage(1);
                }}
                disabled={!token}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        {rankSnapshotsError ? <p className="error">{rankSnapshotsError}</p> : null}

        {!rankSnapshotsLoading && !rankSnapshotsError && token && rankSnapshots.length === 0 ? (
          <p>No rank snapshots found.</p>
        ) : null}

        {!rankSnapshotsError && rankSnapshots.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recorded At</th>
                  <th>Project</th>
                  <th>Keyword</th>
                  <th>Engine</th>
                  <th>Locale</th>
                  <th>Device</th>
                  <th>Rank</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {rankSnapshots.map((snapshot) => (
                  <tr key={snapshot.id}>
                    <td>{new Date(snapshot.recordedAt).toLocaleString()}</td>
                    <td>{snapshot.project.name}</td>
                    <td>{snapshot.keyword.term}</td>
                    <td>{snapshot.engine}</td>
                    <td>{snapshot.locale}</td>
                    <td>{snapshot.device}</td>
                    <td>{snapshot.rank ?? "—"}</td>
                    <td>
                      {snapshot.url ? (
                        <a href={snapshot.url} target="_blank" rel="noreferrer noopener">
                          {snapshot.url}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="panel-header">
          <button
            type="button"
            onClick={() => setRankSnapshotsPage((prev) => Math.max(1, prev - 1))}
            disabled={!canGoPrevRankSnapshots || rankSnapshotsLoading || !token}
          >
            Previous
          </button>
          <p className="muted">
            Page {rankSnapshotsMeta.page} of {Math.max(rankSnapshotsMeta.totalPages, 1)}
          </p>
          <button
            type="button"
            onClick={() => setRankSnapshotsPage((prev) => prev + 1)}
            disabled={!canGoNextRankSnapshots || rankSnapshotsLoading || !token}
          >
            Next
          </button>
        </div>
      </section>

      <Phase8ContentOpsPanel
        token={token}
        authFetch={authFetch}
        projects={projects.map((project) => ({ id: project.id, name: project.name, slug: project.slug }))}
        pages={pages.map((pageItem) => ({
          id: pageItem.id,
          projectId: pageItem.projectId,
          path: pageItem.path,
          url: pageItem.url
        }))}
        keywords={keywords.map((keyword) => ({
          id: keyword.id,
          projectId: keyword.projectId,
          term: keyword.term,
          locale: keyword.locale,
          device: keyword.device
        }))}
      />

      <Phase9LinkOpsPanel
        token={token}
        authFetch={authFetch}
        projects={projects.map((project) => ({ id: project.id, name: project.name, slug: project.slug }))}
        pages={pages.map((pageItem) => ({
          id: pageItem.id,
          projectId: pageItem.projectId,
          path: pageItem.path,
          url: pageItem.url
        }))}
      />

      <Phase10AnalyticsPanel
        token={token}
        authFetch={authFetch}
        projects={projects.map((project) => ({ id: project.id, name: project.name, slug: project.slug }))}
      />

      <Phase11AutomationPanel
        token={token}
        authFetch={authFetch}
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          slug: project.slug,
          timezone: project.timezone
        }))}
      />
    </div>
  );
}
