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

const program = new Command();
program
  .name("amazon-kindle-cli")
  .description("Kindle-first Amazon CLI + MCP — parity with Goodreads, dual send paths")
  .option("--json", "JSON output", true);

program.command("doctor").action(async () => printJson(await engine.doctor(), true));

const auth = program.command("auth").description("Amazon session auth");
auth.command("status").action(async () => printJson(await engine.authStatus(), true));
auth
  .command("import")
  .requiredOption("--file <path>", "Cookie-Editor JSON / Netscape / raw Cookie header / PP portable JSON")
  .action(async (opts) => printJson(await engine.authImport({ file: opts.file }), true));

const wishlist = program.command("wishlist").description("Amazon wish lists");
wishlist
  .command("list")
  .option("--url <url>", "Wishlist URL")
  .option("--fixture <path>", "Local HTML fixture")
  .action(async (opts) => printJson(await engine.wishlistList(opts), true));
wishlist
  .command("add")
  .description("Add a book to Amazon Shopping List through the Brave browser (dry-run default)")
  .option("--asin <asin>")
  .option("--title <title>")
  .option("--author <author>")
  .option("--list-name <name>", "Amazon list name", "Shopping List")
  .option("--execute", "Actually click Add to List", false)
  .action(async (opts) => printJson(await engine.wishlistAdd(opts), true));

const kindle = program.command("kindle").description("Kindle delivery + library");
kindle
  .command("send")
  .description("Send EPUB/PDF to Kindle via web upload (default) or email SMTP")
  .argument("<files...>", "Files to send")
  .option("--via <path>", "browser | web | email", "browser")
  .option("--kindle-email <email>", "you_xxx@kindle.com (email path)")
  .option("--archive", "Add to library (web path)", true)
  .option("--execute", "Actually send (default dry-run)", false)
  .option("--dry-run", "Force plan only", false)
  .action(async (files, opts) => {
    const via = opts.via === "email" ? "email" : opts.via === "browser" ? "browser" : "web";
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
kindle.command("recent").description("Recent Send-to-Kindle docs").action(async () => {
  printJson(await engine.kindleRecent(), true);
});

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
  .option("--user <id>", "Goodreads user id")
  .option("--direction <dir>", "amazon-to-goodreads | goodreads-to-amazon | both", "both")
  .action(async (opts) =>
    printJson(
      await engine.goodreadsSyncPlan({
        wishlistUrl: opts.url,
        fixture: opts.fixture,
        userId: opts.user,
        direction: opts.direction,
      }),
      true,
    ),
  );

program
  .command("parity")
  .description("Diff Amazon wishlist vs Goodreads shelf (to-read default)")
  .option("--user <id>", "Goodreads user id")
  .option("--shelf <slug>", "Goodreads shelf", "to-read")
  .option("--fixture <path>")
  .option("--url <url>")
  .action(async (opts) =>
    printJson(
      await engine.parityCheck({
        userId: opts.user,
        shelf: opts.shelf,
        fixture: opts.fixture,
        wishlistUrl: opts.url,
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
