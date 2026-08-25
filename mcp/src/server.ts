#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as engine from "@zaydiscold/amazon-kindle-cli/engine";
import {
  parseMcpProfile,
  toolsForProfile,
  type AmazonKindleToolName,
} from "./profile.js";
import { resolveMcpFile, resolveOptionalMcpFile } from "./pathPolicy.js";

function loadAuth(): void {
  const path =
    process.env.AMAZON_AUTH_FILE ||
    resolve(
      process.env.USERPROFILE || process.env.HOME || "",
      ".amazon/auth.sh",
    );
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)\s*$/);
      if (!match?.[1] || process.env[match[1]]) continue;
      const raw = match[2] ?? "";
      process.env[match[1]] = raw.replace(/^(['"])([\s\S]*)\1$/, "$2");
    }
  } catch {
    // Optional: wrappers may already have loaded the environment.
  }
  if (!process.env.AMAZON_COOKIE && process.env.AMAZON_COOKIES) {
    process.env.AMAZON_COOKIE = process.env.AMAZON_COOKIES;
  }
}

loadAuth();

const profile = parseMcpProfile(process.env.AMAZON_KINDLE_MCP_PROFILE);
const allowed = toolsForProfile(profile);
const server = new McpServer({ name: "amazon-kindle", version: "0.3.0" });

function response(value: unknown) {
  const envelope = value as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: envelope,
  };
}

function annotations(readOnly: boolean, destructive = false): ToolAnnotations {
  return {
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    idempotentHint: readOnly,
    openWorldHint: true,
  };
}

function add<Shape extends z.ZodRawShape>(
  name: AmazonKindleToolName,
  title: string,
  description: string,
  schema: Shape,
  handler: (args: z.infer<z.ZodObject<Shape>>) => Promise<unknown>,
  toolAnnotations: ToolAnnotations,
): void {
  if (!allowed.has(name)) return;
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: schema,
      annotations: toolAnnotations,
    },
    async (args) =>
      response(await handler(args as z.infer<z.ZodObject<Shape>>)),
  );
}

