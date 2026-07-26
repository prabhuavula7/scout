import { NextResponse } from "next/server";
import { assembleHandoff, parseAuthScheme, summarizeThreadForHandoff, UnknownWorkflowError, type GenerateLang } from "@scout/agents";
import { LocalFileStore } from "@scout/store";
import { resolveLLMProvider } from "@/lib/server-config";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const { store } = opened;

  const body = (await request.json().catch(() => ({}))) as { lang?: string; workflow?: string; threadId?: string };
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

  let threadSummary: string | undefined;
  if (body.threadId) {
    const history = await store.getChatHistory(body.threadId);
    if (history.length > 0) {
      const llm = await resolveLLMProvider();
      threadSummary = await summarizeThreadForHandoff(llm, history.map((m) => ({ role: m.role, content: m.content })));
    }
  }

  try {
    const result = await assembleHandoff(
      understanding,
      endpoints,
      { name: platform.name, slug: store.slug, baseUrl: platform.baseUrl, authScheme: parseAuthScheme(platform.authScheme) },
      { lang, ...(body.workflow === undefined ? {} : { workflow: body.workflow }), ...(threadSummary ? { threadSummary } : {}) },
    );
    return NextResponse.json({ markdown: result.markdown, workflowUsed: result.workflowUsed });
  } catch (error) {
    if (error instanceof UnknownWorkflowError) {
      return NextResponse.json({ error: error.message, validNames: error.validNames }, { status: 400 });
    }
    throw error;
  }
}
