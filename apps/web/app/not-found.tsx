import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <Compass className="h-8 w-8 text-stone-400" strokeWidth={1.5} />
      <h1 className="mt-4 font-serif text-xl font-medium tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        This page doesn't exist, or the run it points to may have been removed.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-accent-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-600"
      >
        All runs
      </Link>
    </main>
  );
}
