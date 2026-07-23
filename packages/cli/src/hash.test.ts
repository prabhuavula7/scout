import { describe, expect, it } from "vitest";
import { hashContent } from "./hash.js";

describe("hashContent", () => {
  it("is deterministic for the same input", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
  });

  it("differs for different input", () => {
    expect(hashContent("hello")).not.toBe(hashContent("hello!"));
  });
});
