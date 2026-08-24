import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "@zaydiscold/amazon-kindle-cli/engine";
import {
  FULL_TOOL_NAMES,
  CORE_TOOL_NAMES,
  READ_TOOL_NAMES,
  parseMcpProfile,
  toolsForProfile,
} from "../src/profile.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/** Regression guard: Amazon follows the Goodreads one-engine CLI↔MCP contract. */
describe("CLI ↔ MCP capability parity", () => {
  it("every engine capability is exposed as a full MCP tool", () => {
    const full = new Set<string>(FULL_TOOL_NAMES);
    for (const capability of CAPABILITIES) {
      expect(
        full.has(capability.mcpTool),
        `${capability.key} missing MCP tool ${capability.mcpTool}`,
      ).toBe(true);
      expect(
        capability.cli,
        `${capability.key} must have a CLI command`,
      ).not.toBeNull();
    }
  });

  it("core and read profiles are subsets of full", () => {
    const full = new Set<string>(FULL_TOOL_NAMES);
    for (const tool of CORE_TOOL_NAMES) expect(full.has(tool)).toBe(true);
    for (const tool of READ_TOOL_NAMES) expect(full.has(tool)).toBe(true);
  });

  it("the default read profile exposes no mutating capability", () => {
    expect(parseMcpProfile(undefined)).toBe("read");
    const read = toolsForProfile("read");
    for (const capability of CAPABILITIES) {
      if (!read.has(capability.mcpTool)) continue;
      expect(
        capability.readOnly,
        `${capability.mcpTool} must be read-only`,
      ).toBe(true);
    }
    expect(() => parseMcpProfile("typo")).toThrow("must be one of");
  });

  it("passes list, target, and approval fields through MCP adapters", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const server = readFileSync(resolve(here, "../src/server.ts"), "utf8");
    expect(server).toMatch(/amazon_kindle_parity[\s\S]*?listId:/);
    expect(server).toMatch(/amazon_kindle_goodreads_sync_plan[\s\S]*?listId:/);
    expect(server).toMatch(/amazon_kindle_wishlist_add[\s\S]*?approvedAsin/);
    expect(server).toMatch(/amazon_kindle_send[\s\S]*?approvedFileSha256/);
    expect(server).toMatch(/amazon_kindle_add_plan[\s\S]*?targets:/);
  });
});
