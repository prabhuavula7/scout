"use client";

import Link from "next/link";
import type { Route } from "next";
import { Plus, Terminal, Trash2 } from "lucide-react";
import { EmptyState, StatusBadge } from "@scout/ui";
import { useRemoveRun, useRuns } from "@/lib/use-runs";

export default function HomePage() {
  const { data: runs, isLoading } = useRuns();
  const removeRun = useRemoveRun();

  function handleDelete(e: React.MouseEvent, slug: string, name: string) {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm(`Delete "${name}"? This can't be undone.`)) {
      removeRun.mutate(slug);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-medium tracking-tight">Runs</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Everything you've pointed{" "}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs dark:bg-stone-900">
              scout understand
            </code>{" "}
            at, stored locally under <code className="font-mono text-xs">~/.scout/runs</code>.
          </p>
        </div>
        <Link
          href="/new"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-600"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New
        </Link>
      </div>

      <div className="mt-8">
        {isLoading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : !runs || runs.length === 0 ? (
          <EmptyState
            icon={<Terminal className="h-8 w-8" />}
            title="No runs yet"
            description='Point Scout at a spec from the "New" tab, or run "scout understand <spec-url>" from your terminal.'
          />
        ) : (
          <div className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
            {runs.map((run) => (
              <Link
                key={run.slug}
                href={`/platform/${run.slug}/understanding` as Route}
                className="flex items-center justify-between px-5 py-4 transition hover:bg-stone-50 dark:hover:bg-stone-900"
              >
                <div>
                  <p className="font-medium text-stone-900 dark:text-stone-100">{run.name}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{run.connectorSlug}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={run.status} />
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, run.slug, run.name)}
                    aria-label="Delete run"
                    className="rounded-lg p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
