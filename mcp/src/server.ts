#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as engine from "@zaydiscold/amazon-kindle-cli/engine";
import { CORE_TOOL_NAMES, FULL_TOOL_NAMES, parseMcpProfile } from "./profile.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadAuth(): void {
  const p =
    process.env.AMAZON_AUTH_FILE ||
    resolve(process.env.USERPROFILE || process.env.HOME || "", ".amazon/auth.sh");
  try {
    const text = readFileSync(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^export\s+([A-Z0-9_]+)='(.*)'\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* optional */
  }
}
loadAuth();

const profile = parseMcpProfile(process.env.AMAZON_KINDLE_MCP_PROFILE);
const allowed = new Set(profile === "core" ? CORE_TOOL_NAMES : FULL_TOOL_NAMES);

const server = new McpServer({ name: "amazon-kindle", version: "0.1.0" });

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function add(
  name: (typeof FULL_TOOL_NAMES)[number],
  schema: z.ZodRawShape,
  handler: (a: Record<string, unknown>) => Promise<unknown>,
  readOnly = true,
) {
  if (!allowed.has(name)) return;
  server.registerTool(
    name,
    {
      description: name.replace(/_/g, " "),
      inputSchema: schema,
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: !readOnly && name.includes("send"),
        openWorldHint: true,
      },
    },
    async (args) => ok(await handler(args as Record<string, unknown>)),
  );
}

add("amazon_kindle_doctor", {}, async () => engine.doctor());
add("amazon_kindle_auth_status", {}, async () => engine.authStatus());
add("amazon_kindle_auth_import", { file: z.string() }, async (a) => engine.authImport({ file: String(a.file) }), false);
add(
  "amazon_kindle_wishlist_list",
  { url: z.string().optional(), fixture: z.string().optional() },
  async (a) => engine.wishlistList({ url: a.url as string | undefined, fixture: a.fixture as string | undefined }),
);
add(
  "amazon_kindle_send_plan",
  { files: z.array(z.string()), kindleEmail: z.string().optional() },
  async (a) => engine.kindleSendPlan({ files: a.files as string[], kindleEmail: a.kindleEmail as string | undefined }),
);
add(
  "amazon_kindle_send",
  { files: z.array(z.string()), kindleEmail: z.string().optional(), execute: z.boolean().default(false) },
  async (a) =>
    engine.kindleSend({
      files: a.files as string[],
      kindleEmail: a.kindleEmail as string | undefined,
      execute: Boolean(a.execute),
    }),
  false,
);
add("amazon_kindle_content_devices", {}, async () => engine.contentDevices());
add(
  "amazon_kindle_goodreads_sync_plan",
  { url: z.string().optional(), fixture: z.string().optional() },
  async (a) => engine.goodreadsSyncPlan({ wishlistUrl: a.url as string | undefined, fixture: a.fixture as string | undefined }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
