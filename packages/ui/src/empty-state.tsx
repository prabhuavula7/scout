import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-stone-200 px-6 py-16 text-center dark:border-stone-800",
        className,
      )}
    >
      {icon && <div className="text-stone-400 dark:text-stone-600">{icon}</div>}
      <div className="space-y-1">
        <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{title}</p>
        {description && (
          <p className="max-w-sm text-sm text-stone-500 dark:text-stone-400">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
