"use client";

import { use } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StatusBadge, ThemeToggle } from "@scout/ui";
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
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All runs
        </Link>
        <ThemeToggle />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-medium">{run?.platform.name ?? slug}</h1>
        </div>
        {run?.platform.status && <StatusBadge status={run.platform.status} />}
      </div>

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
