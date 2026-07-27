import { NextResponse } from "next/server";
import { z } from "zod";
import { MultiRunThreadStore } from "@scout/store";

const RenameMultiThreadBody = z.object({ title: z.string().min(1).max(200) });

export async function PATCH(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const body = RenameMultiThreadBody.parse(await request.json());
  await MultiRunThreadStore.rename(threadId, body.title);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  await MultiRunThreadStore.remove(threadId);
  return NextResponse.json({ ok: true });
}
