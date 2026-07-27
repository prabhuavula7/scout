import { Suspense } from "react";
import { ThreadsView } from "./threads-view";

// This page's real content depends entirely on live local filesystem state
// fetched client-side (which threads exist, which is selected via
// searchParams). Letting Next statically prerender it bakes in whatever
// state happened to exist on the machine at build time as the initial
// server-rendered HTML, which can visibly mismatch the correct client
// render for anything conditional on which thread is selected.
export const dynamic = "force-dynamic";

export default function ThreadsPage() {
  return (
    <Suspense fallback={null}>
      <ThreadsView />
    </Suspense>
  );
}
