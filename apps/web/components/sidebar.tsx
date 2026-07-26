"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Compass, LayoutGrid, MessagesSquare, Plus, Settings } from "lucide-react";
import { ThemeToggle } from "@scout/ui";
import { useSidebarToggle } from "@/components/sidebar-context";

const NAV_ITEMS = [
  { href: "/" as Route, label: "Runs", icon: LayoutGrid, exact: true },
  { href: "/new" as Route, label: "New", icon: Plus, exact: true },
  { href: "/threads" as Route, label: "Threads", icon: MessagesSquare, exact: false },
  { href: "/settings" as Route, label: "Settings", icon: Settings, exact: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarToggle();

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-stone-200 transition-[width] duration-200 dark:border-stone-800 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="relative">
        <Link
          href="/"
          className={`flex items-center gap-2 px-6 py-5 font-serif text-base font-medium tracking-tight ${
            collapsed ? "justify-center px-0" : ""
          }`}
          title="Scout"
        >
          <Compass className="h-4 w-4 shrink-0 text-accent-500" strokeWidth={1.75} />
          {!collapsed && "Scout"}
        </Link>

        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" strokeWidth={2} />
          ) : (
            <ChevronLeft className="h-3 w-3" strokeWidth={2} />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                collapsed ? "justify-center px-0" : ""
              } ${
                active
                  ? "bg-stone-100 font-medium text-stone-900 dark:bg-stone-800 dark:text-stone-50"
                  : "text-stone-500 hover:bg-stone-50 hover:text-stone-900 dark:hover:bg-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className={`px-6 py-5 ${collapsed ? "flex justify-center px-0" : ""}`}>
        <ThemeToggle />
      </div>
    </aside>
  );
}
