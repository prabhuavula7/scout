import { NextResponse } from "next/server";
import { runUploadFileAgent, runUploadLinkAgent } from "@scout/agents";
import { LocalFileStore } from "@scout/store";
import { resolveLLMProvider } from "@/lib/server-config";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const { store, platformId } = opened;
  const sources = (await store.listDocSources?.(platformId)) ?? [];
  return NextResponse.json(sources);
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const { store, platformId } = opened;
  const llm = await resolveLLMProvider();

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as { name?: unknown; arrayBuffer?: unknown } | null;
      // Duck-typed rather than `instanceof File`: the File class differs across
      // runtimes (undici in Node, jsdom in tests), so identity checks aren't
      // reliable across them even though the shape we need is always the same.
      if (!file || typeof file.name !== "string" || typeof file.arrayBuffer !== "function") {
        return NextResponse.json({ error: "Expected a \"file\" field in the form data" }, { status: 400 });
      }
      const buffer = Buffer.from(await (file.arrayBuffer as () => Promise<ArrayBuffer>).call(file));
      const result = await runUploadFileAgent(store, llm, platformId, { filename: file.name, buffer });
      return NextResponse.json(result);
    }

    const body = (await request.json().catch(() => ({}))) as { url?: string };
    if (!body.url) {
      return NextResponse.json({ error: 'Expected a JSON body with a "url" field, or a multipart file upload' }, { status: 400 });
    }
    const result = await runUploadLinkAgent(store, llm, platformId, { url: body.url });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const { store, platformId } = opened;

  const body = (await request.json().catch(() => ({}))) as { sourceUrl?: string };
  if (!body.sourceUrl) {
    return NextResponse.json({ error: 'Expected a JSON body with a "sourceUrl" field' }, { status: 400 });
  }

  const removed = (await store.deleteDocChunksBySource?.(platformId, body.sourceUrl)) ?? 0;
  return NextResponse.json({ removed });
}
