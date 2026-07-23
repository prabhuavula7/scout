import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Compass, LayoutGrid } from "lucide-react";
import { ThemeToggle } from "@integration-scout/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-stone-200 px-4 py-5 dark:border-stone-800">
        <Link href="/dashboard" className="flex items-center gap-2 px-2 font-serif text-sm font-medium">
          <Compass className="h-4 w-4 text-accent-500" strokeWidth={1.75} />
          Integration Scout
        </Link>

        <nav className="mt-8 flex flex-col gap-1 text-sm">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
          >
            <LayoutGrid className="h-4 w-4" />
            Projects
          </Link>
        </nav>

        <div className="mt-auto flex items-center gap-2 px-2">
          <UserButton afterSignOutUrl="/" />
          <span className="flex-1 text-xs text-stone-500 dark:text-stone-400">Account</span>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex-1">{children}</div>
    </div>
  );
}
