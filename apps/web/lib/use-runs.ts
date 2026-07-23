"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Citation, ChatRole, Endpoint, PlatformUnderstanding, Resource } from "@scout/types";
import type { PlatformStatus } from "@scout/ui";

export interface RunSummary {
  id: string;
  slug: string;
  connectorSlug: string;
  name: string;
  status: PlatformStatus;
  updatedAt: string;
}

export interface RunDetail {
  platform: RunSummary & { baseUrl: string | null; docsUrl: string | null };
  endpoints: Endpoint[];
  understanding: PlatformUnderstanding | null;
  resources: Resource[];
}

export interface ChatMessageRecord {
  id: string;
  role: ChatRole;
  content: string;
  citations: Citation[];
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

export function useRuns() {
  return useQuery({
    queryKey: ["runs"],
    queryFn: () => request<RunSummary[]>("/api/runs"),
    refetchInterval: 5000,
  });
}

export function useRun(slug: string) {
  return useQuery({
    queryKey: ["run", slug],
    queryFn: () => request<RunDetail>(`/api/runs/${slug}`),
    enabled: !!slug,
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
