import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgenticChatAgent, type ChatPlatform } from "@scout/agents";
import { LocalFileStore, MultiRunThreadStore } from "@scout/store";
import { resolveLLMProvider, resolveSearchProvider } from "@/lib/server-config";

async function resolvePlatforms(slugs: string[]): Promise<ChatPlatform[] | null> {
  const platforms: ChatPlatform[] = [];
  for (const slug of slugs) {
    const opened = await LocalFileStore.open(slug);
    if (!opened) return null;
    const platform = await opened.store.getPlatform();
    platforms.push({ platformId: opened.platformId, slug, name: platform.name, store: opened.store });
  }
  return platforms;
}

export async function GET(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const thread = await MultiRunThreadStore.get(threadId);
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const messages = await MultiRunThreadStore.getHistory(threadId);
  return NextResponse.json(messages);
}

const ChatBody = z.object({ message: z.string().min(1).max(4000) });

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const thread = await MultiRunThreadStore.get(threadId);
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const body = ChatBody.parse(await request.json());

  const priorMessages = await MultiRunThreadStore.getHistory(threadId);
  const history = priorMessages.map((m) => ({ role: m.role, content: m.content }));

  await MultiRunThreadStore.appendMessage(threadId, "user", body.message, []);

  try {
    const platforms = await resolvePlatforms(thread.platformSlugs);
    if (!platforms) {
      return NextResponse.json({ error: "One of this thread's platforms no longer exists" }, { status: 409 });
    }
    const llm = await resolveLLMProvider();
    const searchProvider = await resolveSearchProvider();
    const result = await runAgenticChatAgent(platforms, llm, searchProvider, body.message, history);
    const saved = await MultiRunThreadStore.appendMessage(threadId, "assistant", result.answer, result.sources);
    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
