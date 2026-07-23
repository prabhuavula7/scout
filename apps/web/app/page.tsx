"use client";

import Link from "next/link";
import type { Route } from "next";
import { Compass, Terminal } from "lucide-react";
import { EmptyState, StatusBadge, ThemeToggle } from "@scout/ui";
import { useRuns } from "@/lib/use-runs";

export default function HomePage() {
  const { data: runs, isLoading } = useRuns();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-serif text-base font-medium tracking-tight">
          <Compass className="h-4 w-4 text-accent-500" strokeWidth={1.75} />
          Scout
        </span>
        <ThemeToggle />
      </header>

      <div className="mt-10">
        <h1 className="font-serif text-2xl font-medium tracking-tight">Runs</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Everything you've pointed{" "}
          <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs dark:bg-stone-900">
            scout understand
          </code>{" "}
          at, stored locally under <code className="font-mono text-xs">~/.scout/runs</code>.
        </p>
      </div>

      <div className="mt-8">
        {isLoading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : !runs || runs.length === 0 ? (
          <EmptyState
            icon={<Terminal className="h-8 w-8" />}
            title="No runs yet"
            description='Run "scout understand <spec-url>" from your terminal, then refresh this page.'
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
                <StatusBadge status={run.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
