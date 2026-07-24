"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Compass, LayoutGrid, Plus, Settings } from "lucide-react";
import { ThemeToggle } from "@scout/ui";

const NAV_ITEMS = [
  { href: "/" as Route, label: "Runs", icon: LayoutGrid, exact: true },
  { href: "/new" as Route, label: "New", icon: Plus, exact: true },
  { href: "/settings" as Route, label: "Settings", icon: Settings, exact: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-stone-200 dark:border-stone-800">
      <Link href="/" className="flex items-center gap-2 px-6 py-5 font-serif text-base font-medium tracking-tight">
        <Compass className="h-4 w-4 text-accent-500" strokeWidth={1.75} />
        Scout
      </Link>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-stone-100 font-medium text-stone-900 dark:bg-stone-800 dark:text-stone-50"
                  : "text-stone-500 hover:bg-stone-50 hover:text-stone-900 dark:hover:bg-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-5">
        <ThemeToggle />
      </div>
    </aside>
  );
}
