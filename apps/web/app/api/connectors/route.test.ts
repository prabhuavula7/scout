import { describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("GET /api/connectors", () => {
  it("returns the bundled connector registry", async () => {
    const response = await GET();
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.some((c: { slug: string }) => c.slug === "contentful")).toBe(true);
  });
});
