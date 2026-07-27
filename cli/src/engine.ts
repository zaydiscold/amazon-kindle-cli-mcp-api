import { envelope, type CommandEnvelope } from "./lib.js";
import { executeAmazonGet } from "./client/live.js";
import { executeKindleSend, planKindleSend, type KindleSendOptions } from "./client/kindleSend.js";
import { parseWishlistHtml } from "./parsers/wishlist.js";
import { emitLiveMutationWarning } from "./risk.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const CAPABILITIES = [
  { key: "doctor", cli: "doctor", mcpTool: "amazon_kindle_doctor", readOnly: true, risk: "read" as const },
  { key: "auth-status", cli: "auth status", mcpTool: "amazon_kindle_auth_status", readOnly: true, risk: "read" as const },
  { key: "auth-import", cli: "auth import", mcpTool: "amazon_kindle_auth_import", readOnly: false, risk: "write-safe" as const },
  { key: "wishlist-list", cli: "wishlist list", mcpTool: "amazon_kindle_wishlist_list", readOnly: true, risk: "read" as const },
  { key: "kindle-send", cli: "kindle send", mcpTool: "amazon_kindle_send", readOnly: false, risk: "write-mutate" as const },
  { key: "kindle-send-plan", cli: "kindle send --dry-run", mcpTool: "amazon_kindle_send_plan", readOnly: true, risk: "read" as const },
  { key: "content-devices", cli: "content devices", mcpTool: "amazon_kindle_content_devices", readOnly: true, risk: "read" as const },
  { key: "goodreads-sync-plan", cli: "sync goodreads-plan", mcpTool: "amazon_kindle_goodreads_sync_plan", readOnly: true, risk: "read" as const },
] as const;

function authPaths() {
  const dir = join(homedir(), ".amazon");
  return { dir, sh: join(dir, "auth.sh"), bat: join(dir, "auth.bat"), meta: join(dir, "session-meta.json") };
}

