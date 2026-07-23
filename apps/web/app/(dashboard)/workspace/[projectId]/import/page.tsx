"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import { useApiClient } from "@/lib/use-api-client";
import { useWorkspaceStore } from "@/lib/workspace-store";

const IMPORT_KINDS = [
  { value: "openapi_url", label: "OpenAPI / Swagger URL" },
  { value: "openapi_raw", label: "Raw OpenAPI JSON or YAML" },
  { value: "swagger_url", label: "Swagger URL" },
  { value: "graphql_introspection", label: "GraphQL introspection (coming soon)" },
  { value: "github_repo", label: "GitHub repo (coming soon)" },
  { value: "docs_url", label: "Documentation URL only (coming soon)" },
  { value: "postman_collection", label: "Postman collection (coming soon)" },
  { value: "har", label: "HAR file (coming soon)" },
] as const;

export default function ImportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const getApi = useApiClient();
  const queryClient = useQueryClient();
  const { selectPlatform } = useWorkspaceStore();

  const { data: connectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: async () => (await getApi()).listConnectors(),
  });

  const [connectorSlug, setConnectorSlug] = useState("contentful");
  const [kind, setKind] = useState<(typeof IMPORT_KINDS)[number]["value"]>("openapi_url");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("Contentful");
  const [docUrlsText, setDocUrlsText] = useState("https://www.contentful.com/developers/docs/");

  const importMutation = useMutation({
    mutationFn: async () =>
      (await getApi()).importPlatform(projectId, {
        connectorSlug,
        kind,
        value,
        label,
        docUrls: docUrlsText
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean),
      }),
    onSuccess: (platform) => {
      selectPlatform(projectId, platform.id);
      queryClient.invalidateQueries({ queryKey: ["platforms", projectId] });
    },
  });

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold">Import a platform</h2>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        Bring an OpenAPI spec and a docs entry point. Integration Scout will parse the spec,
        crawl the docs, embed them, and generate an integration blueprint.
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          importMutation.mutate();
        }}
      >
        <div>
          <label className="text-xs font-medium text-stone-500">Connector (optional preset)</label>
          <select
            value={connectorSlug}
            onChange={(e) => {
              setConnectorSlug(e.target.value);
              const connector = connectors?.find((c) => c.slug === e.target.value);
              if (connector) {
                setLabel(connector.name);
                if (connector.suggestedDocsUrl) setDocUrlsText(connector.suggestedDocsUrl);
              }
            }}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
          >
            {connectors?.map((c) => (
              <option key={c.slug} value={c.slug} disabled={!c.implemented}>
                {c.name} {!c.implemented ? "(coming soon)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Import source</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
          >
            {IMPORT_KINDS.map((k) => (
              <option key={k.value} value={k.value} disabled={k.label.includes("coming soon")}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">
            {kind === "openapi_raw" ? "Paste OpenAPI spec" : "URL"}
          </label>
          {kind === "openapi_raw" ? (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={6}
              placeholder="Paste raw OpenAPI JSON or YAML"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-xs dark:border-stone-700 dark:bg-stone-900"
            />
          ) : (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://example.com/openapi.json"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
            />
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">
            Documentation URLs to crawl (one per line)
          </label>
          <textarea
            value={docUrlsText}
            onChange={(e) => setDocUrlsText(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
          />
        </div>

        <button
          type="submit"
          disabled={importMutation.isPending || !value}
          className="flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-50"
        >
          <UploadCloud className="h-4 w-4" />
          {importMutation.isPending ? "Starting import…" : "Import platform"}
        </button>

        {importMutation.isError && (
          <p className="text-sm text-red-600">{(importMutation.error as Error).message}</p>
        )}
        {importMutation.isSuccess && (
          <p className="text-sm text-emerald-600">
            Import started. Switch to the API Explorer or Understanding tab to watch progress.
          </p>
        )}
      </form>
    </div>
  );
}
