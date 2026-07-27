import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "../src/engine.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("CLI↔MCP parity", () => {
  it("every capability has mcp tool name", () => {
    for (const c of CAPABILITIES) {
      expect(c.mcpTool).toMatch(/^amazon_kindle_/);
      expect(c.cli.length).toBeGreaterThan(0);
    }
  });

  it("mcp server registers the same tool set", () => {
    const server = readFileSync(join(root, "mcp/src/server.ts"), "utf8");
    for (const c of CAPABILITIES) {
      expect(server).toContain(c.mcpTool);
    }
  });
});
