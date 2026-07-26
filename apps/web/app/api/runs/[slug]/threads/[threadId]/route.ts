import { NextResponse } from "next/server";
import { z } from "zod";
import { LocalFileStore } from "@scout/store";

const RenameThreadBody = z.object({ title: z.string().min(1).max(200) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; threadId: string }> },
) {
  const { slug, threadId } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const body = RenameThreadBody.parse(await request.json());
  await opened.store.renameChatThread(threadId, body.title);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; threadId: string }> },
) {
  const { slug, threadId } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  await opened.store.deleteChatThread(threadId);
  return NextResponse.json({ ok: true });
}
