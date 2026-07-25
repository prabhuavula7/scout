import { NextResponse } from "next/server";
import { assembleHandoff, parseAuthScheme, UnknownWorkflowError, type GenerateLang } from "@scout/agents";
import { LocalFileStore } from "@scout/store";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const { store } = opened;

  const body = (await request.json().catch(() => ({}))) as { lang?: string; workflow?: string };
  if (body.lang !== "ts" && body.lang !== "py") {
    return NextResponse.json({ error: 'lang must be "ts" or "py"' }, { status: 400 });
  }
  const lang: GenerateLang = body.lang;

  const understanding = await store.getUnderstanding();
  if (!understanding) {
    return NextResponse.json({ error: "No understanding generated yet for this run" }, { status: 400 });
  }
  const endpoints = await store.getEndpoints();
  const platform = await store.getPlatform();

  try {
    const result = await assembleHandoff(
      understanding,
      endpoints,
      { name: platform.name, slug: store.slug, baseUrl: platform.baseUrl, authScheme: parseAuthScheme(platform.authScheme) },
      body.workflow === undefined ? { lang } : { lang, workflow: body.workflow },
    );
    return NextResponse.json({ markdown: result.markdown, workflowUsed: result.workflowUsed });
  } catch (error) {
    if (error instanceof UnknownWorkflowError) {
      return NextResponse.json({ error: error.message, validNames: error.validNames }, { status: 400 });
    }
    throw error;
  }
}
