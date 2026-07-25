"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthScheme, ChatRole, Endpoint, PlatformUnderstanding, Resource } from "@scout/types";
import type { PlatformStatus } from "@scout/ui";

export interface ChatSource {
  type: "docs" | "web" | "model_knowledge";
  ref: string;
  title?: string;
  score?: number;
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
    mutationFn: (input: { lang: "ts" | "py"; workflow?: string }) =>
      request<HandoffResult>(`/api/runs/${slug}/handoff`, { method: "POST", body: JSON.stringify(input) }),
  });
}

export function useChatMessages(slug: string) {
  return useQuery({
    queryKey: ["chat", slug],
    queryFn: () => request<ChatMessageRecord[]>(`/api/runs/${slug}/chat`),
    enabled: !!slug,
  });
}

export function useSendChatMessage(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      request<ChatMessageRecord>(`/api/runs/${slug}/chat`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat", slug] }),
  });
}
