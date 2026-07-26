import { DEFAULT_THREAD_ID, type LocalFileStore } from "@scout/store";

export interface ResolvedThread {
  id: string;
  title: string;
}

/** Resolves a --thread <name> option to a thread: an exact title match
 * reuses that thread, otherwise a new one is created with that title.
 * Omitting the option resolves to the "Main" thread every pre-threads
 * conversation lives in. */
export async function resolveThread(store: LocalFileStore, name: string | undefined): Promise<ResolvedThread> {
  if (!name) return { id: DEFAULT_THREAD_ID, title: "Main" };
  const threads = await store.listChatThreads();
  const existing = threads.find((t) => t.title === name);
  if (existing) return existing;
  return store.createChatThread(name);
}
