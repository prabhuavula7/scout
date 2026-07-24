"use client";

import { use } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "@scout/ui";
import { useRun } from "@/lib/use-runs";

const TABS = [
  { slug: "explorer", label: "API Explorer" },
  { slug: "understanding", label: "Understanding" },
  { slug: "chat", label: "AI Chat" },
] as const;

export default function PlatformLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const pathname = usePathname();
  const { data: run } = useRun(slug);

  const activeTab = TABS.find((t) => pathname.includes(`/${t.slug}`))?.slug ?? "understanding";

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-medium">{run?.platform.name ?? slug}</h1>
        </div>
        {run?.platform.status && <StatusBadge status={run.platform.status} />}
      </div>

      {run?.platform.status === "failed" && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <div>
            <p className="font-medium">This run failed.</p>
            <p className="mt-0.5 text-red-700 dark:text-red-400">
              {run.lastError ?? "No error was recorded. Check the terminal or ~/.scout/runs/" + slug + "/agent-runs.jsonl for details."}
            </p>
          </div>
        </div>
      )}

      {run?.platform.docsCrawlWarning && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <p>{run.platform.docsCrawlWarning}</p>
        </div>
      )}

      {run?.platform.understandingScopeWarning && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <p>{run.platform.understandingScopeWarning}</p>
        </div>
      )}

      <div className="mt-6 flex gap-1 rounded-full bg-stone-100 p-1 text-sm dark:bg-stone-900">
        {TABS.map((tab) => (
          <Link
            key={tab.slug}
            href={`/platform/${slug}/${tab.slug}` as Route}
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

      <div className="mt-8">{children}</div>
    </div>
  );
}
