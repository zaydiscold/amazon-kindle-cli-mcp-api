import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "@zaydiscold/amazon-kindle-cli/engine";
import { FULL_TOOL_NAMES, CORE_TOOL_NAMES } from "../src/profile.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/** Regression guard: Amazon follows the Goodreads one-engine CLI↔MCP contract. */
describe("CLI ↔ MCP capability parity", () => {
  it("every engine capability is exposed as a full MCP tool", () => {
    const full = new Set<string>(FULL_TOOL_NAMES);
    for (const capability of CAPABILITIES) {
      expect(full.has(capability.mcpTool), `${capability.key} missing MCP tool ${capability.mcpTool}`).toBe(true);
      expect(capability.cli, `${capability.key} must have a CLI command`).not.toBeNull();
    }
  });

  it("core is a subset of full", () => {
    const full = new Set<string>(FULL_TOOL_NAMES);
    for (const tool of CORE_TOOL_NAMES) expect(full.has(tool)).toBe(true);
  });

  it("passes HTTP wishlist listId through parity and sync adapters", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const server = readFileSync(resolve(here, "../src/server.ts"), "utf8");
    expect(server).toMatch(/amazon_kindle_parity[\s\S]*?listId:/);
    expect(server).toMatch(/amazon_kindle_goodreads_sync_plan[\s\S]*?listId:/);
  });
});
