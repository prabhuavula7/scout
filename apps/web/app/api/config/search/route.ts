import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SearchProviderKind, maskScoutConfig } from "@scout/types";
import { loadScoutConfig, upsertSearchProvider } from "@scout/store";

const UpsertSearchProviderBody = z.object({
  id: z.string().optional(),
  kind: SearchProviderKind,
  label: z.string().optional(),
  apiKey: z.string().optional(),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

export async function POST(request: Request) {
  const body = UpsertSearchProviderBody.parse(await request.json());

  const id = body.id ?? randomUUID();
  const config = await loadScoutConfig();
  const existing = config.searchProviders.find((e) => e.id === id);

  if (!body.apiKey && !existing) {
    return NextResponse.json({ error: '"apiKey" is required when adding a new provider.' }, { status: 400 });
  }

  const updated = await upsertSearchProvider({
    id,
    kind: body.kind,
    label: body.label,
    apiKey: body.apiKey ?? existing!.apiKey,
    priority: body.priority,
    enabled: body.enabled,
  });

  return NextResponse.json(maskScoutConfig(updated));
}
