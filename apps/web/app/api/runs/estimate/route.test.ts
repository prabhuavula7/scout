import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route.js";

describe("POST /api/runs/estimate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says nothing will be crawled when no doc URLs are given", async () => {
    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ docUrls: [], docsDepth: 1, docsMaxPages: 20 }) }),
    );
    const body = await response.json();
    expect(body.text).toMatch(/no doc urls/i);
  });

  it("estimates size for real doc URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-length": "4000" }) }),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ docUrls: ["https://docs.example.com"], docsDepth: 1, docsMaxPages: 20 }),
      }),
    );
    const body = await response.json();
    expect(body.text).toContain("1 doc URL(s)");
    expect(body.text).toContain("tokens");
  });
});
