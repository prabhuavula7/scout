"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthScheme, ChatRole, Endpoint, PlatformUnderstanding, Resource } from "@scout/types";
import type { PlatformStatus } from "@scout/ui";

export interface ChatSource {
  type: "docs" | "web" | "model_knowledge";
  ref: string;
  title?: string;
  score?: number;
  /** Set on "docs" sources so a thread spanning more than one platform can
   * show which one a citation actually came from. */
  platformSlug?: string;
  platformName?: string;
}

export interface RunSummary {
  id: string;
  slug: string;
  connectorSlug: string;
  name: string;
  status: PlatformStatus;
  updatedAt: string;
}

export interface RunDetail {
  platform: RunSummary & {
    baseUrl: string | null;
    docsUrl: string | null;
    authScheme: AuthScheme | null;
    docsCrawlWarning?: string | null;
    understandingScopeWarning?: string | null;
    crawlOptions?: { maxDepth: number; maxPages: number };
    docUrls?: string[];
  };
  endpoints: Endpoint[];
  understanding: PlatformUnderstanding | null;
  resources: Resource[];
  /** Why the run failed, when status is "failed"; null otherwise or if no
   * agent-run record captured a reason. */
  lastError: string | null;
}

export interface ChatMessageRecord {
  id: string;
  role: ChatRole;
  content: string;
  citations: ChatSource[];
  createdAt: string;
}

export interface ChatThreadRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? "Request failed");
  }
  return response.json();
}

export interface ConnectorDefinition {
  slug: string;
  name: string;
  category: string;
  implemented: boolean;
  suggestedDocsUrl: string | null;
  defaultAuthScheme: string;
  description: string;
}

export function useRuns() {
  return useQuery({
    queryKey: ["runs"],
    queryFn: () => request<RunSummary[]>("/api/runs"),
    refetchInterval: 5000,
  });
}

export function useConnectors() {
  return useQuery({
    queryKey: ["connectors"],
    queryFn: () => request<ConnectorDefinition[]>("/api/connectors"),
    staleTime: Infinity,
  });
}

export interface CreateRunInput {
  source: string;
  kind: "openapi_url" | "openapi_raw";
  docUrls: string[];
  label?: string | undefined;
  connectorSlug?: string | undefined;
  docsDepth: number;
  docsMaxPages: number;
}

export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRunInput) =>
      request<{ slug: string }>("/api/runs", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["runs"] }),
  });
}

export function useEstimateCrawl() {
  return useMutation({
    mutationFn: (input: { docUrls: string[]; docsDepth: number; docsMaxPages: number }) =>
      request<{ text: string }>("/api/runs/estimate", { method: "POST", body: JSON.stringify(input) }),
  });
}

export function useRemoveRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => request<{ ok: true }>(`/api/runs/${slug}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["runs"] }),
  });
}

const TERMINAL_STATUSES: RunSummary["status"][] = ["ready", "failed"];

export function useRun(slug: string) {
  return useQuery({
    queryKey: ["run", slug],
    queryFn: () => request<RunDetail>(`/api/runs/${slug}`),
    enabled: !!slug,
    // A run created via "New" redirects here while it's still importing/
    // crawling/embedding in the background; without polling, this query
    // fetches once and then never updates again (refetchOnWindowFocus is
    // off globally), so the page would silently sit on whatever status it
    // saw first, including "importing" forever after the run actually
    // failed. Poll every 2s until the status is terminal, then stop.
    refetchInterval: (query) => {
      const status = query.state.data?.platform.status;
      return status && TERMINAL_STATUSES.includes(status) ? false : 2000;
    },
  });
}

export function useRefreshRun(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { mode: "resynthesize" | "recrawl"; docsDepth?: number; docsMaxPages?: number }) =>
      request<{ ok: true }>(`/api/runs/${slug}/refresh`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["run", slug] }),
  });
}

export function useRunResearch(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => request<Resource[]>(`/api/runs/${slug}/research`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["run", slug] }),
  });
}

export interface GeneratedCode {
  code: string;
  isStub: boolean;
  stubReason?: string;
  workflowUsed: string | null;
  syntaxValidated: boolean;
  syntaxValidationNote?: string;
  envExample?: string;
  workflowMismatch: boolean;
}

export function useGenerateCode(slug: string) {
  return useMutation({
    mutationFn: (input: { lang: "ts" | "py"; workflow?: string }) =>
      request<GeneratedCode>(`/api/runs/${slug}/generate`, { method: "POST", body: JSON.stringify(input) }),
  });
}

export interface HandoffResult {
  markdown: string;
  workflowUsed: string | null;
}

export function useHandoff(slug: string) {
  return useMutation({
    mutationFn: (input: { lang: "ts" | "py"; workflow?: string; threadId?: string }) =>
      request<HandoffResult>(`/api/runs/${slug}/handoff`, { method: "POST", body: JSON.stringify(input) }),
  });
}

export function useChatThreads(slug: string) {
  return useQuery({
    queryKey: ["chat-threads", slug],
    queryFn: () => request<ChatThreadRecord[]>(`/api/runs/${slug}/threads`),
    enabled: !!slug,
  });
}

export function useCreateChatThread(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) =>
      request<ChatThreadRecord>(`/api/runs/${slug}/threads`, {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-threads", slug] }),
  });
}

/** Same endpoint as useCreateChatThread, but parameterized per-call by slug
 * instead of baked into the hook -- for the flattened Threads page, where
 * "which run" is a choice made at click time (a picker over every run),
 * not something a single hook instance can be bound to ahead of time. */
export function useCreateThreadForRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { slug: string; title?: string }) =>
      request<ChatThreadRecord>(`/api/runs/${input.slug}/threads`, { method: "POST", body: JSON.stringify({ title: input.title }) }),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["chat-threads", input.slug] });
      queryClient.invalidateQueries({ queryKey: ["unified-threads"] });
    },
  });
}

export function useRenameChatThread(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { threadId: string; title: string }) =>
      request<{ ok: true }>(`/api/runs/${slug}/threads/${input.threadId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: input.title }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-threads", slug] }),
  });
}

