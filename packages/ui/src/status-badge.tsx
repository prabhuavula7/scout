import { cn } from "./cn.js";

export type PlatformStatus =
  | "pending"
  | "importing"
  | "crawling_docs"
  | "embedding"
  | "ready"
  | "failed";

const STATUS_STYLES: Record<PlatformStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400" },
  importing: { label: "Importing", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" },
  crawling_docs: { label: "Crawling docs", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" },
  embedding: { label: "Embedding", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" },
  ready: { label: "Ready", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
};

export function StatusBadge({ status }: { status: PlatformStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        style.className,
      )}
    >
      {(status === "importing" || status === "crawling_docs" || status === "embedding") && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {style.label}
    </span>
  );
}
