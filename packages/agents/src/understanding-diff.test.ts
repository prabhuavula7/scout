import { describe, expect, it } from "vitest";
import type { PlatformUnderstanding } from "@scout/types";
import { diffUnderstanding, hasDrift } from "./understanding-diff.js";

function fakeUnderstanding(overrides: Partial<PlatformUnderstanding> = {}): PlatformUnderstanding {
  return {
    platformId: "00000000-0000-0000-0000-000000000000",
    summary: "s",
    architectureOverview: "a",
    authenticationFlow: "auth",
    dataModel: [{ entity: "Widget", description: "d", keyFields: ["id"] }],
    entityRelationships: [],
    commonWorkflows: [{ name: "List widgets", steps: ["step"] }],
    integrationOpportunities: ["Sync widgets to a warehouse"],
    potentialPitfalls: ["Rate limits at 100 req/s"],
    missingDocumentation: [],
    securityObservations: [],
    mermaidSequenceDiagram: "sequenceDiagram",
    mermaidErDiagram: "erDiagram",
    citations: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("diffUnderstanding", () => {
  it("reports no prior snapshot when there's nothing to compare against", () => {
    const diff = diffUnderstanding(null, fakeUnderstanding());
    expect(diff.hasPriorSnapshot).toBe(false);
    expect(hasDrift(diff)).toBe(false);
  });

  it("reports no drift when nothing actually changed", () => {
    const understanding = fakeUnderstanding();
    const diff = diffUnderstanding(understanding, { ...understanding, generatedAt: "2026-01-02T00:00:00.000Z" });
    expect(diff.hasPriorSnapshot).toBe(true);
    expect(hasDrift(diff)).toBe(false);
  });

  it("detects a changed narrative field", () => {
    const previous = fakeUnderstanding();
    const current = fakeUnderstanding({ architectureOverview: "a completely different overview" });
    const diff = diffUnderstanding(previous, current);
    expect(diff.changedNarrativeFields).toEqual(["architectureOverview"]);
    expect(hasDrift(diff)).toBe(true);
  });

  it("detects added and removed workflows by name", () => {
    const previous = fakeUnderstanding({
      commonWorkflows: [
        { name: "List widgets", steps: ["step"] },
        { name: "Delete a widget", steps: ["step"] },
      ],
    });
    const current = fakeUnderstanding({
      commonWorkflows: [
        { name: "List widgets", steps: ["step"] },
        { name: "Create a widget", steps: ["step"] },
      ],
    });
    const diff = diffUnderstanding(previous, current);
    expect(diff.workflowsAdded).toEqual(["Create a widget"]);
    expect(diff.workflowsRemoved).toEqual(["Delete a widget"]);
  });

  it("detects added and removed data model entities by name", () => {
    const previous = fakeUnderstanding({ dataModel: [{ entity: "Widget", description: "d", keyFields: ["id"] }] });
    const current = fakeUnderstanding({
      dataModel: [
        { entity: "Widget", description: "d", keyFields: ["id"] },
        { entity: "Gadget", description: "d2", keyFields: ["id"] },
      ],
    });
    const diff = diffUnderstanding(previous, current);
    expect(diff.dataModelEntitiesAdded).toEqual(["Gadget"]);
    expect(diff.dataModelEntitiesRemoved).toEqual([]);
  });

  it("detects added/removed security observations", () => {
    const previous = fakeUnderstanding({ securityObservations: ["API keys must be rotated every 90 days"] });
    const current = fakeUnderstanding({
      securityObservations: ["API keys must be rotated every 90 days", "Webhook payloads must be signature-verified"],
    });
    const diff = diffUnderstanding(previous, current);
    expect(diff.securityObservationsAdded).toEqual(["Webhook payloads must be signature-verified"]);
    expect(diff.securityObservationsRemoved).toEqual([]);
    expect(hasDrift(diff)).toBe(true);
  });

  it("detects added/removed pitfalls and integration opportunities", () => {
    const previous = fakeUnderstanding({ potentialPitfalls: ["Rate limits at 100 req/s"] });
    const current = fakeUnderstanding({ potentialPitfalls: ["Rate limits at 100 req/s", "Pagination caps at 1000 items"] });
    const diff = diffUnderstanding(previous, current);
    expect(diff.pitfallsAdded).toEqual(["Pagination caps at 1000 items"]);
    expect(diff.pitfallsRemoved).toEqual([]);
  });
});
