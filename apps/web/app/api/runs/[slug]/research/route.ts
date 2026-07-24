import { NextResponse } from "next/server";
import { runResearchAgent } from "@scout/agents";
import { LocalFileStore } from "@scout/store";
import { resolveSearchProvider } from "@/lib/server-config";

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const { store } = opened;

  const searchProvider = await resolveSearchProvider();
  if (!searchProvider) {
    return NextResponse.json(
      { error: "No search provider configured. Add one (Tavily or SerpApi) in Settings." },
      { status: 400 },
    );
  }

  try {
    const platform = await store.getPlatform();
    const resources = await runResearchAgent(searchProvider, platform.name);
    await store.saveResources(resources);
    return NextResponse.json(resources);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
