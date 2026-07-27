import { describe, expect, it } from "vitest";
import { FULL_TOOL_NAMES, CORE_TOOL_NAMES } from "../src/profile.js";

describe("profiles", () => {
  it("core is a subset of full", () => {
    const full = new Set(FULL_TOOL_NAMES);
    for (const n of CORE_TOOL_NAMES) expect(full.has(n)).toBe(true);
  });
  it("includes kindle send tools", () => {
    expect(FULL_TOOL_NAMES).toContain("amazon_kindle_send");
    expect(CORE_TOOL_NAMES).toContain("amazon_kindle_send");
  });
});
