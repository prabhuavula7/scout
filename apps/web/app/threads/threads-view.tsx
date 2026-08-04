"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@scout/ui";
import { ChatPane } from "@/components/chat-pane";
import { useSidebarCollapsed } from "@/components/sidebar-context";
import {
  useCreateMultiThread,
  useCreateThreadForRun,
  useDeleteThread,
  useRenameThread,
  useRuns,
  useUnifiedThreads,
  type ThreadTarget,
  type UnifiedThreadSummary,
} from "@/lib/use-runs";

const THREADS_WIDTH_KEY = "scout-threads-column-width";
const DEFAULT_THREADS_WIDTH = 240;
const MIN_THREADS_WIDTH = 180;
const MAX_THREADS_WIDTH = 420;

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

function targetOf(summary: UnifiedThreadSummary): ThreadTarget {
  return summary.kind === "single"
    ? { kind: "single", slug: summary.platformSlugs[0]!, threadId: summary.id }
    : { kind: "multi", threadId: summary.id };
}

// A "single" thread's id is only unique within its own run's store -- every run gets a
// default thread literally id'd "main", so flattening threads across every platform (as
// this page does) needs a key that's actually unique across the whole list. "multi" thread
// ids are already globally unique (MultiRunThreadStore-generated), so they pass through as-is.
function uniqueKey(summary: UnifiedThreadSummary): string {
  return summary.kind === "single" ? `${summary.platformSlugs[0]}:${summary.id}` : summary.id;
}

function uniqueKeyOf(target: ThreadTarget): string {
  return target.kind === "single" ? `${target.slug}:${target.threadId}` : target.threadId;
}

/** Inline "new thread" picker: check one run for a single-run thread, or
 * two-plus for a thread that spans them all. Kept as a small popover rather
 * than a separate page since the only real decision is "which platform(s)". */
