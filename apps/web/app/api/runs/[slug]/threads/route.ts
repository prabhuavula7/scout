import { NextResponse } from "next/server";
import { z } from "zod";
import { LocalFileStore } from "@scout/store";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const threads = await opened.store.listChatThreads();
  return NextResponse.json(threads);
}

const CreateThreadBody = z.object({ title: z.string().max(200).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const body = CreateThreadBody.parse(await request.json().catch(() => ({})));
  const thread = await opened.store.createChatThread(body.title);
  return NextResponse.json(thread);
}
