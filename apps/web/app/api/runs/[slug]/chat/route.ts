import { NextResponse } from "next/server";
import { z } from "zod";
import { runChatAgent } from "@scout/agents";
import { getLLMProvider } from "@scout/ai";
import { LocalFileStore } from "@scout/store";

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
  const result = await runChatAgent(store, getLLMProvider(), platformId, body.message, history);
  const saved = await store.appendChatMessage("assistant", result.answer, result.citations);

  return NextResponse.json(saved);
}
