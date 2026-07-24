"use client";

import { useState } from "react";
import { KeyRound, Search as SearchIcon, Trash2 } from "lucide-react";
import type {
  LLMProviderKind,
  LLMRole,
  MaskedLLMProviderEntry,
  MaskedSearchProviderEntry,
  SearchProviderKind,
} from "@scout/types";
import {
  useRemoveLLMProvider,
  useRemoveSearchProvider,
  useScoutConfig,
  useUpsertLLMProvider,
  useUpsertSearchProvider,
} from "@/lib/use-config";

const LLM_KIND_LABELS: Record<LLMProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  "azure-openai": "Azure OpenAI",
  openrouter: "OpenRouter",
  "openai-compatible": "Other (OpenAI-compatible endpoint)",
};

const SEARCH_KIND_LABELS: Record<SearchProviderKind, string> = {
  tavily: "Tavily",
  serpapi: "SerpApi",
};

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100";
const labelClass = "block text-xs font-medium text-stone-500 dark:text-stone-400";
const cardClass = "rounded-xl border border-stone-200 p-5 dark:border-stone-800";

export default function SettingsPage() {
  const { data: config, isLoading } = useScoutConfig();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div>
        <h1 className="font-serif text-2xl font-medium tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Configure the LLM and web search providers Scout uses. Add more than one for either role and they'll be
          tried in priority order, falling back automatically if one fails. Stored locally in{" "}
          <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs dark:bg-stone-900">
            ~/.scout/config.json
          </code>
          .
        </p>
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-stone-500">Loading…</p>
      ) : (
        <div className="mt-8 space-y-10">
          <LLMProvidersSection entries={config?.llmProviders ?? []} />
          <SearchProvidersSection entries={config?.searchProviders ?? []} />
        </div>
      )}
    </main>
  );
}

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-accent-500">{icon}</span>
      <div>
        <h2 className="font-serif text-lg font-medium">{title}</h2>
        <p className="text-xs text-stone-500 dark:text-stone-400">{description}</p>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: LLMRole }) {
  return (
    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-400">
      {role}
    </span>
  );
}

