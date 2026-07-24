import { NextResponse } from "next/server";
import { maskScoutConfig } from "@scout/types";
import { loadScoutConfig } from "@scout/store";

export async function GET() {
  const config = await loadScoutConfig();
  return NextResponse.json(maskScoutConfig(config));
}
