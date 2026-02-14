"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type LinkStatus = "SUGGESTED" | "APPLIED" | "IGNORED";
type OutreachStatus = "NEW" | "CONTACTED" | "RESPONDED" | "WON" | "LOST";

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

type InternalLink = {
  id: string;
  projectId: string;
  sourcePageId: string;
  targetPageId: string;
  project: {
    id: string;
    name: string;
    slug: string;
  };
  sourcePage: {
    id: string;
    path: string;
    url: string;
  };
  targetPage: {
    id: string;
    path: string;
    url: string;
  };
  anchorText: string;
  status: LinkStatus;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

type BacklinkOpportunity = {
  id: string;
  projectId: string;
  project: {
    id: string;
    name: string;
    slug: string;
  };
  sourceDomain: string;
  targetUrl: string;
  contactEmail: string | null;
  authorityScore: number | null;
  status: OutreachStatus;
  notes: string | null;
  nextActionAt: string | null;
  lastContactedAt: string | null;
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

function parseOptionalAuthorityScore(raw: string, fieldLabel: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${fieldLabel} must be an integer between 0 and 100.`);
  }

  return parsed;
}

export function Phase9LinkOpsPanel({ token, authFetch, projects, pages }: Props) {
  const [internalLinks, setInternalLinks] = useState<InternalLink[]>([]);
  const [internalLinksMeta, setInternalLinksMeta] = useState<ListMeta>(createEmptyMeta(20));
  const [internalLinksLoading, setInternalLinksLoading] = useState(false);
  const [internalLinksError, setInternalLinksError] = useState<string | null>(null);

  const [internalPage, setInternalPage] = useState(1);
  const [internalLimit, setInternalLimit] = useState(20);
  const [internalSort, setInternalSort] = useState<
    "createdAt_desc" | "createdAt_asc" | "updatedAt_desc" | "updatedAt_asc" | "anchorText_asc" | "anchorText_desc"
  >("createdAt_desc");
  const [internalProjectFilterId, setInternalProjectFilterId] = useState("");
  const [internalSourceFilterId, setInternalSourceFilterId] = useState("");
  const [internalTargetFilterId, setInternalTargetFilterId] = useState("");
  const [internalStatusFilter, setInternalStatusFilter] = useState<"" | LinkStatus>("");
  const [internalQuery, setInternalQuery] = useState("");

  const [createInternalProjectId, setCreateInternalProjectId] = useState("");
  const [createInternalSourcePageId, setCreateInternalSourcePageId] = useState("");
  const [createInternalTargetPageId, setCreateInternalTargetPageId] = useState("");
  const [createInternalAnchorText, setCreateInternalAnchorText] = useState("");
  const [createInternalStatus, setCreateInternalStatus] = useState<LinkStatus>("SUGGESTED");
  const [createInternalReason, setCreateInternalReason] = useState("");
  const [createInternalError, setCreateInternalError] = useState<string | null>(null);
  const [creatingInternalLink, setCreatingInternalLink] = useState(false);

  const [selectedInternalLinkId, setSelectedInternalLinkId] = useState<string | null>(null);
  const [editInternalSourcePageId, setEditInternalSourcePageId] = useState("");
  const [editInternalTargetPageId, setEditInternalTargetPageId] = useState("");
  const [editInternalAnchorText, setEditInternalAnchorText] = useState("");
  const [editInternalStatus, setEditInternalStatus] = useState<LinkStatus>("SUGGESTED");
  const [editInternalReason, setEditInternalReason] = useState("");
  const [editInternalError, setEditInternalError] = useState<string | null>(null);
  const [updatingInternalLink, setUpdatingInternalLink] = useState(false);
  const [deletingInternalLink, setDeletingInternalLink] = useState(false);

  const [backlinkOpportunities, setBacklinkOpportunities] = useState<BacklinkOpportunity[]>([]);
  const [backlinkMeta, setBacklinkMeta] = useState<ListMeta>(createEmptyMeta(20));
  const [backlinkLoading, setBacklinkLoading] = useState(false);
  const [backlinkError, setBacklinkError] = useState<string | null>(null);

  const [backlinkPage, setBacklinkPage] = useState(1);
  const [backlinkLimit, setBacklinkLimit] = useState(20);
  const [backlinkSort, setBacklinkSort] = useState<
    | "createdAt_desc"
    | "createdAt_asc"
    | "updatedAt_desc"
    | "updatedAt_asc"
    | "authorityScore_desc"
    | "authorityScore_asc"
    | "nextActionAt_asc"
    | "nextActionAt_desc"
  >("createdAt_desc");
  const [backlinkProjectFilterId, setBacklinkProjectFilterId] = useState("");
  const [backlinkStatusFilter, setBacklinkStatusFilter] = useState<"" | OutreachStatus>("");
  const [backlinkHasContactFilter, setBacklinkHasContactFilter] = useState<"all" | "has" | "none">("all");
  const [backlinkQuery, setBacklinkQuery] = useState("");

  const [createBacklinkProjectId, setCreateBacklinkProjectId] = useState("");
  const [createBacklinkSourceDomain, setCreateBacklinkSourceDomain] = useState("");
  const [createBacklinkTargetUrl, setCreateBacklinkTargetUrl] = useState("");
  const [createBacklinkContactEmail, setCreateBacklinkContactEmail] = useState("");
  const [createBacklinkAuthorityScore, setCreateBacklinkAuthorityScore] = useState("");
  const [createBacklinkStatus, setCreateBacklinkStatus] = useState<OutreachStatus>("NEW");
  const [createBacklinkNotes, setCreateBacklinkNotes] = useState("");
  const [createBacklinkNextActionAt, setCreateBacklinkNextActionAt] = useState("");
  const [createBacklinkLastContactedAt, setCreateBacklinkLastContactedAt] = useState("");
  const [createBacklinkError, setCreateBacklinkError] = useState<string | null>(null);
  const [creatingBacklinkOpportunity, setCreatingBacklinkOpportunity] = useState(false);

  const [selectedBacklinkId, setSelectedBacklinkId] = useState<string | null>(null);
  const [editBacklinkSourceDomain, setEditBacklinkSourceDomain] = useState("");
  const [editBacklinkTargetUrl, setEditBacklinkTargetUrl] = useState("");
  const [editBacklinkContactEmail, setEditBacklinkContactEmail] = useState("");
  const [editBacklinkAuthorityScore, setEditBacklinkAuthorityScore] = useState("");
  const [editBacklinkStatus, setEditBacklinkStatus] = useState<OutreachStatus>("NEW");
  const [editBacklinkNotes, setEditBacklinkNotes] = useState("");
  const [editBacklinkNextActionAt, setEditBacklinkNextActionAt] = useState("");
  const [editBacklinkLastContactedAt, setEditBacklinkLastContactedAt] = useState("");
  const [editBacklinkError, setEditBacklinkError] = useState<string | null>(null);
  const [updatingBacklinkOpportunity, setUpdatingBacklinkOpportunity] = useState(false);
  const [deletingBacklinkOpportunity, setDeletingBacklinkOpportunity] = useState(false);

  const selectedInternalLink = useMemo(
    () => internalLinks.find((link) => link.id === selectedInternalLinkId) ?? null,
    [internalLinks, selectedInternalLinkId]
  );

  const selectedBacklink = useMemo(
    () => backlinkOpportunities.find((opportunity) => opportunity.id === selectedBacklinkId) ?? null,
    [backlinkOpportunities, selectedBacklinkId]
  );

  const pagesForInternalProjectFilter = useMemo(
    () => pages.filter((pageItem) => !internalProjectFilterId || pageItem.projectId === internalProjectFilterId),
    [internalProjectFilterId, pages]
  );

  const pagesForCreateInternalProject = useMemo(
    () => pages.filter((pageItem) => pageItem.projectId === createInternalProjectId),
    [createInternalProjectId, pages]
  );

  const pagesForSelectedInternalProject = useMemo(() => {
    const scopedPages = pages.filter((pageItem) => pageItem.projectId === (selectedInternalLink?.projectId ?? ""));

    if (!selectedInternalLink) return scopedPages;

    const withFallback = [...scopedPages];

    if (!withFallback.some((pageItem) => pageItem.id === selectedInternalLink.sourcePage.id)) {
      withFallback.push({
        id: selectedInternalLink.sourcePage.id,
        projectId: selectedInternalLink.projectId,
        path: selectedInternalLink.sourcePage.path,
        url: selectedInternalLink.sourcePage.url
      });
    }

    if (!withFallback.some((pageItem) => pageItem.id === selectedInternalLink.targetPage.id)) {
      withFallback.push({
        id: selectedInternalLink.targetPage.id,
        projectId: selectedInternalLink.projectId,
        path: selectedInternalLink.targetPage.path,
        url: selectedInternalLink.targetPage.url
      });
    }

    return withFallback;
  }, [
    pages,
    selectedInternalLink?.projectId,
    selectedInternalLink?.sourcePage.id,
    selectedInternalLink?.sourcePage.path,
    selectedInternalLink?.sourcePage.url,
    selectedInternalLink?.targetPage.id,
    selectedInternalLink?.targetPage.path,
    selectedInternalLink?.targetPage.url
  ]);

  const loadInternalLinks = useCallback(async () => {
    if (!token) {
      setInternalLinks([]);
      setInternalLinksMeta(createEmptyMeta(internalLimit));
      return;
    }

    setInternalLinksLoading(true);
    setInternalLinksError(null);

    try {
      const params = new URLSearchParams({
        page: String(internalPage),
        limit: String(internalLimit),
        sort: internalSort
      });

      if (internalProjectFilterId) params.set("projectId", internalProjectFilterId);
      if (internalSourceFilterId) params.set("sourcePageId", internalSourceFilterId);
      if (internalTargetFilterId) params.set("targetPageId", internalTargetFilterId);
      if (internalStatusFilter) params.set("status", internalStatusFilter);
      if (internalQuery.trim()) params.set("q", internalQuery.trim());

      const response = await authFetch(`/v1/internal-links?${params.toString()}`, { cache: "no-store" });
      const payload = (await parseJson<ListResponse<InternalLink>>(response)) ?? undefined;

      if (!response.ok || !payload?.data || !payload.meta) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setInternalLinks(payload.data);
      setInternalLinksMeta(payload.meta);

      if (selectedInternalLinkId && !payload.data.some((link) => link.id === selectedInternalLinkId)) {
        setSelectedInternalLinkId(null);
      }
    } catch (error) {
      setInternalLinks([]);
      setInternalLinksMeta(createEmptyMeta(internalLimit));
      setInternalLinksError(error instanceof Error ? error.message : "Failed to load internal links");
    } finally {
      setInternalLinksLoading(false);
    }
  }, [
    authFetch,
    internalLimit,
    internalPage,
    internalProjectFilterId,
    internalQuery,
    internalSort,
    internalSourceFilterId,
    internalStatusFilter,
    internalTargetFilterId,
    selectedInternalLinkId,
    token
  ]);

  const loadBacklinkOpportunities = useCallback(async () => {
    if (!token) {
      setBacklinkOpportunities([]);
      setBacklinkMeta(createEmptyMeta(backlinkLimit));
      return;
    }

    setBacklinkLoading(true);
    setBacklinkError(null);

    try {
      const params = new URLSearchParams({
        page: String(backlinkPage),
        limit: String(backlinkLimit),
        sort: backlinkSort
      });

      if (backlinkProjectFilterId) params.set("projectId", backlinkProjectFilterId);
      if (backlinkStatusFilter) params.set("status", backlinkStatusFilter);
      if (backlinkHasContactFilter === "has") params.set("hasContactEmail", "true");
      if (backlinkHasContactFilter === "none") params.set("hasContactEmail", "false");
      if (backlinkQuery.trim()) params.set("q", backlinkQuery.trim());

      const response = await authFetch(`/v1/backlink-opportunities?${params.toString()}`, { cache: "no-store" });
      const payload = (await parseJson<ListResponse<BacklinkOpportunity>>(response)) ?? undefined;

      if (!response.ok || !payload?.data || !payload.meta) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setBacklinkOpportunities(payload.data);
      setBacklinkMeta(payload.meta);

      if (selectedBacklinkId && !payload.data.some((opportunity) => opportunity.id === selectedBacklinkId)) {
        setSelectedBacklinkId(null);
      }
    } catch (error) {
      setBacklinkOpportunities([]);
      setBacklinkMeta(createEmptyMeta(backlinkLimit));
      setBacklinkError(error instanceof Error ? error.message : "Failed to load backlink opportunities");
    } finally {
      setBacklinkLoading(false);
    }
  }, [
    authFetch,
    backlinkHasContactFilter,
    backlinkLimit,
    backlinkPage,
    backlinkProjectFilterId,
    backlinkQuery,
    backlinkSort,
    backlinkStatusFilter,
    selectedBacklinkId,
    token
  ]);

  useEffect(() => {
    void loadInternalLinks();
  }, [loadInternalLinks]);

  useEffect(() => {
    void loadBacklinkOpportunities();
  }, [loadBacklinkOpportunities]);

  useEffect(() => {
    if (!token) {
      setCreateInternalProjectId("");
      setCreateInternalSourcePageId("");
      setCreateInternalTargetPageId("");
      setCreateBacklinkProjectId("");
      return;
    }

    if (!createInternalProjectId && projects.length > 0) {
      setCreateInternalProjectId(projects[0].id);
    }

    if (!createBacklinkProjectId && projects.length > 0) {
      setCreateBacklinkProjectId(projects[0].id);
    }
  }, [createBacklinkProjectId, createInternalProjectId, projects, token]);

  useEffect(() => {
    if (!createInternalProjectId) {
      setCreateInternalSourcePageId("");
      setCreateInternalTargetPageId("");
      return;
    }

    if (createInternalSourcePageId && !pagesForCreateInternalProject.some((pageItem) => pageItem.id === createInternalSourcePageId)) {
      setCreateInternalSourcePageId("");
    }

    if (createInternalTargetPageId && !pagesForCreateInternalProject.some((pageItem) => pageItem.id === createInternalTargetPageId)) {
      setCreateInternalTargetPageId("");
    }

    if (!createInternalSourcePageId && pagesForCreateInternalProject.length > 0) {
      setCreateInternalSourcePageId(pagesForCreateInternalProject[0].id);
    }

    if (!createInternalTargetPageId && pagesForCreateInternalProject.length > 1) {
      setCreateInternalTargetPageId(pagesForCreateInternalProject[1].id);
    }
  }, [
    createInternalProjectId,
    createInternalSourcePageId,
    createInternalTargetPageId,
    pagesForCreateInternalProject
  ]);

  useEffect(() => {
    if (internalSourceFilterId && !pagesForInternalProjectFilter.some((pageItem) => pageItem.id === internalSourceFilterId)) {
      setInternalSourceFilterId("");
    }

    if (internalTargetFilterId && !pagesForInternalProjectFilter.some((pageItem) => pageItem.id === internalTargetFilterId)) {
      setInternalTargetFilterId("");
    }
  }, [internalSourceFilterId, internalTargetFilterId, pagesForInternalProjectFilter]);

  useEffect(() => {
    if (!selectedInternalLink) return;

    setEditInternalSourcePageId(selectedInternalLink.sourcePageId);
    setEditInternalTargetPageId(selectedInternalLink.targetPageId);
    setEditInternalAnchorText(selectedInternalLink.anchorText);
    setEditInternalStatus(selectedInternalLink.status);
    setEditInternalReason(selectedInternalLink.reason ?? "");
    setEditInternalError(null);
  }, [selectedInternalLink]);

  useEffect(() => {
    if (!selectedBacklink) return;

    setEditBacklinkSourceDomain(selectedBacklink.sourceDomain);
    setEditBacklinkTargetUrl(selectedBacklink.targetUrl);
    setEditBacklinkContactEmail(selectedBacklink.contactEmail ?? "");
    setEditBacklinkAuthorityScore(selectedBacklink.authorityScore === null ? "" : String(selectedBacklink.authorityScore));
    setEditBacklinkStatus(selectedBacklink.status);
    setEditBacklinkNotes(selectedBacklink.notes ?? "");
    setEditBacklinkNextActionAt(toDateTimeLocalValue(selectedBacklink.nextActionAt));
    setEditBacklinkLastContactedAt(toDateTimeLocalValue(selectedBacklink.lastContactedAt));
    setEditBacklinkError(null);
  }, [selectedBacklink]);

  const handleCreateInternalLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createInternalProjectId) {
      setCreateInternalError("Project is required.");
      return;
    }

    if (!createInternalSourcePageId || !createInternalTargetPageId) {
      setCreateInternalError("Source and target pages are required.");
      return;
    }

    if (createInternalSourcePageId === createInternalTargetPageId) {
      setCreateInternalError("Source and target pages must be different.");
      return;
    }

    if (!createInternalAnchorText.trim()) {
      setCreateInternalError("Anchor text is required.");
      return;
    }

    setCreatingInternalLink(true);
    setCreateInternalError(null);

    try {
      const response = await authFetch("/v1/internal-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: createInternalProjectId,
          sourcePageId: createInternalSourcePageId,
          targetPageId: createInternalTargetPageId,
          anchorText: createInternalAnchorText.trim(),
          status: createInternalStatus,
          reason: createInternalReason.trim() || undefined
        })
      });

      const payload = (await parseJson<SingleResponse<InternalLink>>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setCreateInternalAnchorText("");
      setCreateInternalReason("");
      setCreateInternalStatus("SUGGESTED");
      setSelectedInternalLinkId(payload.data.id);

      if (internalPage !== 1) {
        setInternalPage(1);
      } else {
        await loadInternalLinks();
      }
    } catch (error) {
      setCreateInternalError(error instanceof Error ? error.message : "Failed to create internal link");
    } finally {
      setCreatingInternalLink(false);
    }
  };

  const handleUpdateInternalLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedInternalLink) return;

    if (!editInternalSourcePageId || !editInternalTargetPageId) {
      setEditInternalError("Source and target pages are required.");
      return;
    }

    if (editInternalSourcePageId === editInternalTargetPageId) {
      setEditInternalError("Source and target pages must be different.");
      return;
    }

    if (!editInternalAnchorText.trim()) {
      setEditInternalError("Anchor text is required.");
      return;
    }

    setUpdatingInternalLink(true);
    setEditInternalError(null);

    try {
      const response = await authFetch(`/v1/internal-links/${selectedInternalLink.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourcePageId: editInternalSourcePageId,
          targetPageId: editInternalTargetPageId,
          anchorText: editInternalAnchorText.trim(),
          status: editInternalStatus,
          reason: editInternalReason.trim() ? editInternalReason.trim() : null
        })
      });

      const payload = (await parseJson<SingleResponse<InternalLink>>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      await loadInternalLinks();
    } catch (error) {
      setEditInternalError(error instanceof Error ? error.message : "Failed to update internal link");
    } finally {
      setUpdatingInternalLink(false);
    }
  };

  const handleDeleteInternalLink = async () => {
    if (!selectedInternalLink) return;

    const confirmed = window.confirm(
      `Delete internal link ${selectedInternalLink.sourcePage.path} -> ${selectedInternalLink.targetPage.path}?`
    );
    if (!confirmed) return;

    setDeletingInternalLink(true);
    setEditInternalError(null);

    try {
      const response = await authFetch(`/v1/internal-links/${selectedInternalLink.id}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await parseJson<SingleResponse<InternalLink>>(response)) ?? undefined;
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedInternalLinkId(null);
      await loadInternalLinks();
    } catch (error) {
      setEditInternalError(error instanceof Error ? error.message : "Failed to delete internal link");
    } finally {
      setDeletingInternalLink(false);
    }
  };

  const handleCreateBacklinkOpportunity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createBacklinkProjectId) {
      setCreateBacklinkError("Project is required.");
      return;
    }

    if (!createBacklinkSourceDomain.trim()) {
      setCreateBacklinkError("Source domain is required.");
      return;
    }

    if (!createBacklinkTargetUrl.trim()) {
      setCreateBacklinkError("Target URL is required.");
      return;
    }

    const nextActionAtIso = createBacklinkNextActionAt.trim() ? fromDateTimeLocalValue(createBacklinkNextActionAt) : null;
    if (createBacklinkNextActionAt.trim() && !nextActionAtIso) {
      setCreateBacklinkError("Next action date/time is invalid.");
      return;
    }

    const lastContactedAtIso = createBacklinkLastContactedAt.trim()
      ? fromDateTimeLocalValue(createBacklinkLastContactedAt)
      : null;
    if (createBacklinkLastContactedAt.trim() && !lastContactedAtIso) {
      setCreateBacklinkError("Last contacted date/time is invalid.");
      return;
    }

    let authorityScore: number | null;
    try {
      authorityScore = parseOptionalAuthorityScore(createBacklinkAuthorityScore, "Authority score");
    } catch (error) {
      setCreateBacklinkError(error instanceof Error ? error.message : "Authority score is invalid.");
      return;
    }

    setCreatingBacklinkOpportunity(true);
    setCreateBacklinkError(null);

    try {
      const response = await authFetch("/v1/backlink-opportunities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: createBacklinkProjectId,
          sourceDomain: createBacklinkSourceDomain.trim(),
          targetUrl: createBacklinkTargetUrl.trim(),
          contactEmail: createBacklinkContactEmail.trim() || undefined,
          authorityScore,
          status: createBacklinkStatus,
          notes: createBacklinkNotes.trim() || undefined,
          nextActionAt: nextActionAtIso || undefined,
          lastContactedAt: lastContactedAtIso || undefined
        })
      });

      const payload = (await parseJson<SingleResponse<BacklinkOpportunity>>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setCreateBacklinkSourceDomain("");
      setCreateBacklinkTargetUrl("");
      setCreateBacklinkContactEmail("");
      setCreateBacklinkAuthorityScore("");
      setCreateBacklinkStatus("NEW");
      setCreateBacklinkNotes("");
      setCreateBacklinkNextActionAt("");
      setCreateBacklinkLastContactedAt("");
      setSelectedBacklinkId(payload.data.id);

      if (backlinkPage !== 1) {
        setBacklinkPage(1);
      } else {
        await loadBacklinkOpportunities();
      }
    } catch (error) {
      setCreateBacklinkError(error instanceof Error ? error.message : "Failed to create backlink opportunity");
    } finally {
      setCreatingBacklinkOpportunity(false);
    }
  };

  const handleUpdateBacklinkOpportunity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBacklink) return;

    if (!editBacklinkSourceDomain.trim()) {
      setEditBacklinkError("Source domain is required.");
      return;
    }

    if (!editBacklinkTargetUrl.trim()) {
      setEditBacklinkError("Target URL is required.");
      return;
    }

    const nextActionAtIso = editBacklinkNextActionAt.trim() ? fromDateTimeLocalValue(editBacklinkNextActionAt) : null;
    if (editBacklinkNextActionAt.trim() && !nextActionAtIso) {
      setEditBacklinkError("Next action date/time is invalid.");
      return;
    }

    const lastContactedAtIso = editBacklinkLastContactedAt.trim() ? fromDateTimeLocalValue(editBacklinkLastContactedAt) : null;
    if (editBacklinkLastContactedAt.trim() && !lastContactedAtIso) {
      setEditBacklinkError("Last contacted date/time is invalid.");
      return;
    }

    let authorityScore: number | null;
    try {
      authorityScore = parseOptionalAuthorityScore(editBacklinkAuthorityScore, "Authority score");
    } catch (error) {
      setEditBacklinkError(error instanceof Error ? error.message : "Authority score is invalid.");
      return;
    }

    setUpdatingBacklinkOpportunity(true);
    setEditBacklinkError(null);

    try {
      const response = await authFetch(`/v1/backlink-opportunities/${selectedBacklink.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceDomain: editBacklinkSourceDomain.trim(),
          targetUrl: editBacklinkTargetUrl.trim(),
          contactEmail: editBacklinkContactEmail.trim() ? editBacklinkContactEmail.trim() : null,
          authorityScore,
          status: editBacklinkStatus,
          notes: editBacklinkNotes.trim() ? editBacklinkNotes.trim() : null,
          nextActionAt: nextActionAtIso,
          lastContactedAt: lastContactedAtIso
        })
      });

      const payload = (await parseJson<SingleResponse<BacklinkOpportunity>>(response)) ?? undefined;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      await loadBacklinkOpportunities();
    } catch (error) {
      setEditBacklinkError(error instanceof Error ? error.message : "Failed to update backlink opportunity");
    } finally {
      setUpdatingBacklinkOpportunity(false);
    }
  };

  const handleDeleteBacklinkOpportunity = async () => {
    if (!selectedBacklink) return;

    const confirmed = window.confirm(`Delete backlink opportunity from ${selectedBacklink.sourceDomain}?`);
    if (!confirmed) return;

    setDeletingBacklinkOpportunity(true);
    setEditBacklinkError(null);

    try {
      const response = await authFetch(`/v1/backlink-opportunities/${selectedBacklink.id}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await parseJson<SingleResponse<BacklinkOpportunity>>(response)) ?? undefined;
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSelectedBacklinkId(null);
      await loadBacklinkOpportunities();
    } catch (error) {
      setEditBacklinkError(error instanceof Error ? error.message : "Failed to delete backlink opportunity");
    } finally {
      setDeletingBacklinkOpportunity(false);
    }
  };

  const internalCanPrev = internalPage > 1;
  const internalCanNext = internalLinksMeta.totalPages > 0 && internalPage < internalLinksMeta.totalPages;

  const backlinkCanPrev = backlinkPage > 1;
  const backlinkCanNext = backlinkMeta.totalPages > 0 && backlinkPage < backlinkMeta.totalPages;

  return (
    <>
      <section className="panel">
        <h2>Create Internal Link</h2>
        <form className="form" onSubmit={handleCreateInternalLink}>
          <label>
            Project
            <select
              value={createInternalProjectId}
              onChange={(event) => {
                setCreateInternalProjectId(event.target.value);
                setCreateInternalSourcePageId("");
                setCreateInternalTargetPageId("");
              }}
              disabled={!token || creatingInternalLink || projects.length === 0}
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
            Source page
            <select
              value={createInternalSourcePageId}
              onChange={(event) => setCreateInternalSourcePageId(event.target.value)}
              disabled={!token || creatingInternalLink || pagesForCreateInternalProject.length === 0}
              required
            >
              <option value="" disabled>
                {pagesForCreateInternalProject.length === 0 ? "Create pages for this project first" : "Select source page"}
              </option>
              {pagesForCreateInternalProject.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Target page
            <select
              value={createInternalTargetPageId}
              onChange={(event) => setCreateInternalTargetPageId(event.target.value)}
              disabled={!token || creatingInternalLink || pagesForCreateInternalProject.length === 0}
              required
            >
              <option value="" disabled>
                {pagesForCreateInternalProject.length === 0 ? "Create pages for this project first" : "Select target page"}
              </option>
              {pagesForCreateInternalProject.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Anchor text
            <input
              value={createInternalAnchorText}
              onChange={(event) => setCreateInternalAnchorText(event.target.value)}
              maxLength={255}
              required
            />
          </label>

          <label>
            Status
            <select value={createInternalStatus} onChange={(event) => setCreateInternalStatus(event.target.value as LinkStatus)}>
              <option value="SUGGESTED">SUGGESTED</option>
              <option value="APPLIED">APPLIED</option>
              <option value="IGNORED">IGNORED</option>
            </select>
          </label>

          <label>
            Reason (optional)
            <textarea value={createInternalReason} onChange={(event) => setCreateInternalReason(event.target.value)} rows={3} />
          </label>

          <button type="submit" disabled={!token || creatingInternalLink || pagesForCreateInternalProject.length < 2}>
            {creatingInternalLink ? "Creating..." : "Create internal link"}
          </button>

          {createInternalError ? <p className="error">{createInternalError}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Internal Links</h2>
          <button type="button" onClick={() => void loadInternalLinks()} disabled={!token || internalLinksLoading}>
            Refresh
          </button>
        </div>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setInternalPage(1);
          }}
        >
          <label>
            Project
            <select
              value={internalProjectFilterId}
              onChange={(event) => {
                setInternalProjectFilterId(event.target.value);
                setInternalSourceFilterId("");
                setInternalTargetFilterId("");
                setInternalPage(1);
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
            Source page
            <select
              value={internalSourceFilterId}
              onChange={(event) => {
                setInternalSourceFilterId(event.target.value);
                setInternalPage(1);
              }}
              disabled={!token || pagesForInternalProjectFilter.length === 0}
            >
              <option value="">All source pages</option>
              {pagesForInternalProjectFilter.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Target page
            <select
              value={internalTargetFilterId}
              onChange={(event) => {
                setInternalTargetFilterId(event.target.value);
                setInternalPage(1);
              }}
              disabled={!token || pagesForInternalProjectFilter.length === 0}
            >
              <option value="">All target pages</option>
              {pagesForInternalProjectFilter.map((pageItem) => (
                <option key={pageItem.id} value={pageItem.id}>
                  {pageItem.path}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={internalStatusFilter}
              onChange={(event) => {
                setInternalStatusFilter(event.target.value as "" | LinkStatus);
                setInternalPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="SUGGESTED">SUGGESTED</option>
              <option value="APPLIED">APPLIED</option>
              <option value="IGNORED">IGNORED</option>
            </select>
          </label>

          <label>
            Search
            <input
              type="text"
              value={internalQuery}
              onChange={(event) => {
                setInternalQuery(event.target.value);
                setInternalPage(1);
              }}
              placeholder="Anchor, reason, source, target"
            />
          </label>

          <label>
            Sort
            <select
              value={internalSort}
              onChange={(event) => {
                setInternalSort(event.target.value as typeof internalSort);
                setInternalPage(1);
              }}
            >
              <option value="createdAt_desc">Created newest</option>
              <option value="createdAt_asc">Created oldest</option>
              <option value="updatedAt_desc">Updated newest</option>
              <option value="updatedAt_asc">Updated oldest</option>
              <option value="anchorText_asc">Anchor text A→Z</option>
              <option value="anchorText_desc">Anchor text Z→A</option>
            </select>
          </label>
        </form>

        <p className="muted">{internalLinksLoading ? "Loading..." : `${internalLinksMeta.total} total internal links`}</p>
        {internalLinksError ? <p className="error">{internalLinksError}</p> : null}

        {!internalLinksError && internalLinks.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Source</th>
                  <th>Target</th>
                  <th>Anchor</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {internalLinks.map((link) => (
                  <tr key={link.id}>
                    <td>{link.project.slug}</td>
                    <td>{link.sourcePage.path}</td>
                    <td>{link.targetPage.path}</td>
                    <td>{link.anchorText}</td>
                    <td>{link.status}</td>
                    <td>{new Date(link.updatedAt).toLocaleString()}</td>
                    <td>
                      <button type="button" onClick={() => setSelectedInternalLinkId(link.id)}>
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
            onClick={() => setInternalPage((prev) => Math.max(1, prev - 1))}
            disabled={!internalCanPrev || internalLinksLoading || !token}
          >
            Previous
          </button>
          <p className="muted">
            Page {internalLinksMeta.page} of {Math.max(internalLinksMeta.totalPages, 1)}
          </p>
          <button
            type="button"
            onClick={() => setInternalPage((prev) => prev + 1)}
            disabled={!internalCanNext || internalLinksLoading || !token}
          >
            Next
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Internal Link Detail</h2>
        {!selectedInternalLink ? <p className="muted">Select an internal link to edit.</p> : null}

        {selectedInternalLink ? (
          <form className="form" onSubmit={handleUpdateInternalLink}>
            <p className="muted">
              Project: <strong>{selectedInternalLink.project.name}</strong> ({selectedInternalLink.project.slug})
            </p>

            <label>
              Source page
              <select value={editInternalSourcePageId} onChange={(event) => setEditInternalSourcePageId(event.target.value)} required>
                {pagesForSelectedInternalProject.map((pageItem) => (
                  <option key={pageItem.id} value={pageItem.id}>
                    {pageItem.path}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Target page
              <select value={editInternalTargetPageId} onChange={(event) => setEditInternalTargetPageId(event.target.value)} required>
                {pagesForSelectedInternalProject.map((pageItem) => (
                  <option key={pageItem.id} value={pageItem.id}>
                    {pageItem.path}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Anchor text
              <input
                value={editInternalAnchorText}
                onChange={(event) => setEditInternalAnchorText(event.target.value)}
                maxLength={255}
                required
              />
            </label>

            <label>
              Status
              <select value={editInternalStatus} onChange={(event) => setEditInternalStatus(event.target.value as LinkStatus)}>
                <option value="SUGGESTED">SUGGESTED</option>
                <option value="APPLIED">APPLIED</option>
                <option value="IGNORED">IGNORED</option>
              </select>
            </label>

            <label>
              Reason (blank clears)
              <textarea value={editInternalReason} onChange={(event) => setEditInternalReason(event.target.value)} rows={3} />
            </label>

            <div className="panel-header">
              <button type="submit" disabled={updatingInternalLink || deletingInternalLink}>
                {updatingInternalLink ? "Saving..." : "Save changes"}
              </button>
              <button type="button" onClick={handleDeleteInternalLink} disabled={updatingInternalLink || deletingInternalLink}>
                {deletingInternalLink ? "Deleting..." : "Delete internal link"}
              </button>
            </div>

            {editInternalError ? <p className="error">{editInternalError}</p> : null}
          </form>
        ) : null}
      </section>

      <section className="panel">
        <h2>Create Backlink Opportunity</h2>
        <form className="form" onSubmit={handleCreateBacklinkOpportunity}>
          <label>
            Project
            <select
              value={createBacklinkProjectId}
              onChange={(event) => setCreateBacklinkProjectId(event.target.value)}
              disabled={!token || creatingBacklinkOpportunity || projects.length === 0}
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
            Source domain
            <input
              value={createBacklinkSourceDomain}
              onChange={(event) => setCreateBacklinkSourceDomain(event.target.value)}
              placeholder="news.example.com"
              required
            />
          </label>

          <label>
            Target URL
            <input
              value={createBacklinkTargetUrl}
              onChange={(event) => setCreateBacklinkTargetUrl(event.target.value)}
              placeholder="https://acme.com/blog/link-ops"
              required
            />
          </label>

          <label>
            Contact email (optional)
            <input
              type="email"
              value={createBacklinkContactEmail}
              onChange={(event) => setCreateBacklinkContactEmail(event.target.value)}
              placeholder="editor@example.com"
            />
          </label>

          <label>
            Authority score (0-100, optional)
            <input
              type="number"
              min={0}
              max={100}
              value={createBacklinkAuthorityScore}
              onChange={(event) => setCreateBacklinkAuthorityScore(event.target.value)}
            />
          </label>

          <label>
            Status
            <select value={createBacklinkStatus} onChange={(event) => setCreateBacklinkStatus(event.target.value as OutreachStatus)}>
              <option value="NEW">NEW</option>
              <option value="CONTACTED">CONTACTED</option>
              <option value="RESPONDED">RESPONDED</option>
              <option value="WON">WON</option>
              <option value="LOST">LOST</option>
            </select>
          </label>

          <label>
            Notes (optional)
            <textarea value={createBacklinkNotes} onChange={(event) => setCreateBacklinkNotes(event.target.value)} rows={3} />
          </label>

          <label>
            Next action at (optional)
            <input
              type="datetime-local"
              value={createBacklinkNextActionAt}
              onChange={(event) => setCreateBacklinkNextActionAt(event.target.value)}
            />
          </label>

          <label>
            Last contacted at (optional)
            <input
              type="datetime-local"
              value={createBacklinkLastContactedAt}
              onChange={(event) => setCreateBacklinkLastContactedAt(event.target.value)}
            />
          </label>

          <button type="submit" disabled={!token || creatingBacklinkOpportunity}>
            {creatingBacklinkOpportunity ? "Creating..." : "Create backlink opportunity"}
          </button>

          {createBacklinkError ? <p className="error">{createBacklinkError}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Backlink Opportunities</h2>
          <button type="button" onClick={() => void loadBacklinkOpportunities()} disabled={!token || backlinkLoading}>
            Refresh
          </button>
        </div>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setBacklinkPage(1);
          }}
        >
          <label>
            Project
            <select
              value={backlinkProjectFilterId}
              onChange={(event) => {
                setBacklinkProjectFilterId(event.target.value);
                setBacklinkPage(1);
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
            Status
            <select
              value={backlinkStatusFilter}
              onChange={(event) => {
                setBacklinkStatusFilter(event.target.value as "" | OutreachStatus);
                setBacklinkPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="NEW">NEW</option>
              <option value="CONTACTED">CONTACTED</option>
              <option value="RESPONDED">RESPONDED</option>
              <option value="WON">WON</option>
              <option value="LOST">LOST</option>
            </select>
          </label>

          <label>
            Contact email
            <select
              value={backlinkHasContactFilter}
              onChange={(event) => {
                setBacklinkHasContactFilter(event.target.value as "all" | "has" | "none");
                setBacklinkPage(1);
              }}
            >
              <option value="all">All</option>
              <option value="has">Has email</option>
              <option value="none">No email</option>
            </select>
          </label>

          <label>
            Search
            <input
              type="text"
              value={backlinkQuery}
              onChange={(event) => {
                setBacklinkQuery(event.target.value);
                setBacklinkPage(1);
              }}
              placeholder="Domain, URL, notes"
            />
          </label>

          <label>
            Sort
            <select
              value={backlinkSort}
              onChange={(event) => {
                setBacklinkSort(event.target.value as typeof backlinkSort);
                setBacklinkPage(1);
              }}
            >
              <option value="createdAt_desc">Created newest</option>
              <option value="createdAt_asc">Created oldest</option>
              <option value="updatedAt_desc">Updated newest</option>
              <option value="updatedAt_asc">Updated oldest</option>
              <option value="authorityScore_desc">Authority high→low</option>
              <option value="authorityScore_asc">Authority low→high</option>
              <option value="nextActionAt_asc">Next action soonest</option>
              <option value="nextActionAt_desc">Next action latest</option>
            </select>
          </label>
        </form>

        <p className="muted">{backlinkLoading ? "Loading..." : `${backlinkMeta.total} total opportunities`}</p>
        {backlinkError ? <p className="error">{backlinkError}</p> : null}

        {!backlinkError && backlinkOpportunities.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Source Domain</th>
                  <th>Target URL</th>
                  <th>Status</th>
                  <th>Authority</th>
                  <th>Next Action</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backlinkOpportunities.map((opportunity) => (
                  <tr key={opportunity.id}>
                    <td>{opportunity.project.slug}</td>
                    <td>{opportunity.sourceDomain}</td>
                    <td>
                      <a href={opportunity.targetUrl} target="_blank" rel="noreferrer noopener">
                        {opportunity.targetUrl}
                      </a>
                    </td>
                    <td>{opportunity.status}</td>
                    <td>{opportunity.authorityScore ?? "—"}</td>
                    <td>{opportunity.nextActionAt ? new Date(opportunity.nextActionAt).toLocaleString() : "—"}</td>
                    <td>
                      <button type="button" onClick={() => setSelectedBacklinkId(opportunity.id)}>
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
            onClick={() => setBacklinkPage((prev) => Math.max(1, prev - 1))}
            disabled={!backlinkCanPrev || backlinkLoading || !token}
          >
            Previous
          </button>
          <p className="muted">
            Page {backlinkMeta.page} of {Math.max(backlinkMeta.totalPages, 1)}
          </p>
          <button
            type="button"
            onClick={() => setBacklinkPage((prev) => prev + 1)}
            disabled={!backlinkCanNext || backlinkLoading || !token}
          >
            Next
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Backlink Opportunity Detail</h2>
        {!selectedBacklink ? <p className="muted">Select a backlink opportunity to edit.</p> : null}

        {selectedBacklink ? (
          <form className="form" onSubmit={handleUpdateBacklinkOpportunity}>
            <p className="muted">
              Project: <strong>{selectedBacklink.project.name}</strong> ({selectedBacklink.project.slug})
            </p>

            <label>
              Source domain
              <input value={editBacklinkSourceDomain} onChange={(event) => setEditBacklinkSourceDomain(event.target.value)} required />
            </label>

            <label>
              Target URL
              <input value={editBacklinkTargetUrl} onChange={(event) => setEditBacklinkTargetUrl(event.target.value)} required />
            </label>

            <label>
              Contact email (blank clears)
              <input
                type="email"
                value={editBacklinkContactEmail}
                onChange={(event) => setEditBacklinkContactEmail(event.target.value)}
              />
            </label>

            <label>
              Authority score (0-100, blank clears)
              <input
                type="number"
                min={0}
                max={100}
                value={editBacklinkAuthorityScore}
                onChange={(event) => setEditBacklinkAuthorityScore(event.target.value)}
              />
            </label>

            <label>
              Status
              <select value={editBacklinkStatus} onChange={(event) => setEditBacklinkStatus(event.target.value as OutreachStatus)}>
                <option value="NEW">NEW</option>
                <option value="CONTACTED">CONTACTED</option>
                <option value="RESPONDED">RESPONDED</option>
                <option value="WON">WON</option>
                <option value="LOST">LOST</option>
              </select>
            </label>

            <label>
              Notes (blank clears)
              <textarea value={editBacklinkNotes} onChange={(event) => setEditBacklinkNotes(event.target.value)} rows={3} />
            </label>

            <label>
              Next action at (blank clears)
              <input
                type="datetime-local"
                value={editBacklinkNextActionAt}
                onChange={(event) => setEditBacklinkNextActionAt(event.target.value)}
              />
            </label>

            <label>
              Last contacted at (blank clears)
              <input
                type="datetime-local"
                value={editBacklinkLastContactedAt}
                onChange={(event) => setEditBacklinkLastContactedAt(event.target.value)}
              />
            </label>

            <div className="panel-header">
              <button type="submit" disabled={updatingBacklinkOpportunity || deletingBacklinkOpportunity}>
                {updatingBacklinkOpportunity ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={handleDeleteBacklinkOpportunity}
                disabled={updatingBacklinkOpportunity || deletingBacklinkOpportunity}
              >
                {deletingBacklinkOpportunity ? "Deleting..." : "Delete opportunity"}
              </button>
            </div>

            {editBacklinkError ? <p className="error">{editBacklinkError}</p> : null}
          </form>
        ) : null}
      </section>
    </>
  );
}
