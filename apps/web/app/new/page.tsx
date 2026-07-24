"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useConnectors, useCreateRun, useEstimateCrawl } from "@/lib/use-runs";

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100";
const labelClass = "block text-xs font-medium text-stone-500 dark:text-stone-400";

export default function NewRunPage() {
  const router = useRouter();
  const { data: connectors } = useConnectors();
  const createRun = useCreateRun();
  const estimateCrawl = useEstimateCrawl();

  const [sourceMode, setSourceMode] = useState<"url" | "raw">("url");
  const [source, setSource] = useState("");
  const [docUrlsText, setDocUrlsText] = useState("");
  const [label, setLabel] = useState("");
  const [connectorSlug, setConnectorSlug] = useState("");
  const [docsDepth, setDocsDepth] = useState(1);
  const [docsMaxPages, setDocsMaxPages] = useState(20);

  function parsedDocUrls(): string[] {
    return docUrlsText
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
  }

  function handleEstimate() {
    estimateCrawl.mutate({ docUrls: parsedDocUrls(), docsDepth, docsMaxPages });
  }

  const sortedConnectors = useMemo(
    () => (connectors ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [connectors],
  );

  function handleConnectorChange(slug: string) {
    setConnectorSlug(slug);
    const connector = sortedConnectors.find((c) => c.slug === slug);
    if (connector) {
      if (!label.trim()) setLabel(connector.name);
      if (!docUrlsText.trim() && connector.suggestedDocsUrl) setDocUrlsText(connector.suggestedDocsUrl);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!source.trim()) return;

    createRun.mutate(
      {
        source: source.trim(),
        kind: sourceMode === "url" ? "openapi_url" : "openapi_raw",
        docUrls: parsedDocUrls(),
        label: label.trim() || undefined,
        connectorSlug: connectorSlug || undefined,
        docsDepth,
        docsMaxPages,
      },
      {
        onSuccess: ({ slug }) => router.push(`/platform/${slug}/understanding` as Route),
      },
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-serif text-2xl font-medium tracking-tight">New understanding</h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Point Scout at an OpenAPI/Swagger spec and, optionally, documentation pages to crawl for grounded chat. Runs
        in the background, same pipeline as <code className="font-mono text-xs">scout understand</code>; you'll land
        on the run's page and its status updates live.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
        <div>
          <label className={labelClass}>Connector (optional)</label>
          <select
            value={connectorSlug}
            onChange={(e) => handleConnectorChange(e.target.value)}
            className={`${inputClass} mt-1`}
          >
            <option value="">None, custom platform</option>
            {sortedConnectors.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
                {c.implemented ? "" : " (unverified)"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Spec source</label>
          <div className="mt-1 flex gap-4 text-sm text-stone-700 dark:text-stone-300">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={sourceMode === "url"} onChange={() => setSourceMode("url")} /> URL
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={sourceMode === "raw"} onChange={() => setSourceMode("raw")} /> Paste raw
              spec
            </label>
          </div>
          {sourceMode === "url" ? (
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="https://api.example.com/openapi.json"
              className={`${inputClass} mt-2`}
            />
          ) : (
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Paste the OpenAPI/Swagger spec (JSON or YAML)"
              rows={6}
              className={`${inputClass} mt-2 font-mono text-xs`}
            />
          )}
        </div>

        <div>
          <label className={labelClass}>Docs URLs to crawl (optional, one per line)</label>
          <textarea
            value={docUrlsText}
            onChange={(e) => setDocUrlsText(e.target.value)}
            placeholder={"https://developers.example.com/getting-started\nhttps://developers.example.com/auth"}
            rows={3}
            className={`${inputClass} mt-1`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Crawl depth (0 = only the URLs above)</label>
            <input
              type="number"
              min={0}
              max={5}
              value={docsDepth}
              onChange={(e) => setDocsDepth(Number(e.target.value))}
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label className={labelClass}>Max pages crawled</label>
            <input
              type="number"
              min={1}
              max={100}
              value={docsMaxPages}
              onChange={(e) => setDocsMaxPages(Number(e.target.value))}
              className={`${inputClass} mt-1`}
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={handleEstimate}
            disabled={estimateCrawl.isPending}
            className="text-xs font-medium text-accent-600 hover:underline dark:text-accent-400"
          >
            {estimateCrawl.isPending ? "Estimating…" : "Preview crawl size estimate"}
          </button>
          {estimateCrawl.data && (
            <p className="mt-1.5 rounded-lg bg-stone-50 p-2.5 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
              {estimateCrawl.data.text}
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>Label (optional, defaults to the connector name or "platform")</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${inputClass} mt-1`} />
        </div>

        <button
          type="submit"
          disabled={createRun.isPending || !source.trim()}
          className="rounded-lg bg-accent-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-600 disabled:opacity-50"
        >
          {createRun.isPending ? "Starting…" : "Start understanding"}
        </button>
        {createRun.isError && (
          <p className="text-xs text-red-600 dark:text-red-400">{(createRun.error as Error).message}</p>
        )}
      </form>
    </main>
  );
}
