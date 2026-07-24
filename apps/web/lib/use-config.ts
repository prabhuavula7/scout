"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LLMRole, MaskedLLMProviderEntry, MaskedScoutConfig, MaskedSearchProviderEntry } from "@scout/types";

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

export function useScoutConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => request<MaskedScoutConfig>("/api/config"),
  });
}

export interface UpsertLLMProviderInput {
  id?: string | undefined;
  kind: MaskedLLMProviderEntry["kind"];
  label?: string | undefined;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  chatModel?: string | undefined;
  embeddingModel?: string | undefined;
  azureApiVersion?: string | undefined;
  roles: LLMRole[];
  priority: number;
  enabled: boolean;
}

export function useUpsertLLMProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertLLMProviderInput) =>
      request<MaskedScoutConfig>("/api/config/llm", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (data) => queryClient.setQueryData(["config"], data),
  });
}

export function useRemoveLLMProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<MaskedScoutConfig>(`/api/config/llm/${id}`, { method: "DELETE" }),
    onSuccess: (data) => queryClient.setQueryData(["config"], data),
  });
}

export interface UpsertSearchProviderInput {
  id?: string | undefined;
  kind: MaskedSearchProviderEntry["kind"];
  label?: string | undefined;
  apiKey?: string | undefined;
  priority: number;
  enabled: boolean;
}

export function useUpsertSearchProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertSearchProviderInput) =>
      request<MaskedScoutConfig>("/api/config/search", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (data) => queryClient.setQueryData(["config"], data),
  });
}

export function useRemoveSearchProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<MaskedScoutConfig>(`/api/config/search/${id}`, { method: "DELETE" }),
    onSuccess: (data) => queryClient.setQueryData(["config"], data),
  });
}
