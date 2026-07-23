"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@integration-scout/ui";
import { useApiClient } from "@/lib/use-api-client";
import { useWorkspaceStore } from "@/lib/workspace-store";

const TABS = [
  { slug: "import", label: "Import" },
  { slug: "explorer", label: "API Explorer" },
  { slug: "understanding", label: "Understanding" },
  { slug: "chat", label: "AI Chat" },
] as const;

export default function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const pathname = usePathname();
  const getApi = useApiClient();
  const { selectedPlatformByProject, selectPlatform } = useWorkspaceStore();
  const selectedPlatformId = selectedPlatformByProject[projectId];

  const { data: platforms } = useQuery({
    queryKey: ["platforms", projectId],
    queryFn: async () => (await getApi()).listPlatforms(projectId),
    refetchInterval: (query) =>
      query.state.data?.some((p) => p.status !== "ready" && p.status !== "failed") ? 2000 : false,
  });

  useEffect(() => {
    if (!selectedPlatformId && platforms && platforms.length > 0) {
      selectPlatform(projectId, platforms[platforms.length - 1]!.id);
    }
  }, [platforms, selectedPlatformId, projectId, selectPlatform]);

  const activeTab = TABS.find((t) => pathname.includes(`/${t.slug}`))?.slug ?? "import";

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-full bg-stone-100 p-1 text-sm dark:bg-stone-900">
          {TABS.map((tab) => (
            <Link
              key={tab.slug}
              href={`/workspace/${projectId}/${tab.slug}`}
              className={`rounded-full px-4 py-1.5 transition ${
                activeTab === tab.slug
                  ? "bg-white font-medium text-stone-900 shadow-sm dark:bg-stone-800 dark:text-stone-50"
                  : "text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {platforms && platforms.length > 0 && (
          <div className="flex items-center gap-3">
            <select
              value={selectedPlatformId ?? ""}
              onChange={(e) => selectPlatform(projectId, e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
            >
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {(() => {
              const platform = platforms.find((p) => p.id === selectedPlatformId);
              return platform ? <StatusBadge status={platform.status} /> : null;
            })()}
          </div>
        )}
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
