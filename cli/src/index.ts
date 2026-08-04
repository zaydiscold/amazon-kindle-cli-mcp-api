#!/usr/bin/env node
import { Command } from "commander";
import { printJson } from "./lib.js";
import * as engine from "./engine.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadAuthFile(): void {
  const p =
    process.env.AMAZON_AUTH_FILE ||
    resolve(process.env.USERPROFILE || process.env.HOME || "", ".amazon/auth.sh");
  try {
    const text = readFileSync(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^export\s+([A-Z0-9_]+)='(.*)'\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      const m2 = line.match(/^export\s+([A-Z0-9_]+)=(.*)$/);
      if (m2 && !process.env[m2[1]]) process.env[m2[1]] = m2[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
  if (!process.env.AMAZON_COOKIE && process.env.AMAZON_COOKIES) {
    process.env.AMAZON_COOKIE = process.env.AMAZON_COOKIES;
  }
}

loadAuthFile();

function positiveLimit(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    throw new Error("--limit must be a positive integer");
  }
  return Number(value);
}

const program = new Command();
program
  .name("amazon-kindle-cli")
  .description("Kindle-first Amazon CLI + MCP — HTTP/scriptable only (auth capture is separate)")
  .option("--json", "JSON output", true);

program.command("doctor").action(async () => printJson(await engine.doctor(), true));

const auth = program.command("auth").description("Amazon session auth");
auth.command("status").action(async () => printJson(await engine.authStatus(), true));
auth
  .command("verify")
  .description("Verify the persisted session against both Amazon retail and Kindle HTTP surfaces")
  .option("--list-id <id>", "Wishlist id (or AMAZON_WISHLIST_ID)")
  .action(async (opts) => printJson(await engine.authVerify({ listId: opts.listId }), true));
auth
  .command("import")
  .requiredOption("--file <path>", "Cookie-Editor JSON / Netscape / raw Cookie header / PP portable JSON")
  .action(async (opts) => printJson(await engine.authImport({ file: opts.file }), true));

const wishlist = program.command("wishlist").description("Amazon wish lists (HTTP)");
wishlist
  .command("list")
  .description("List wishlist items via HTTP + slv/items pagination (no browser scroll)")
  .option("--url <url>", "Wishlist URL")
  .option("--list-id <id>", "Wishlist id (or AMAZON_WISHLIST_ID)")
  .option("--max-pages <n>", "Max pagination hops", "40")
  .option("--limit <n>", "Maximum items to return", positiveLimit)
  .option("--fixture <path>", "Local HTML fixture")
  .action(async (opts) =>
    printJson(
      await engine.wishlistList({
        url: opts.url,
        listId: opts.listId,
        fixture: opts.fixture,
        maxPages: Number(opts.maxPages) || 40,
        limit: opts.limit,
      }),
      true,
    ),
  );
wishlist
  .command("add")
  .description("Add ASIN via POST /hz/wishlist/additemtolist (dry-run default)")
  .option("--asin <asin>")
  .option("--title <title>", "Title to resolve to an Amazon ASIN when --asin is omitted")
  .option("--author <author>", "Optional author to disambiguate title resolution")
  .option("--list-name <name>", "Resolve a named wishlist when --list-id is omitted")
  .option("--list-id <id>", "Wishlist id (default AMAZON_WISHLIST_ID)")
  .option("--execute", "Actually mutate the list", false)
  .action(async (opts) =>
    printJson(
      await engine.wishlistAdd({
        asin: opts.asin,
        title: opts.title,
        author: opts.author,
        listName: opts.listName,
        listId: opts.listId,
        execute: Boolean(opts.execute),
      }),
      true,
    ),
  );

const kindle = program.command("kindle").description("Kindle delivery + library (HTTP)");
kindle
  .command("send")
  .description("Send EPUB/PDF to Kindle via web upload (default) or email SMTP")
  .argument("<files...>", "Files to send")
  .option("--via <path>", "web | email", "web")
  .option("--kindle-email <email>", "you_xxx@kindle.com (email path)")
  .option("--archive", "Add to library (web path)", true)
  .option("--execute", "Actually send (default dry-run)", false)
  .option("--dry-run", "Force plan only", false)
  .action(async (files, opts) => {
    if (opts.via === "browser") {
      throw new Error("browser send path removed — use --via web (HTTP) or --via email");
    }
    const via = opts.via === "email" ? "email" : "web";
    const fn = opts.execute && !opts.dryRun ? engine.kindleSend : engine.kindleSendPlan;
    printJson(
      await fn({
        files,
        via,
        kindleEmail: opts.kindleEmail,
        execute: opts.execute,
        dryRun: opts.dryRun,
        archive: opts.archive,
      }),
      true,
    );
  });
kindle
  .command("recent")
  .description("Recent Send-to-Kindle receipts, not the full personal-document inventory")
  .option("--limit <n>", "Maximum receipts to return", positiveLimit)
  .action(async (opts) => printJson(await engine.kindleRecent({ limit: opts.limit }), true));
kindle
  .command("books")
  .description("List purchased Kindle Ebook metadata via MYCD AJAX")
  .option("--limit <n>", "Maximum items to return", positiveLimit)
  .option("--fixture <path>", "Synthetic JSON/HTML fixture for deterministic parser tests")
  .action(async (opts) => printJson(await engine.kindleBooks({ limit: opts.limit, fixture: opts.fixture }), true));
kindle
  .command("pdocs")
  .description("List Personal Document metadata via MYCD AJAX; not recent receipts")
  .option("--limit <n>", "Maximum items to return", positiveLimit)
  .option("--fixture <path>", "Synthetic JSON/HTML fixture for deterministic parser tests")
  .action(async (opts) => printJson(await engine.kindlePdocs({ limit: opts.limit, fixture: opts.fixture }), true));

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
  .option("--list-id <id>", "Amazon wishlist id (or AMAZON_WISHLIST_ID)")
  .option("--user <id>", "Goodreads user id")
  .option("--direction <dir>", "amazon-to-goodreads | goodreads-to-amazon | both", "both")
  .action(async (opts) =>
    printJson(
      await engine.goodreadsSyncPlan({
        wishlistUrl: opts.url,
        listId: opts.listId,
        fixture: opts.fixture,
        userId: opts.user,
        direction: opts.direction,
      }),
      true,
    ),
  );

program
  .command("parity")
  .description("Diff Amazon wishlist (HTTP full page walk) vs Goodreads shelf")
  .option("--user <id>", "Goodreads user id")
  .option("--shelf <slug>", "Goodreads shelf", "to-read")
  .option("--fixture <path>")
  .option("--url <url>")
  .option("--list-id <id>")
  .action(async (opts) =>
    printJson(
      await engine.parityCheck({
        userId: opts.user,
        shelf: opts.shelf,
        fixture: opts.fixture,
        wishlistUrl: opts.url,
        listId: opts.listId,
      }),
      true,
    ),
  );

const books = program.command("books").description("Resolve titles/photos into add plans");
books
  .command("resolve")
  .option("--title <t>")
  .option("--author <a>")
  .option("--asin <asin>")
  .option("--text <ocr>", "Freeform OCR/vision text")
  .action(async (opts) => printJson(await engine.booksResolve(opts), true));

program
  .command("add-plan")
  .description("Plan multi-surface add (Goodreads + Amazon + Kindle)")
  .option("--title <t>")
  .option("--author <a>")
  .option("--asin <asin>")
  .option("--text <ocr>")
  .action(async (opts) => printJson(await engine.addPlan(opts), true));

program.parseAsync(process.argv);
