import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgenticChatAgent } from "@scout/agents";
import { LocalFileStore } from "@scout/store";
import { resolveLLMProvider, resolveSearchProvider } from "@/lib/server-config";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const messages = await opened.store.getChatHistory();
  return NextResponse.json(messages);
}

const ChatBody = z.object({ message: z.string().min(1).max(4000) });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const { store, platformId } = opened;

  const body = ChatBody.parse(await request.json());

  const priorMessages = await store.getChatHistory();
  const history = priorMessages.map((m) => ({ role: m.role, content: m.content }));

  await store.appendChatMessage("user", body.message, []);

  try {
    const llm = await resolveLLMProvider();
    const searchProvider = await resolveSearchProvider();
    const result = await runAgenticChatAgent(store, llm, searchProvider, platformId, body.message, history);
    const saved = await store.appendChatMessage("assistant", result.answer, result.sources);
    return NextResponse.json(saved);
  } catch (error) {
    // The user's message is already saved above; only the reply failed
    // (misconfigured/invalid key, all configured providers down, etc).
    // Surface the real reason instead of an unhandled 500 with no message,
    // so a bad key reads as "your OpenAI key looks wrong" instead of a
    // silent crash.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