add(
  "amazon_kindle_doctor",
  "Amazon Kindle Doctor",
  "Inspect local configuration and bounded Amazon/Kindle readiness without returning credentials.",
  {},
  async () => engine.doctor(),
  annotations(true),
);
add(
  "amazon_kindle_auth_status",
  "Amazon Auth Status",
  "Report cookie names and readiness metadata without cookie values.",
  {},
  async () => engine.authStatus(),
  annotations(true),
);
add(
  "amazon_kindle_auth_verify",
  "Amazon Auth Verify",
  "Verify retail wishlist and Send-to-Kindle read surfaces independently.",
  { listId: z.string().optional() },
  async ({ listId }) => engine.authVerify({ listId }),
  annotations(true),
);
add(
  "amazon_kindle_auth_import",
  "Amazon Auth Import",
  "Import an owned cookie export from AMAZON_KINDLE_MCP_FILE_ROOT. This changes local auth files, not the Amazon account.",
  { file: z.string() },
  async ({ file }) => engine.authImport({ file: resolveMcpFile(file) }),
  annotations(false),
);
add(
  "amazon_kindle_wishlist_list",
  "Amazon Wishlist List",
  "Read an Amazon wishlist with bounded same-origin pagination. A local fixture must be under AMAZON_KINDLE_MCP_FILE_ROOT.",
  {
    url: z.string().optional(),
    listId: z.string().optional(),
    fixture: z.string().optional(),
    maxPages: z.number().int().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(5_000).optional(),
  },
  async ({ url, listId, fixture, maxPages, limit }) =>
    engine.wishlistList({
      url,
      listId,
      fixture: resolveOptionalMcpFile(fixture),
      maxPages,
      limit,
    }),
  annotations(true),
);
add(
  "amazon_kindle_wishlist_add",
  "Amazon Wishlist Add",
  "Preview or add one exact ASIN. Live execution requires the exact approvedAsin and approvedListId emitted by the preview.",
  {
    asin: z.string().optional(),
    title: z.string().optional(),
    author: z.string().optional(),
    listName: z.string().optional(),
    listId: z.string().optional(),
    approvedAsin: z.string().optional(),
    approvedListId: z.string().optional(),
    execute: z.boolean().default(false),
  },
  async (args) => engine.wishlistAdd(args),
  annotations(false),
);
add(
  "amazon_kindle_send_plan",
  "Send to Kindle Plan",
  "Validate owned files and return exact SHA-256 approvals without sending them.",
  {
    files: z.array(z.string()).min(1).max(25),
    via: z.enum(["web", "email"]).optional(),
    kindleEmail: z.string().optional(),
  },
  async ({ files, via, kindleEmail }) =>
    engine.kindleSendPlan({
      files: files.map(resolveMcpFile),
      via,
      kindleEmail,
    }),
  annotations(true),
);
add(
  "amazon_kindle_send",
  "Send to Kindle",
  "Preview or send owned files. Live execution requires every exact approvedFileSha256 value emitted by the preview.",
  {
    files: z.array(z.string()).min(1).max(25),
    via: z.enum(["web", "email"]).optional(),
    kindleEmail: z.string().optional(),
    execute: z.boolean().default(false),
    dryRun: z.boolean().default(false),
    archive: z.boolean().optional(),
    approvedFileSha256: z
      .array(z.string().regex(/^[a-f0-9]{64}$/i))
      .default([]),
  },
  async ({
    files,
    via,
    kindleEmail,
    execute,
    dryRun,
    archive,
    approvedFileSha256,
  }) =>
    engine.kindleSend({
      files: files.map(resolveMcpFile),
      via,
      kindleEmail,
      execute,
      dryRun,
      archive,
      approvedFileSha256,
    }),
  annotations(false),
);
add(
  "amazon_kindle_recent_docs",
  "Recent Send-to-Kindle Documents",
  "Read bounded recent Send-to-Kindle receipts. This is not the complete personal-document inventory.",
  { limit: z.number().int().min(1).max(500).optional() },
  async ({ limit }) => engine.kindleRecent({ limit }),
  annotations(true),
);
add(
  "amazon_kindle_content_devices",
  "Amazon Content Devices Probe",
  "Probe the Manage Your Content page shape without returning page content.",
  {},
  async () => engine.contentDevices(),
  annotations(true),
);
add(
  "amazon_kindle_books",
  "Kindle Books",
  "Read purchased Kindle Ebook metadata through the experimental MYCD contract.",
  {
    limit: z.number().int().min(1).max(5_000).optional(),
    fixture: z.string().optional(),
  },
  async ({ limit, fixture }) =>
    engine.kindleBooks({ limit, fixture: resolveOptionalMcpFile(fixture) }),
  annotations(true),
);
add(
  "amazon_kindle_pdocs",
  "Kindle Personal Documents",
  "Read Personal Document metadata through the experimental MYCD contract without document bytes or action URLs.",
  {
    limit: z.number().int().min(1).max(5_000).optional(),
    fixture: z.string().optional(),
  },
  async ({ limit, fixture }) =>
    engine.kindlePdocs({ limit, fixture: resolveOptionalMcpFile(fixture) }),
  annotations(true),
);
add(
  "amazon_kindle_goodreads_sync_plan",
  "Goodreads Amazon Sync Plan",
  "Build a dry-run parity plan for an explicit Goodreads user and Amazon wishlist.",
  {
    url: z.string().optional(),
    listId: z.string().optional(),
    fixture: z.string().optional(),
    userId: z.string().optional(),
    direction: z
      .enum(["amazon-to-goodreads", "goodreads-to-amazon", "both"])
      .optional(),
  },
  async ({ url, listId, fixture, userId, direction }) =>
    engine.goodreadsSyncPlan({
      wishlistUrl: url,
      listId,
      fixture: resolveOptionalMcpFile(fixture),
      userId,
      direction,
    }),
  annotations(true),
);
add(
  "amazon_kindle_parity",
  "Amazon Goodreads Parity",
  "Compare an Amazon wishlist with an explicit Goodreads user/shelf. No personal user fallback is used.",
  {
    userId: z.string().optional(),
    shelf: z.string().optional(),
    url: z.string().optional(),
    listId: z.string().optional(),
    fixture: z.string().optional(),
  },
  async ({ userId, shelf, url, listId, fixture }) =>
    engine.parityCheck({
      userId,
      shelf,
      wishlistUrl: url,
      listId,
      fixture: resolveOptionalMcpFile(fixture),
    }),
  annotations(true),
);
add(
  "amazon_kindle_books_resolve",
  "Book Photo or Text Resolve",
  "Resolve user-supplied title, ASIN, or vision/OCR text into bounded Goodreads and Amazon add plans.",
  {
    title: z.string().optional(),
    author: z.string().optional(),
    asin: z.string().optional(),
    text: z.string().optional(),
  },
  async (args) => engine.booksResolve(args),
  annotations(true),
);
add(
  "amazon_kindle_add_plan",
  "Multi-Surface Book Add Plan",
  "Plan an exact Goodreads shelf, Amazon wishlist, and/or Kindle delivery action without executing it.",
  {
    title: z.string().optional(),
    author: z.string().optional(),
    asin: z.string().optional(),
    text: z.string().optional(),
    targets: z.array(z.enum(["goodreads", "amazon", "kindle"])).optional(),
  },
  async (args) => engine.addPlan(args),
  annotations(true),
);

const transport = new StdioServerTransport();
await server.connect(transport);
