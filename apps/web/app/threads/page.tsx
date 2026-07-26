import { Suspense } from "react";
import { ThreadsView } from "./threads-view";

export default function ThreadsPage() {
  return (
    <Suspense fallback={null}>
      <ThreadsView />
    </Suspense>
  );
}
