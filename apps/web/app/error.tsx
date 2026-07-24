"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500" strokeWidth={1.5} />
      <h1 className="mt-4 font-serif text-xl font-medium tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{error.message || "An unexpected error occurred."}</p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-accent-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-600"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-stone-200 px-4 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900"
        >
          All runs
        </Link>
      </div>
    </main>
  );
}
