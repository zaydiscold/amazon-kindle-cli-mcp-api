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
}

loadAuthFile();

const program = new Command();
program
  .name("amazon-kindle-cli")
  .description("Kindle-first Amazon CLI + MCP engine")
  .option("--json", "JSON output", true);

program.command("doctor").action(async () => printJson(await engine.doctor(), true));

const auth = program.command("auth").description("Amazon session auth");
auth.command("status").action(async () => printJson(await engine.authStatus(), true));
auth
  .command("import")
  .requiredOption("--file <path>", "Cookie-Editor JSON / Netscape / raw Cookie header file")
  .action(async (opts) => printJson(await engine.authImport({ file: opts.file }), true));

const wishlist = program.command("wishlist").description("Amazon wish lists");
wishlist
  .command("list")
  .option("--url <url>", "Wishlist URL")
  .option("--fixture <path>", "Local HTML fixture")
  .action(async (opts) => printJson(await engine.wishlistList(opts), true));

const kindle = program.command("kindle").description("Kindle delivery + library");
kindle
  .command("send")
  .description("Send EPUB/PDF/etc to Kindle via approved Send-to-Kindle email")
  .argument("<files...>", "Files to send")
  .option("--kindle-email <email>", "you_xxx@kindle.com")
  .option("--execute", "Actually send (default dry-run)", false)
  .option("--dry-run", "Force plan only", false)
  .action(async (files, opts) => {
    const fn = opts.execute && !opts.dryRun ? engine.kindleSend : engine.kindleSendPlan;
    printJson(
      await fn({
        files,
        kindleEmail: opts.kindleEmail,
        execute: opts.execute,
        dryRun: opts.dryRun,
      }),
      true,
    );
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
  .action(async (opts) =>
    printJson(await engine.goodreadsSyncPlan({ wishlistUrl: opts.url, fixture: opts.fixture }), true),
  );

program.parseAsync(process.argv);
