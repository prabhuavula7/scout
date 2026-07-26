"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState, StatusBadge } from "@scout/ui";
import { ChatPane } from "@/components/chat-pane";
import { useSidebarCollapsed } from "@/components/sidebar-context";
import {
  useChatThreads,
  useCreateChatThread,
  useDeleteChatThread,
  useRenameChatThread,
  useRuns,
} from "@/lib/use-runs";

const RUNS_WIDTH_KEY = "scout-runs-column-width";
const DEFAULT_RUNS_WIDTH = 144;
const MIN_RUNS_WIDTH = 100;
const MAX_RUNS_WIDTH = 320;

const THREADS_WIDTH_KEY = "scout-threads-column-width";
const DEFAULT_THREADS_WIDTH = 192;
const MIN_THREADS_WIDTH = 160;
const MAX_THREADS_WIDTH = 360;

/** A column width that's draggable via a handle, persisted to localStorage
 * under `storageKey` so a user's preferred layout survives a reload. */
function useResizableWidth(storageKey: string, defaultWidth: number, min: number, max: number) {
  const [width, setWidth] = useState(defaultWidth);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const stored = Number(localStorage.getItem(storageKey));
    if (stored >= min && stored <= max) setWidth(stored);
  }, [storageKey, min, max]);

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: width };

    function handleMouseMove(moveEvent: MouseEvent) {
      if (!dragState.current) return;
      const delta = moveEvent.clientX - dragState.current.startX;
      const next = Math.min(max, Math.max(min, dragState.current.startWidth + delta));
      setWidth(next);
    }

    function handleMouseUp() {
      dragState.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setWidth((current) => {
        localStorage.setItem(storageKey, String(current));
        return current;
      });
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return { width, handleDragStart };
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ThreadsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: runs, isLoading: runsLoading } = useRuns();
  const sidebarCollapsed = useSidebarCollapsed();
  const { width: runsWidth, handleDragStart: handleRunsDragStart } = useResizableWidth(
    RUNS_WIDTH_KEY,
    DEFAULT_RUNS_WIDTH,
    MIN_RUNS_WIDTH,
    MAX_RUNS_WIDTH,
  );
  const { width: threadsWidth, handleDragStart: handleThreadsDragStart } = useResizableWidth(
    THREADS_WIDTH_KEY,
    DEFAULT_THREADS_WIDTH,
    MIN_THREADS_WIDTH,
    MAX_THREADS_WIDTH,
  );

  const selectedRun = searchParams.get("run") ?? "";
  const selectedThread = searchParams.get("thread") ?? "";

  const { data: threads } = useChatThreads(selectedRun);
  const createThread = useCreateChatThread(selectedRun);
  const renameThread = useRenameChatThread(selectedRun);
  const deleteThread = useDeleteChatThread(selectedRun);

  function selectRun(slug: string) {
    router.push(`/threads?run=${encodeURIComponent(slug)}` as Parameters<typeof router.push>[0]);
  }

  function selectThread(threadId: string) {
    router.push(
      `/threads?run=${encodeURIComponent(selectedRun)}&thread=${encodeURIComponent(threadId)}` as Parameters<
        typeof router.push
      >[0],
    );
  }

  // Default to the first (most recently active) run once the list loads, so
  // landing on /threads with no query params isn't just a blank picker.
  useEffect(() => {
    if (!selectedRun && runs && runs.length > 0) selectRun(runs[0]!.slug);
  }, [selectedRun, runs]);

  // Default to that run's most recently updated thread once threads load.
  useEffect(() => {
    if (selectedRun && !selectedThread && threads && threads.length > 0) selectThread(threads[0]!.id);
  }, [selectedRun, selectedThread, threads]);

  async function handleNewThread() {
    const thread = await createThread.mutateAsync(undefined);
    selectThread(thread.id);
  }

  function handleRename(e: React.MouseEvent, threadId: string, currentTitle: string) {
    e.preventDefault();
    e.stopPropagation();
    const title = window.prompt("Rename thread", currentTitle);
    if (title && title.trim() && title.trim() !== currentTitle) {
      renameThread.mutate({ threadId, title: title.trim() });
    }
  }

  function handleDelete(e: React.MouseEvent, threadId: string, title: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete thread "${title}"? This can't be undone.`)) return;
    deleteThread.mutate(threadId);
    if (threadId === selectedThread) {
      const remaining = (threads ?? []).filter((t) => t.id !== threadId);
      if (remaining.length > 0) selectThread(remaining[0]!.id);
      else router.push(`/threads?run=${encodeURIComponent(selectedRun)}` as Parameters<typeof router.push>[0]);
    }
  }

  return (
    <div
      className={`mx-auto flex h-screen gap-4 px-4 py-8 transition-[max-width] duration-200 ${
        sidebarCollapsed ? "max-w-7xl" : "max-w-6xl"
      }`}
    >
      <aside style={{ width: runsWidth }} className="shrink-0 overflow-y-auto scrollbar-thin">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-stone-400">Runs</h2>
        <div className="mt-2 space-y-0.5">
          {runsLoading && <p className="px-1 text-sm text-stone-500">Loading…</p>}
          {runs?.map((run) => (
            <button
              key={run.slug}
              type="button"
              onClick={() => selectRun(run.slug)}
              title={run.name}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                run.slug === selectedRun
                  ? "bg-stone-100 font-medium text-stone-900 dark:bg-stone-800 dark:text-stone-50"
                  : "text-stone-500 hover:bg-stone-50 hover:text-stone-900 dark:hover:bg-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <span className="truncate">{run.name}</span>
              <StatusBadge status={run.status} />
            </button>
          ))}
        </div>
      </aside>

      <div
        onMouseDown={handleRunsDragStart}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        className="w-1 shrink-0 cursor-col-resize rounded-full bg-stone-200 transition hover:bg-accent-500/60 active:bg-accent-500 dark:bg-stone-800"
      />

      <aside
        style={{ width: threadsWidth }}
        className="shrink-0 overflow-y-auto pl-4 scrollbar-thin"
      >
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-medium uppercase tracking-wide text-stone-400">Threads</h2>
          <button
            type="button"
            onClick={handleNewThread}
            disabled={!selectedRun || createThread.isPending}
            aria-label="New thread"
            className="rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <div className="mt-2 space-y-0.5">
          {(threads ?? []).length === 0 && (
            <p className="px-1 text-xs text-stone-500">No threads yet. Start one, or just ask a question below.</p>
          )}
          {threads?.map((thread) => (
            <div
              key={thread.id}
              onClick={() => selectThread(thread.id)}
              role="button"
              tabIndex={0}
              className={`group flex items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 text-sm transition ${
                thread.id === selectedThread
                  ? "bg-stone-100 font-medium text-stone-900 dark:bg-stone-800 dark:text-stone-50"
                  : "text-stone-500 hover:bg-stone-50 hover:text-stone-900 dark:hover:bg-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate" title={thread.title}>
                  {thread.title}
                </p>
                <p className="text-xs text-stone-400">{relativeTime(thread.updatedAt)}</p>
              </div>
              <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={(e) => handleRename(e, thread.id, thread.title)}
                  aria-label="Rename thread"
                  className="rounded p-1 hover:bg-stone-200 dark:hover:bg-stone-700"
                >
                  <Pencil className="h-3 w-3" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, thread.id, thread.title)}
                  aria-label="Delete thread"
                  className="rounded p-1 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div
        onMouseDown={handleThreadsDragStart}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        className="w-1 shrink-0 cursor-col-resize rounded-full bg-stone-200 transition hover:bg-accent-500/60 active:bg-accent-500 dark:bg-stone-800"
      />

      <div className="min-w-0 flex-1">
        {selectedRun && selectedThread ? (
          <ChatPane slug={selectedRun} threadId={selectedThread} />
        ) : (
          <EmptyState
            icon={<MessagesSquare className="h-8 w-8" />}
            title="Pick a run to start chatting"
            description="Select a run on the left, then a thread (or start a new one) to chat with it."
          />
        )}
      </div>
    </div>
  );
}