function NewThreadPanel({ onClose, onCreated }: { onClose: () => void; onCreated: (target: ThreadTarget) => void }) {
  const { data: runs } = useRuns();
  const [checked, setChecked] = useState<string[]>([]);
  const createSingle = useCreateThreadForRun();
  const createMulti = useCreateMultiThread();

  async function handleCreate() {
    if (checked.length === 0) return;
    if (checked.length === 1) {
      const thread = await createSingle.mutateAsync({ slug: checked[0]! });
      onCreated({ kind: "single", slug: checked[0]!, threadId: thread.id });
    } else {
      const thread = await createMulti.mutateAsync({ platformSlugs: checked });
      onCreated({ kind: "multi", threadId: thread.id });
    }
    onClose();
  }

  function toggle(slug: string) {
    setChecked((current) => (current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]));
  }

  return (
    <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-stone-200 bg-white p-2 shadow-lg dark:border-stone-800 dark:bg-stone-950">
      <p className="px-1 pb-1.5 text-xs text-stone-500">
        Pick one platform for a single-run thread, or several for a thread that spans them all.
      </p>
      <div className="max-h-48 space-y-0.5 overflow-y-auto">
        {runs?.map((run) => (
          <label
            key={run.slug}
            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-stone-50 dark:hover:bg-stone-900"
          >
            <input type="checkbox" checked={checked.includes(run.slug)} onChange={() => toggle(run.slug)} />
            <span className="truncate">{run.name}</span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-900">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={checked.length === 0}
          className="rounded bg-accent-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-600 disabled:opacity-40"
        >
          {checked.length > 1 ? `Create (${checked.length} platforms)` : "Create"}
        </button>
      </div>
    </div>
  );
}

export function ThreadsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sidebarCollapsed = useSidebarCollapsed();
  const { data: threads } = useUnifiedThreads();
  const { data: runs } = useRuns();
  const renameThread = useRenameThread();
  const deleteThread = useDeleteThread();
  const [platformFilter, setPlatformFilter] = useState("");
  const [showNewThreadPanel, setShowNewThreadPanel] = useState(false);
  const { width: threadsWidth, handleDragStart } = useResizableWidth(
    THREADS_WIDTH_KEY,
    DEFAULT_THREADS_WIDTH,
    MIN_THREADS_WIDTH,
    MAX_THREADS_WIDTH,
  );

  const selectedThreadId = searchParams.get("thread") ?? "";

  function selectThread(threadId: string) {
    router.push(`/threads?thread=${encodeURIComponent(threadId)}` as Parameters<typeof router.push>[0]);
  }

  // Default to the most recently updated thread once the list loads, so
  // landing on /threads with no query params isn't just a blank picker.
  useEffect(() => {
    if (!selectedThreadId && threads && threads.length > 0) selectThread(uniqueKey(threads[0]!));
  }, [selectedThreadId, threads]);

  const filteredThreads = (threads ?? []).filter(
    (t) => !platformFilter || t.platformSlugs.includes(platformFilter),
  );
  const selectedSummary = threads?.find((t) => uniqueKey(t) === selectedThreadId);

  function handleRename(e: React.MouseEvent, summary: UnifiedThreadSummary) {
    e.preventDefault();
    e.stopPropagation();
    const title = window.prompt("Rename thread", summary.title);
    if (title && title.trim() && title.trim() !== summary.title) {
      renameThread.mutate({ target: targetOf(summary), title: title.trim() });
    }
  }

  function handleDelete(e: React.MouseEvent, summary: UnifiedThreadSummary) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete thread "${summary.title}"? This can't be undone.`)) return;
    deleteThread.mutate(targetOf(summary));
    if (uniqueKey(summary) === selectedThreadId) {
      const remaining = filteredThreads.filter((t) => uniqueKey(t) !== uniqueKey(summary));
      if (remaining.length > 0) selectThread(uniqueKey(remaining[0]!));
      else router.push("/threads" as Parameters<typeof router.push>[0]);
    }
  }

  return (
    <div
      className={`mx-auto flex h-screen gap-4 px-4 py-8 transition-[max-width] duration-200 ${
        sidebarCollapsed ? "max-w-7xl" : "max-w-6xl"
      }`}
    >
      <aside style={{ width: threadsWidth }} className="relative shrink-0 overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-medium uppercase tracking-wide text-stone-400">Threads</h2>
          <button
            type="button"
            onClick={() => setShowNewThreadPanel((v) => !v)}
            aria-label="New thread"
            className="rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        {showNewThreadPanel && (
          <NewThreadPanel onClose={() => setShowNewThreadPanel(false)} onCreated={(target) => selectThread(uniqueKeyOf(target))} />
        )}

        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
        >
          <option value="">All platforms</option>
          {runs?.map((run) => (
            <option key={run.slug} value={run.slug}>
              {run.name}
            </option>
          ))}
        </select>

        <div className="mt-2 space-y-0.5">
          {filteredThreads.length === 0 && (
            <p className="px-1 py-2 text-xs text-stone-500">No threads yet. Start one with the + above.</p>
          )}
          {filteredThreads.map((summary) => (
            <div
              key={uniqueKey(summary)}
              onClick={() => selectThread(uniqueKey(summary))}
              role="button"
              tabIndex={0}
              className={`group flex items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 text-sm transition ${
                uniqueKey(summary) === selectedThreadId
                  ? "bg-stone-100 font-medium text-stone-900 dark:bg-stone-800 dark:text-stone-50"
                  : "text-stone-500 hover:bg-stone-50 hover:text-stone-900 dark:hover:bg-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate" title={summary.title}>
                  {summary.title}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {summary.platformNames.map((name) => (
                    <span
                      key={name}
                      className="rounded bg-stone-200 px-1 py-0.5 text-[10px] leading-none text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                    >
                      {name}
                    </span>
                  ))}
                  <span className="text-xs text-stone-400">{relativeTime(summary.updatedAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={(e) => handleRename(e, summary)}
                  aria-label="Rename thread"
                  className="rounded p-1 hover:bg-stone-200 dark:hover:bg-stone-700"
                >
                  <Pencil className="h-3 w-3" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, summary)}
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
        onMouseDown={handleDragStart}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        className="w-1 shrink-0 cursor-col-resize rounded-full bg-stone-200 transition hover:bg-accent-500/60 active:bg-accent-500 dark:bg-stone-800"
      />

      <div className="min-w-0 flex-1">
        {selectedSummary ? (
          <ChatPane target={targetOf(selectedSummary)} />
        ) : (
          <EmptyState
            icon={<MessagesSquare className="h-8 w-8" />}
            title="Pick a thread to start chatting"
            description="Select a thread on the left, or start a new one with the + button."
          />
        )}
      </div>
    </div>
  );
}
