"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PlatformStatus } from "@scout/ui";

const PHRASES: Partial<Record<PlatformStatus, string[]>> = {
  pending: ["Getting started…"],
  importing: ["Reading the OpenAPI spec…", "Mapping out endpoints…", "Parsing the schema…"],
  crawling_docs: [
    "Crawling the documentation…",
    "Following links…",
    "Reading the docs so you don't have to…",
  ],
  embedding: [
    "Embedding chunks…",
    "Cooking up the blueprint…",
    "Synthesizing the integration guide…",
    "Almost there…",
  ],
};

const STEPS: Array<{ key: PlatformStatus; label: string }> = [
  { key: "importing", label: "Import spec" },
  { key: "crawling_docs", label: "Crawl docs" },
  { key: "embedding", label: "Understand & synthesize" },
];

function stepIndex(status: PlatformStatus): number {
  if (status === "pending") return 0;
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx === -1 ? STEPS.length : idx;
}

/** Shown in place of "not generated yet" while a run is actively importing,
 * crawling docs, or synthesizing, so the wait has a visible stage and isn't
 * indistinguishable from nothing happening at all. */
export function PipelineProgress({ status }: { status: PlatformStatus }) {
  const phrases = PHRASES[status] ?? PHRASES.pending!;
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    setPhraseIndex(0);
    const interval = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % phrases.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [status, phrases.length]);

  const current = stepIndex(status);

  return (
    <div className="flex flex-col items-center gap-8 py-20 text-center">
      <div className="flex items-center">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                  i < current
                    ? "border-accent-600 bg-accent-600 text-white dark:border-accent-500 dark:bg-accent-500"
                    : i === current
                      ? "border-accent-600 text-accent-600 dark:border-accent-400 dark:text-accent-400"
                      : "border-stone-300 text-stone-400 dark:border-stone-700 dark:text-stone-600"
                }`}
              >
                {i < current ? "✓" : i + 1}
              </div>
              <span
                className={`w-24 text-xs ${
                  i === current
                    ? "font-medium text-stone-900 dark:text-stone-100"
                    : "text-stone-400 dark:text-stone-600"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className="mb-6 h-px w-10 shrink-0 bg-stone-200 dark:bg-stone-800" />}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        <span>{phrases[phraseIndex]}</span>
      </div>
    </div>
  );
}
