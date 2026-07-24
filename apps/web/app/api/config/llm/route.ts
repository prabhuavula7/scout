import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LLMProviderKind, LLMRole, maskScoutConfig } from "@scout/types";
import { loadScoutConfig, upsertLLMProvider } from "@scout/store";

const UpsertLLMProviderBody = z.object({
  id: z.string().optional(),
  kind: LLMProviderKind,
  label: z.string().optional(),
  /** Omitted on an update that isn't changing the key, so the stored one is kept. */
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  chatModel: z.string().optional(),
  embeddingModel: z.string().optional(),
  azureApiVersion: z.string().optional(),
  roles: z.array(LLMRole).min(1),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

export async function POST(request: Request) {
  const body = UpsertLLMProviderBody.parse(await request.json());

  if ((body.kind === "openai-compatible" || body.kind === "azure-openai") && !body.baseUrl) {
    return NextResponse.json({ error: `"baseUrl" is required for "${body.kind}".` }, { status: 400 });
  }

  const id = body.id ?? randomUUID();
  const config = await loadScoutConfig();
  const existing = config.llmProviders.find((e) => e.id === id);

  if (!body.apiKey && !existing) {
    return NextResponse.json({ error: '"apiKey" is required when adding a new provider.' }, { status: 400 });
  }

  const updated = await upsertLLMProvider({
    id,
    kind: body.kind,
    label: body.label,
    apiKey: body.apiKey ?? existing!.apiKey,
    baseUrl: body.baseUrl,
    chatModel: body.chatModel,
    embeddingModel: body.embeddingModel,
    azureApiVersion: body.azureApiVersion,
    roles: body.roles,
    priority: body.priority,
    enabled: body.enabled,
  });

  return NextResponse.json(maskScoutConfig(updated));
}
