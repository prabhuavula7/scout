"use client";

import Link from "next/link";
import { KeyRound } from "lucide-react";
import { useScoutConfig } from "@/lib/use-config";

/**
 * Scout can't do anything useful without at least one LLM provider key.
 * Without this, a new user's first signal that one is missing was a run
 * silently failing minutes later ("No LLM provider configured for the
 * chat role") instead of before they ever started one.
 */
export function GettingStartedBanner() {
  const { data: config, isLoading } = useScoutConfig();
  if (isLoading || !config?.llmProviders || config.llmProviders.length > 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3.5 text-sm dark:border-accent-500/20 dark:bg-accent-500/10">
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" strokeWidth={1.75} />
      <div>
        <p className="font-medium text-stone-900 dark:text-stone-100">Add an LLM provider before your first run</p>
        <p className="mt-0.5 text-stone-600 dark:text-stone-400">
          Scout needs an OpenAI, Anthropic, Azure OpenAI, OpenRouter, or local-model key to generate an
          understanding.{" "}
          <Link href="/settings" className="font-medium text-accent-700 underline underline-offset-2 dark:text-accent-400">
            Add one in Settings
          </Link>
          , or from the terminal: <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-xs dark:bg-stone-900">scout config llm add openai --api-key sk-...</code>
        </p>
      </div>
    </div>
  );
}
