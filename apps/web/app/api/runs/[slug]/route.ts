import { NextResponse } from "next/server";
import { LocalFileStore } from "@scout/store";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { store } = opened;
  const [platform, endpoints, understanding, resources] = await Promise.all([
    store.getPlatform(),
    store.getEndpoints(),
    store.getUnderstanding(),
    store.getResources(),
  ]);

  return NextResponse.json({ platform, endpoints, understanding, resources });
}