function LLMProvidersSection({ entries }: { entries: MaskedLLMProviderEntry[] }) {
  const remove = useRemoveLLMProvider();
  const upsert = useUpsertLLMProvider();
  const sorted = [...entries].sort((a, b) => a.priority - b.priority);

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={<KeyRound className="h-4 w-4" />}
        title="LLM providers"
        description="OpenAI, Anthropic, Azure OpenAI, OpenRouter, or any OpenAI-compatible endpoint (local/open-source models included)."
      />

      {sorted.length === 0 && (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          No providers yet. Add one below to run <code className="font-mono text-xs">scout understand</code> or use
          the chat.
        </p>
      )}

      {sorted.length > 0 && (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          {sorted.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                  {entry.label || LLM_KIND_LABELS[entry.kind]}{" "}
                  <span className="font-normal text-stone-400">
                    {LLM_KIND_LABELS[entry.kind]} · priority {entry.priority}
                  </span>
                </p>
                <div className="mt-1 flex gap-1.5">
                  {entry.roles.map((r) => (
                    <RoleBadge key={r} role={r} />
                  ))}
                  {!entry.apiKeySet && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
                      no key
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={() =>
                      upsert.mutate({
                        id: entry.id,
                        kind: entry.kind,
                        label: entry.label,
                        baseUrl: entry.baseUrl,
                        chatModel: entry.chatModel,
                        embeddingModel: entry.embeddingModel,
                        azureApiVersion: entry.azureApiVersion,
                        roles: entry.roles,
                        priority: entry.priority,
                        enabled: !entry.enabled,
                      })
                    }
                  />
                  enabled
                </label>
                <button
                  type="button"
                  onClick={() => remove.mutate(entry.id)}
                  aria-label="Remove provider"
                  className="rounded-lg p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddLLMProviderForm existingCount={entries.length} />
    </section>
  );
}

function AddLLMProviderForm({ existingCount }: { existingCount: number }) {
  const upsert = useUpsertLLMProvider();
  const [kind, setKind] = useState<LLMProviderKind>("openai");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [azureApiVersion, setAzureApiVersion] = useState("");
  const [roles, setRoles] = useState<LLMRole[]>(["chat", "embedding"]);

  const supportsEmbedding = kind !== "anthropic";
  const needsBaseUrl = kind === "openai-compatible" || kind === "azure-openai";

  function toggleRole(role: LLMRole) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() && kind !== "openai-compatible") return;
    if (needsBaseUrl && !baseUrl.trim()) return;

    upsert.mutate(
      {
        kind,
        label: label.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        chatModel: chatModel.trim() || undefined,
        embeddingModel: embeddingModel.trim() || undefined,
        azureApiVersion: azureApiVersion.trim() || undefined,
        roles: supportsEmbedding ? roles : ["chat"],
        priority: existingCount,
        enabled: true,
      },
      {
        onSuccess: () => {
          setLabel("");
          setApiKey("");
          setBaseUrl("");
          setChatModel("");
          setEmbeddingModel("");
          setAzureApiVersion("");
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} space-y-3`}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Provider</label>
          <select
            value={kind}
            onChange={(e) => {
              const next = e.target.value as LLMProviderKind;
              setKind(next);
              if (next === "anthropic") setRoles(["chat"]);
            }}
            className={`${inputClass} mt-1`}
          >
            {Object.entries(LLM_KIND_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Label (optional)</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Work OpenAI" className={`${inputClass} mt-1`} />
        </div>
      </div>

      <div>
        <label className={labelClass}>API key{kind === "openai-compatible" ? " (optional for local servers)" : ""}</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className={`${inputClass} mt-1`}
        />
      </div>

      {(needsBaseUrl || kind === "openrouter") && (
        <div>
          <label className={labelClass}>
            {kind === "azure-openai" ? "Resource endpoint" : "Base URL"}
            {kind === "openrouter" && " (optional override)"}
          </label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={kind === "azure-openai" ? "https://your-resource.openai.azure.com" : "http://localhost:11434/v1"}
            className={`${inputClass} mt-1`}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{kind === "azure-openai" ? "Chat deployment" : "Chat model"}</label>
          <input value={chatModel} onChange={(e) => setChatModel(e.target.value)} className={`${inputClass} mt-1`} />
        </div>
        {supportsEmbedding && (
          <div>
            <label className={labelClass}>{kind === "azure-openai" ? "Embedding deployment" : "Embedding model"}</label>
            <input value={embeddingModel} onChange={(e) => setEmbeddingModel(e.target.value)} className={`${inputClass} mt-1`} />
          </div>
        )}
      </div>

      {kind === "azure-openai" && (
        <div>
          <label className={labelClass}>API version (optional, defaults to 2024-10-21)</label>
          <input value={azureApiVersion} onChange={(e) => setAzureApiVersion(e.target.value)} className={`${inputClass} mt-1`} />
        </div>
      )}

      {supportsEmbedding && (
        <div>
          <label className={labelClass}>Use for</label>
          <div className="mt-1 flex gap-4">
            <label className="flex items-center gap-1.5 text-sm text-stone-700 dark:text-stone-300">
              <input type="checkbox" checked={roles.includes("chat")} onChange={() => toggleRole("chat")} /> Chat
            </label>
            <label className="flex items-center gap-1.5 text-sm text-stone-700 dark:text-stone-300">
              <input type="checkbox" checked={roles.includes("embedding")} onChange={() => toggleRole("embedding")} /> Embedding
            </label>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={upsert.isPending}
        className="rounded-lg bg-accent-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-600 disabled:opacity-50"
      >
        {upsert.isPending ? "Saving…" : "Add provider"}
      </button>
      {upsert.isError && <p className="text-xs text-red-600 dark:text-red-400">{(upsert.error as Error).message}</p>}
    </form>
  );
}

function SearchProvidersSection({ entries }: { entries: MaskedSearchProviderEntry[] }) {
  const remove = useRemoveSearchProvider();
  const upsert = useUpsertSearchProvider();
  const [kind, setKind] = useState<SearchProviderKind>("tavily");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const sorted = [...entries].sort((a, b) => a.priority - b.priority);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    upsert.mutate(
      { kind, label: label.trim() || undefined, apiKey: apiKey.trim(), priority: entries.length, enabled: true },
      { onSuccess: () => { setLabel(""); setApiKey(""); } },
    );
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={<SearchIcon className="h-4 w-4" />}
        title="Search providers"
        description="Used by `scout research` to find real-world tutorials and use cases. Optional; add more than one for fallback."
      />

      {sorted.length > 0 && (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          {sorted.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  {entry.label || SEARCH_KIND_LABELS[entry.kind]}{" "}
                  <span className="font-normal text-stone-400">
                    {SEARCH_KIND_LABELS[entry.kind]} · priority {entry.priority}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={() =>
                      upsert.mutate({
                        id: entry.id,
                        kind: entry.kind,
                        label: entry.label,
                        priority: entry.priority,
                        enabled: !entry.enabled,
                      })
                    }
                  />
                  enabled
                </label>
                <button
                  type="button"
                  onClick={() => remove.mutate(entry.id)}
                  aria-label="Remove provider"
                  className="rounded-lg p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className={`${cardClass} space-y-3`}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Provider</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as SearchProviderKind)} className={`${inputClass} mt-1`}>
              {Object.entries(SEARCH_KIND_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Label (optional)</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${inputClass} mt-1`} />
          </div>
        </div>
        <div>
          <label className={labelClass}>API key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={`${inputClass} mt-1`} />
        </div>
        <button
          type="submit"
          disabled={upsert.isPending}
          className="rounded-lg bg-accent-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-600 disabled:opacity-50"
        >
          {upsert.isPending ? "Saving…" : "Add provider"}
        </button>
        {upsert.isError && <p className="text-xs text-red-600 dark:text-red-400">{(upsert.error as Error).message}</p>}
      </form>
    </section>
  );
}
