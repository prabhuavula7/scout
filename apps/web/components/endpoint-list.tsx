"use client";

import { useMemo, useState } from "react";
import type { Endpoint } from "@integration-scout/types";
import { generateCurl, generatePython, generateTypeScript } from "@/lib/codegen";

const METHOD_COLORS: Record<Endpoint["method"], string> = {
  GET: "text-blue-600 dark:text-blue-400",
  POST: "text-emerald-600 dark:text-emerald-400",
  PUT: "text-amber-600 dark:text-amber-400",
  PATCH: "text-amber-600 dark:text-amber-400",
  DELETE: "text-red-600 dark:text-red-400",
};

function CodeTabs({ endpoint, baseUrl }: { endpoint: Endpoint; baseUrl: string }) {
  const [tab, setTab] = useState<"curl" | "typescript" | "python">("curl");

  const code = useMemo(() => {
    switch (tab) {
      case "curl":
        return generateCurl(endpoint, baseUrl);
      case "typescript":
        return generateTypeScript(endpoint, baseUrl);
      case "python":
        return generatePython(endpoint, baseUrl);
    }
  }, [tab, endpoint, baseUrl]);

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800">
      <div className="flex gap-1 border-b border-stone-200 p-1 text-xs dark:border-stone-800">
        {(["curl", "typescript", "python"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-2 py-1 ${
              tab === t
                ? "bg-stone-100 font-medium dark:bg-stone-800"
                : "text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
            }`}
          >
            {t === "curl" ? "cURL" : t === "typescript" ? "TypeScript" : "Python"}
          </button>
        ))}
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function EndpointList({ endpoints, baseUrl }: { endpoints: Endpoint[]; baseUrl: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Endpoint[]>();
    for (const endpoint of endpoints) {
      const list = map.get(endpoint.group) ?? [];
      list.push(endpoint);
      map.set(endpoint.group, list);
    }
    return Array.from(map.entries());
  }, [endpoints]);

  return (
    <div className="space-y-6">
      {groups.map(([group, groupEndpoints]) => (
        <div key={group}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">
            {group}
          </h3>
          <div className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
            {groupEndpoints.map((endpoint) => (
              <div key={endpoint.id}>
                <button
                  onClick={() => setExpandedId(expandedId === endpoint.id ? null : endpoint.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-900"
                >
                  <span className={`w-14 shrink-0 font-mono text-xs font-semibold ${METHOD_COLORS[endpoint.method]}`}>
                    {endpoint.method}
                  </span>
                  <span className="font-mono text-xs">{endpoint.path}</span>
                  {endpoint.summary && (
                    <span className="ml-auto truncate text-xs text-stone-500">{endpoint.summary}</span>
                  )}
                </button>
                {expandedId === endpoint.id && (
                  <div className="space-y-4 border-t border-stone-200 bg-stone-50/50 px-4 py-4 dark:border-stone-800 dark:bg-stone-900/50">
                    {endpoint.description && (
                      <p className="text-sm text-stone-600 dark:text-stone-400">{endpoint.description}</p>
                    )}
                    {endpoint.parameters.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-stone-500">Parameters</h4>
                        <table className="mt-2 w-full text-left text-xs">
                          <tbody>
                            {endpoint.parameters.map((p) => (
                              <tr key={p.name} className="border-t border-stone-200 dark:border-stone-800">
                                <td className="py-1.5 pr-4 font-mono">{p.name}</td>
                                <td className="py-1.5 pr-4 text-stone-500">{p.in}</td>
                                <td className="py-1.5 pr-4 text-stone-500">{p.type}</td>
                                <td className="py-1.5 text-stone-500">{p.required ? "required" : "optional"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <CodeTabs endpoint={endpoint} baseUrl={baseUrl} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
