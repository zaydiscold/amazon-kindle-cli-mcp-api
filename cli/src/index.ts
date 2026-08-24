#!/usr/bin/env node
import { Command } from "commander";
import { printJson } from "./lib.js";
import * as engine from "./engine.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadAuthFile(): void {
  const path =
    process.env.AMAZON_AUTH_FILE ||
    resolve(process.env.USERPROFILE || process.env.HOME || "", ".amazon/auth.sh");
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const quoted = line.match(/^export\s+([A-Z0-9_]+)='(.*)'\s*$/);
      if (quoted?.[1] && !process.env[quoted[1]]) process.env[quoted[1]] = quoted[2];
      const plain = line.match(/^export\s+([A-Z0-9_]+)=(.*)$/);
      if (plain?.[1] && !process.env[plain[1]]) {
        process.env[plain[1]] = plain[2]?.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Optional local auth file.
  }
  if (!process.env.AMAZON_COOKIE && process.env.AMAZON_COOKIES) {
    process.env.AMAZON_COOKIE = process.env.AMAZON_COOKIES;
  }
}

loadAuthFile();

function positiveLimit(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    throw new Error("value must be a positive integer");
  }
  return Number(value);
}

const program = new Command();
program
  .name("amazon-kindle-cli")
  .version("0.3.0")
  .description("Kindle-first Amazon CLI + MCP using scriptable HTTP product paths")
  .option("--json", "JSON output", true);

program.command("doctor").action(async () => printJson(await engine.doctor(), true));

const auth = program.command("auth").description("Amazon session auth");
auth.command("status").action(async () => printJson(await engine.authStatus(), true));
auth
  .command("verify")
  .description("Verify the persisted session against Amazon retail and Kindle HTTP surfaces")
  .option("--list-id <id>", "Wishlist id (or AMAZON_WISHLIST_ID)")
  .action(async (options) => printJson(await engine.authVerify({ listId: options.listId }), true));
auth
  .command("import")
  .requiredOption("--file <path>", "Cookie-Editor JSON, Netscape cookies, or raw Cookie header")
  .action(async (options) => printJson(await engine.authImport({ file: options.file }), true));

const wishlist = program.command("wishlist").description("Amazon wish lists over HTTP");
wishlist
  .command("list")
  .description("List wishlist items through bounded HTTP pagination")
  .option("--url <url>", "Amazon wishlist URL")
  .option("--list-id <id>", "Wishlist id (or AMAZON_WISHLIST_ID)")
  .option("--max-pages <n>", "Maximum pagination pages", positiveLimit, 40)
  .option("--limit <n>", "Maximum items to return", positiveLimit)
  .option("--fixture <path>", "Local HTML fixture")
  .action(async (options) =>
    printJson(
      await engine.wishlistList({
        url: options.url,
        listId: options.listId,
        fixture: options.fixture,
        maxPages: options.maxPages,
        limit: options.limit,
      }),
      true,
    ),
  );
wishlist
  .command("add")
  .description("Preview or add an exact ASIN through POST /hz/wishlist/additemtolist")
  .option("--asin <asin>")
  .option("--title <title>", "Title to resolve when ASIN is omitted")
  .option("--author <author>", "Optional author for title resolution")
  .option("--list-name <name>", "Resolve a named wishlist")
  .option("--list-id <id>", "Wishlist id (or AMAZON_WISHLIST_ID)")
  .option("--approved-asin <asin>", "Exact ASIN emitted by the preview")
  .option(
    "--approved-list-id <id>",
    "Exact list id emitted by the preview, or <default-list> when no list id is used",
  )
  .option("--execute", "Actually mutate the list", false)
  .action(async (options) =>
    printJson(
      await engine.wishlistAdd({
        asin: options.asin,
        title: options.title,
        author: options.author,
        listName: options.listName,
        listId: options.listId,
        approvedAsin: options.approvedAsin,
        approvedListId: options.approvedListId,
        execute: Boolean(options.execute),
      }),
      true,
    ),
  );

