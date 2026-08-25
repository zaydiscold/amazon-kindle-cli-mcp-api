import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveMcpFile } from "../src/pathPolicy.js";

const originalRoot = process.env.AMAZON_KINDLE_MCP_FILE_ROOT;
const originalArbitrary = process.env.AMAZON_KINDLE_MCP_ALLOW_ARBITRARY_FILES;

afterEach(() => {
  if (originalRoot === undefined)
    delete process.env.AMAZON_KINDLE_MCP_FILE_ROOT;
  else process.env.AMAZON_KINDLE_MCP_FILE_ROOT = originalRoot;
  if (originalArbitrary === undefined) {
    delete process.env.AMAZON_KINDLE_MCP_ALLOW_ARBITRARY_FILES;
  } else {
    process.env.AMAZON_KINDLE_MCP_ALLOW_ARBITRARY_FILES = originalArbitrary;
  }
});

describe("Amazon Kindle MCP file policy", () => {
  it("resolves relative paths from the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "kindle-mcp-root-"));
    const file = join(root, "owned.epub");
    await writeFile(file, "owned");
    process.env.AMAZON_KINDLE_MCP_FILE_ROOT = root;

    expect(resolveMcpFile("owned.epub")).toBe(realpathSync(file));
  });

  it("rejects absolute, traversal, and symlink escapes", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kindle-mcp-parent-"));
    const root = join(parent, "root");
    const outside = join(parent, "private.epub");
    await mkdir(root);
    await writeFile(outside, "private");
    await symlink(outside, join(root, "escape.epub"));
    process.env.AMAZON_KINDLE_MCP_FILE_ROOT = root;

    expect(() => resolveMcpFile(outside)).toThrow(
      "restricted to AMAZON_KINDLE_MCP_FILE_ROOT",
    );
    expect(() => resolveMcpFile("../private.epub")).toThrow(
      "restricted to AMAZON_KINDLE_MCP_FILE_ROOT",
    );
    expect(() => resolveMcpFile("escape.epub")).toThrow(
      "restricted to AMAZON_KINDLE_MCP_FILE_ROOT",
    );
  });

  it("supports an explicit unsafe local override", async () => {
    const root = await mkdtemp(join(tmpdir(), "kindle-mcp-root-"));
    const outside = await mkdtemp(join(tmpdir(), "kindle-mcp-outside-"));
    const file = join(outside, "owned.epub");
    await writeFile(file, "owned");
    process.env.AMAZON_KINDLE_MCP_FILE_ROOT = root;
    process.env.AMAZON_KINDLE_MCP_ALLOW_ARBITRARY_FILES = "1";

    expect(resolveMcpFile(file)).toBe(realpathSync(file));
  });
});
