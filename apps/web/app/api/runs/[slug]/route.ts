import { NextResponse } from "next/server";
import { LocalFileStore } from "@scout/store";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { store } = opened;
  const [platform, endpoints, understanding, resources, agentRuns] = await Promise.all([
    store.getPlatform(),
    store.getEndpoints(),
    store.getUnderstanding(),
    store.getResources(),
    store.getAgentRuns(),
  ]);

  // Surface *why* a run failed, not just that it did: the CLI prints this to
  // stderr, but a UI-only user has no other way to see it than digging into
  // ~/.scout/runs/<slug>/agent-runs.jsonl by hand.
  const lastError =
    platform.status === "failed"
      ? [...agentRuns]
          .filter((run) => run.status === "failed" && run.error)
          .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0]?.error ?? null
      : null;

  // rawSpec is the entire imported OpenAPI document, potentially several MB
  // for a large real-world API (Stripe, GitHub); the UI never renders it
  // (the API Explorer tab uses `endpoints`, already extracted from it
  // separately), and useRun's polling refetches this response every 2s
  // while a run is in progress, so shipping it on every request is pure
  // waste, not just on this one request.
  const { rawSpec: _rawSpec, ...platformWithoutRawSpec } = platform;

  return NextResponse.json({ platform: platformWithoutRawSpec, endpoints, understanding, resources, lastError });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const removed = await LocalFileStore.remove(slug);
  if (!removed) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