const kindle = program.command("kindle").description("Kindle delivery and library reads");
kindle
  .command("send")
  .description("Preview or send EPUB/PDF files through web upload or email SMTP")
  .argument("<files...>", "Files to send")
  .option("--via <path>", "web or email", "web")
  .option("--kindle-email <email>", "Kindle address for the email path")
  .option("--archive", "Add to library on the web path", true)
  .option(
    "--approved-file-sha256 <hash...>",
    "Exact SHA-256 values emitted by the preview, one for each file",
  )
  .option("--execute", "Actually send", false)
  .option("--dry-run", "Force plan only", false)
  .action(async (files, options) => {
    if (options.via === "browser") {
      throw new Error("browser send is not a product transport; use web or email");
    }
    const via = options.via === "email" ? "email" : "web";
    const operation =
      options.execute && !options.dryRun ? engine.kindleSend : engine.kindleSendPlan;
    printJson(
      await operation({
        files,
        via,
        kindleEmail: options.kindleEmail,
        execute: options.execute,
        dryRun: options.dryRun,
        archive: options.archive,
        approvedFileSha256: options.approvedFileSha256,
      }),
      true,
    );
  });
kindle
  .command("recent")
  .description("Recent Send-to-Kindle receipts, not the full personal-document inventory")
  .option("--limit <n>", "Maximum receipts", positiveLimit)
  .action(async (options) => printJson(await engine.kindleRecent({ limit: options.limit }), true));
kindle
  .command("books")
  .description("List purchased Kindle Ebook metadata through MYCD")
  .option("--limit <n>", "Maximum items", positiveLimit)
  .option("--fixture <path>", "Synthetic fixture for deterministic parsing")
  .action(async (options) =>
    printJson(await engine.kindleBooks({ limit: options.limit, fixture: options.fixture }), true),
  );
kindle
  .command("pdocs")
  .description("List Personal Document metadata through MYCD")
  .option("--limit <n>", "Maximum items", positiveLimit)
  .option("--fixture <path>", "Synthetic fixture for deterministic parsing")
  .action(async (options) =>
    printJson(await engine.kindlePdocs({ limit: options.limit, fixture: options.fixture }), true),
  );

const content = program.command("content").description("Manage Your Content probes");
content
  .command("devices")
  .description("Probe Manage Your Content digital console")
  .action(async () => printJson(await engine.contentDevices(), true));

const sync = program.command("sync").description("Cross-surface sync plans");
sync
  .command("goodreads-plan")
  .option("--fixture <path>")
  .option("--url <url>")
  .option("--list-id <id>", "Amazon wishlist id")
  .option("--user <id>", "Goodreads user id; no personal fallback is used")
  .option(
    "--direction <dir>",
    "amazon-to-goodreads, goodreads-to-amazon, or both",
    "both",
  )
  .action(async (options) =>
    printJson(
      await engine.goodreadsSyncPlan({
        wishlistUrl: options.url,
        listId: options.listId,
        fixture: options.fixture,
        userId: options.user,
        direction: options.direction,
      }),
      true,
    ),
  );

program
  .command("parity")
  .description("Diff an Amazon wishlist against an explicit Goodreads shelf/account")
  .option("--user <id>", "Goodreads user id; no personal fallback is used")
  .option("--shelf <slug>", "Goodreads shelf", "to-read")
  .option("--fixture <path>")
  .option("--url <url>")
  .option("--list-id <id>")
  .action(async (options) =>
    printJson(
      await engine.parityCheck({
        userId: options.user,
        shelf: options.shelf,
        fixture: options.fixture,
        wishlistUrl: options.url,
        listId: options.listId,
      }),
      true,
    ),
  );

const books = program.command("books").description("Resolve titles or photos into add plans");
books
  .command("resolve")
  .option("--title <title>")
  .option("--author <author>")
  .option("--asin <asin>")
  .option("--text <ocr>", "Freeform OCR or vision text")
  .action(async (options) => printJson(await engine.booksResolve(options), true));

program
  .command("add-plan")
  .description("Plan a multi-surface Goodreads, Amazon, and Kindle add")
  .option("--title <title>")
  .option("--author <author>")
  .option("--asin <asin>")
  .option("--text <ocr>")
  .option("--targets <target...>", "goodreads, amazon, kindle")
  .action(async (options) => printJson(await engine.addPlan(options), true));

program.parseAsync(process.argv);