export function useDeleteChatThread(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      request<{ ok: true }>(`/api/runs/${slug}/threads/${threadId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-threads", slug] }),
  });
}

/** Identifies a thread regardless of whether it's scoped to one run
 * (LocalFileStore-backed) or spans several (MultiRunThreadStore-backed) --
 * ChatPane and the Threads page work against this instead of a bare slug so
 * a multi-run thread isn't forced to pretend it belongs to one run. */
export type ThreadTarget = { kind: "single"; slug: string; threadId: string } | { kind: "multi"; threadId: string };

function threadMessagesPath(target: ThreadTarget): string {
  return target.kind === "single"
    ? `/api/runs/${target.slug}/threads/${target.threadId}/messages`
    : `/api/multi-threads/${target.threadId}/messages`;
}

function threadMessagesQueryKey(target: ThreadTarget): unknown[] {
  return target.kind === "single"
    ? ["thread-messages", "single", target.slug, target.threadId]
    : ["thread-messages", "multi", target.threadId];
}

export function useThreadMessages(target: ThreadTarget | null) {
  return useQuery({
    queryKey: target ? threadMessagesQueryKey(target) : ["thread-messages", "none"],
    queryFn: () => request<ChatMessageRecord[]>(threadMessagesPath(target!)),
    enabled: !!target,
  });
}

export function useSendThreadMessage(target: ThreadTarget | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => request<ChatMessageRecord>(threadMessagesPath(target!), { method: "POST", body: JSON.stringify({ message }) }),
    onSuccess: () => {
      if (!target) return;
      queryClient.invalidateQueries({ queryKey: threadMessagesQueryKey(target) });
      queryClient.invalidateQueries({ queryKey: ["unified-threads"] });
      if (target.kind === "single") queryClient.invalidateQueries({ queryKey: ["chat-threads", target.slug] });
    },
  });
}

export interface UnifiedThreadSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  kind: "single" | "multi";
  platformSlugs: string[];
  platformNames: string[];
}

export function useUnifiedThreads() {
  return useQuery({
    queryKey: ["unified-threads"],
    queryFn: () => request<UnifiedThreadSummary[]>("/api/threads"),
    refetchInterval: 5000,
  });
}

export function useCreateMultiThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { platformSlugs: string[]; title?: string }) =>
      request<{ id: string }>("/api/multi-threads", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["unified-threads"] }),
  });
}

function threadRecordPath(target: ThreadTarget): string {
  return target.kind === "single" ? `/api/runs/${target.slug}/threads/${target.threadId}` : `/api/multi-threads/${target.threadId}`;
}

export function useRenameThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { target: ThreadTarget; title: string }) =>
      request<{ ok: true }>(threadRecordPath(input.target), { method: "PATCH", body: JSON.stringify({ title: input.title }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["unified-threads"] }),
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: ThreadTarget) => request<{ ok: true }>(threadRecordPath(target), { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["unified-threads"] }),
  });
}

export interface DocSource {
  sourceUrl: string;
  sourceTitle: string;
  chunkCount: number;
  origin?: "crawl" | "upload" | "link";
}

export function useDocSources(slug: string) {
  return useQuery({
    queryKey: ["doc-sources", slug],
    queryFn: () => request<DocSource[]>(`/api/runs/${slug}/documents`),
    enabled: !!slug,
  });
}

export function useAttachFile(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/runs/${slug}/documents`, { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(body.error ?? "Upload failed");
      }
      return response.json() as Promise<{ chunksStored: number; sourceTitle: string }>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["doc-sources", slug] }),
  });
}

export function useAttachLink(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) =>
      request<{ chunksStored: number; sourceTitle: string }>(`/api/runs/${slug}/documents`, {
        method: "POST",
        body: JSON.stringify({ url }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["doc-sources", slug] }),
  });
}

export function useRemoveDocSource(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceUrl: string) =>
      request<{ removed: number }>(`/api/runs/${slug}/documents`, {
        method: "DELETE",
        body: JSON.stringify({ sourceUrl }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["doc-sources", slug] }),
  });
}
