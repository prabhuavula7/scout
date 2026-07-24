import { NextResponse } from "next/server";
import { loadConnectorRegistry } from "@scout/connectors";

export async function GET() {
  return NextResponse.json(loadConnectorRegistry());
}