export async function doctor(): Promise<CommandEnvelope> {
  const cookie = Boolean(process.env.AMAZON_COOKIE);
  const kindleEmail = Boolean(process.env.KINDLE_EMAIL || process.env.KINDLE_SEND_ADDRESS);
  const smtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD));
  let live: unknown = null;
  if (cookie) {
    try {
      const r = await executeAmazonGet("https://www.amazon.com/gp/css/homepage.html");
      live = {
        status: r.status,
        signedInHint: /Hello,\s*[^<]+/i.test(r.text) || /nav-link-accountList/i.test(r.text),
        byteLength: r.byteLength,
      };
    } catch (e) {
      live = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return envelope("doctor", "read", {
    amazonCookie: cookie,
    kindleEmail,
    smtp,
    live,
    capabilities: CAPABILITIES.map((c) => c.key),
    notes: [
      "Send-to-Kindle needs KINDLE_EMAIL + SMTP_* only (no Amazon cookie).",
      "Wishlist / content devices need AMAZON_COOKIE from Brave CDP login or auth import.",
      "Dedicated debug browser: Brave on :9333 with profile amazon-kindle-debug-profile.",
    ],
  });
}

export async function authStatus(): Promise<CommandEnvelope> {
  const cookie = process.env.AMAZON_COOKIE || "";
  const names = cookie ? cookie.split(/;\s*/).map((p) => p.split("=")[0]).filter(Boolean) : [];
  return envelope("auth-status", "read", {
    present: Boolean(cookie),
    cookieCount: names.length,
    cookieNames: names,
    critical: {
      "session-id": names.includes("session-id"),
      "at-main": names.includes("at-main"),
      "x-main": names.includes("x-main"),
      "ubid-main": names.includes("ubid-main"),
    },
  });
}

export async function authImport(opts: { file?: string; header?: string }): Promise<CommandEnvelope> {
  let header = opts.header?.trim() || "";
  if (opts.file) {
    const raw = await readFile(opts.file, "utf8");
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : parsed.cookies || parsed;
      if (!Array.isArray(arr)) throw new Error("JSON must be an array of {name,value} cookies");
      const amazon = arr.filter((c: { domain?: string }) => !c.domain || String(c.domain).includes("amazon"));
      header = amazon.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ");
    } else if (trimmed.includes("\t")) {
      const parts: string[] = [];
      for (const line of trimmed.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const cols = line.split("\t");
        if (cols.length >= 7 && cols[0].includes("amazon")) parts.push(`${cols[5]}=${cols[6]}`);
      }
      header = parts.join("; ");
    } else {
      header = trimmed.replace(/^Cookie:\s*/i, "");
    }
  }
  if (!header) throw new Error("no cookies found to import");
  const { dir, sh, bat, meta } = authPaths();
  await mkdir(dir, { recursive: true });
  const safe = header.replace(/'/g, "'\\''");
  await writeFile(sh, `# Amazon buyer session — imported\nexport AMAZON_COOKIE='${safe}'\nexport AMAZON_DOMAIN=www.amazon.com\n`, { mode: 0o600 });
  await writeFile(bat, `@echo off\nset "AMAZON_COOKIE=${header}"\nset "AMAZON_DOMAIN=www.amazon.com"\n`);
  const names = header.split(/;\s*/).map((p) => p.split("=")[0]).filter(Boolean);
  await writeFile(meta, JSON.stringify({ imported_at: new Date().toISOString(), cookie_count: names.length, cookie_names: names, source: opts.file || "header" }, null, 2));
  process.env.AMAZON_COOKIE = header;
  return envelope("auth-import", "write-safe", { imported: true, cookieCount: names.length, cookieNames: names, authFile: sh });
}

export async function wishlistList(opts: { url?: string; fixture?: string } = {}): Promise<CommandEnvelope> {
  let html: string;
  if (opts.fixture) {
    html = await readFile(opts.fixture, "utf8");
  } else {
    const url = opts.url || "https://www.amazon.com/hz/wishlist/ls";
    const res = await executeAmazonGet(url);
    if (res.status >= 300 && res.status < 400) {
      return envelope("wishlist-list", "read", { redirected: true, status: res.status }, { ok: false, warnings: ["session redirect — re-login Brave CDP or re-import AMAZON_COOKIE"] });
    }
    html = res.text;
  }
  const page = parseWishlistHtml(html);
  return envelope("wishlist-list", "read", page);
}

export async function kindleSendPlan(opts: KindleSendOptions): Promise<CommandEnvelope> {
  const plan = await planKindleSend(opts);
  return envelope("kindle-send-plan", "read", plan, { warnings: plan.blockers });
}

export async function kindleSend(opts: KindleSendOptions): Promise<CommandEnvelope> {
  const plan = await planKindleSend(opts);
  if (plan.dryRun || !opts.execute) {
    return envelope("kindle-send", "write-mutate", { submitted: false, plan }, { warnings: plan.blockers });
  }
  emitLiveMutationWarning("SMTP Send-to-Kindle");
  const result = await executeKindleSend({ ...opts, execute: true });
  return envelope("kindle-send", "write-mutate", result);
}

export async function contentDevices(): Promise<CommandEnvelope> {
  const url = "https://www.amazon.com/hz/mycd/digital-console/contentlist/booksAll/dateDsc/";
  const res = await executeAmazonGet(url);
  const signedOut = /sign in/i.test(res.bodyPreview || "") && res.status === 200 && res.byteLength < 50_000;
  return envelope("content-devices", "read", {
    status: res.status,
    byteLength: res.byteLength,
    signedOutHint: signedOut,
    url,
    note: "HTML shape varies; prefer Manage Your Content for Send-to-Kindle address discovery.",
  });
}

export async function goodreadsSyncPlan(opts: { wishlistUrl?: string; fixture?: string } = {}): Promise<CommandEnvelope> {
  const wl = await wishlistList({ url: opts.wishlistUrl, fixture: opts.fixture });
  const items = (wl.data as { items?: Array<{ title: string | null; author: string | null; asin: string | null }> }).items || [];
  const actions = items.map((it) => ({
    title: it.title,
    author: it.author,
    asin: it.asin,
    goodreadsAction: {
      tool: "goodreads_shelf_add",
      args: { shelf: "to-read", execute: false },
      resolve: "Resolve Goodreads book_id via search/editions before execute",
    },
  }));
  return envelope("goodreads-sync-plan", "read", {
    count: actions.length,
    actions,
    note: "Dry-run plan only. Execute via goodreads-cli shelves add after resolving book ids.",
  });
}
