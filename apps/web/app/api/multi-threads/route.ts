import { NextResponse } from "next/server";
import { z } from "zod";
import { MultiRunThreadStore } from "@scout/store";

export async function GET() {
  const threads = await MultiRunThreadStore.list();
  return NextResponse.json(threads);
}

const CreateMultiThreadBody = z.object({
  platformSlugs: z.array(z.string()).min(2, "A multi-run thread needs at least two platforms"),
  title: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const parsed = CreateMultiThreadBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const thread = await MultiRunThreadStore.create(parsed.data.platformSlugs, parsed.data.title);
  return NextResponse.json(thread);
}
