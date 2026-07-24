"use client";

import { useEffect, useState } from "react";

export interface TocItem {
  id: string;
  label: string;
}

/**
 * Sticky scroll-spy nav for long single-column pages. Watches each
 * section's heading with an IntersectionObserver rather than tracking
 * scroll position by hand, so "which section is active" stays correct
 * regardless of how tall any individual section is.
 */
export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id);

  useEffect(() => {
    const elements = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => !!el);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="sticky top-8 hidden w-44 shrink-0 self-start lg:block">
      <ul className="space-y-1 border-l border-stone-200 dark:border-stone-800">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={`block -ml-px border-l px-3 py-1 text-xs transition ${
                activeId === item.id
                  ? "border-accent-500 font-medium text-accent-600 dark:text-accent-400"
                  : "border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
