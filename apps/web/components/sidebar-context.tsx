"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "scout-sidebar-collapsed";

const SidebarContext = createContext<{ collapsed: boolean; toggle: () => void } | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>;
}

/** Whether the sidebar is collapsed, so a page's own content container can
 * widen to use the reclaimed space instead of leaving it as dead margin. */
export function useSidebarCollapsed(): boolean {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebarCollapsed must be used within SidebarProvider");
  return ctx.collapsed;
}

export function useSidebarToggle(): { collapsed: boolean; toggle: () => void } {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebarToggle must be used within SidebarProvider");
  return ctx;
}
