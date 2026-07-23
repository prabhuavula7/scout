import { NextResponse } from "next/server";
import { LocalFileStore } from "@scout/store";

export async function GET() {
  const runs = await LocalFileStore.list();
  return NextResponse.json(runs);
}
