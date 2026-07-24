import { NextResponse } from "next/server";
import { maskScoutConfig } from "@scout/types";
import { removeSearchProvider } from "@scout/store";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const updated = await removeSearchProvider(id);
  return NextResponse.json(maskScoutConfig(updated));
}
