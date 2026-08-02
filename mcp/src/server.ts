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
  if (!process.env.AMAZON_COOKIE && process.env.AMAZON_COOKIES) {
    process.env.AMAZON_COOKIE = process.env.AMAZON_COOKIES;
  }
}
loadAuth();

const profile = parseMcpProfile(process.env.AMAZON_KINDLE_MCP_PROFILE);
const allowed = new Set(profile === "core" ? CORE_TOOL_NAMES : FULL_TOOL_NAMES);

const server = new McpServer({ name: "amazon-kindle", version: "0.2.0" });

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
add(
  "amazon_kindle_auth_verify",
  { listId: z.string().optional() },
  async (a) => engine.authVerify({ listId: a.listId as string | undefined }),
);
add(
  "amazon_kindle_auth_import",
  { file: z.string() },
  async (a) => engine.authImport({ file: String(a.file) }),
  false,
);
add(
  "amazon_kindle_wishlist_list",
  {
    url: z.string().optional(),
    listId: z.string().optional(),
    fixture: z.string().optional(),
    maxPages: z.number().optional(),
  },
  async (a) =>
    engine.wishlistList({
      url: a.url as string | undefined,
      listId: a.listId as string | undefined,
      fixture: a.fixture as string | undefined,
      maxPages: a.maxPages as number | undefined,
    }),
);
add(
  "amazon_kindle_wishlist_add",
  {
    asin: z.string().optional(),
    title: z.string().optional(),
    author: z.string().optional(),
    listName: z.string().optional(),
    listId: z.string().optional(),
    execute: z.boolean().default(false),
  },
  async (a) =>
    engine.wishlistAdd({
      asin: a.asin as string | undefined,
      title: a.title as string | undefined,
      author: a.author as string | undefined,
      listName: a.listName as string | undefined,
      listId: a.listId as string | undefined,
      execute: Boolean(a.execute),
    }),
  false,
);
add(
  "amazon_kindle_send_plan",
  {
    files: z.array(z.string()),
    via: z.enum(["web", "email"]).optional(),
    kindleEmail: z.string().optional(),
  },
  async (a) =>
    engine.kindleSendPlan({
      files: a.files as string[],
      via: a.via as "web" | "email" | undefined,
      kindleEmail: a.kindleEmail as string | undefined,
    }),
);
add(
  "amazon_kindle_send",
  {
    files: z.array(z.string()),
    via: z.enum(["web", "email"]).optional(),
    kindleEmail: z.string().optional(),
    execute: z.boolean().default(false),
    archive: z.boolean().optional(),
  },
  async (a) =>
    engine.kindleSend({
      files: a.files as string[],
      via: (a.via as "web" | "email") || "web",
      kindleEmail: a.kindleEmail as string | undefined,
      execute: Boolean(a.execute),
      archive: a.archive as boolean | undefined,
    }),
  false,
);
add("amazon_kindle_recent_docs", {}, async () => engine.kindleRecent());
add("amazon_kindle_content_devices", {}, async () => engine.contentDevices());
add(
  "amazon_kindle_goodreads_sync_plan",
  {
    url: z.string().optional(),
    listId: z.string().optional(),
    fixture: z.string().optional(),
    userId: z.string().optional(),
    direction: z.enum(["amazon-to-goodreads", "goodreads-to-amazon", "both"]).optional(),
  },
  async (a) =>
    engine.goodreadsSyncPlan({
      wishlistUrl: a.url as string | undefined,
      listId: a.listId as string | undefined,
      fixture: a.fixture as string | undefined,
      userId: a.userId as string | undefined,
      direction: a.direction as "amazon-to-goodreads" | "goodreads-to-amazon" | "both" | undefined,
    }),
);
add(
  "amazon_kindle_parity",
  {
    userId: z.string().optional(),
    shelf: z.string().optional(),
    url: z.string().optional(),
    listId: z.string().optional(),
    fixture: z.string().optional(),
  },
  async (a) =>
    engine.parityCheck({
      userId: a.userId as string | undefined,
      shelf: a.shelf as string | undefined,
      wishlistUrl: a.url as string | undefined,
      listId: a.listId as string | undefined,
      fixture: a.fixture as string | undefined,
    }),
);
add(
  "amazon_kindle_books_resolve",
  {
    title: z.string().optional(),
    author: z.string().optional(),
    asin: z.string().optional(),
    text: z.string().optional(),
  },
  async (a) =>
    engine.booksResolve({
      title: a.title as string | undefined,
      author: a.author as string | undefined,
      asin: a.asin as string | undefined,
      text: a.text as string | undefined,
    }),
);
add(
  "amazon_kindle_add_plan",
  {
    title: z.string().optional(),
    author: z.string().optional(),
    asin: z.string().optional(),
    text: z.string().optional(),
  },
  async (a) =>
    engine.addPlan({
      title: a.title as string | undefined,
      author: a.author as string | undefined,
      asin: a.asin as string | undefined,
      text: a.text as string | undefined,
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
