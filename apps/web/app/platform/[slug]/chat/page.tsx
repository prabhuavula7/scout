"use client";

import { use } from "react";
import { ChatPane } from "@/components/chat-pane";
import { useSidebarCollapsed } from "@/components/sidebar-context";

// Every run gets one default conversation, "main" -- the same thread ID the
// store lazily creates/migrates legacy chat.jsonl history into. Multiple
// named threads per run live under the top-level /threads tab; this tab is
// just the quick "ask about this platform" entry point scoped to that one.
const MAIN_THREAD_ID = "main";

export default function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const collapsed = useSidebarCollapsed();

  return (
    <div
      className={`mx-auto h-[calc(100vh-14rem)] transition-[max-width] duration-200 ${collapsed ? "max-w-3xl" : "max-w-2xl"}`}
    >
      <ChatPane slug={slug} threadId={MAIN_THREAD_ID} />
    </div>
  );
}
