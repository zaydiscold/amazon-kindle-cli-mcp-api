import { envelope, type CommandEnvelope } from "./lib.js";
import { executeAmazonGet } from "./client/live.js";
import { executeKindleSend, planKindleSend, type KindleSendOptions } from "./client/kindleSend.js";
import { executeWebUpload, planWebUpload, recentDocs } from "./client/kindleWebUpload.js";
import { browserSendToKindle } from "./client/kindleBrowser.js";
import { browserWishlistAdd } from "./client/wishlistBrowser.js";
import { parseWishlistHtml } from "./parsers/wishlist.js";
import { emitLiveMutationWarning } from "./risk.js";
import { bookKey, computeParity, type BookRef } from "./parity.js";
import { fetchGoodreadsShelfRss, searchGoodreadsBookId } from "./client/goodreadsBridge.js";
import { readFile, writeFile, mkdir, readFile as readFileAsync } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CAPABILITIES = [
  { key: "doctor", cli: "doctor", mcpTool: "amazon_kindle_doctor", readOnly: true, risk: "read" as const },
  { key: "auth-status", cli: "auth status", mcpTool: "amazon_kindle_auth_status", readOnly: true, risk: "read" as const },
  { key: "auth-import", cli: "auth import", mcpTool: "amazon_kindle_auth_import", readOnly: false, risk: "write-safe" as const },
  { key: "wishlist-list", cli: "wishlist list", mcpTool: "amazon_kindle_wishlist_list", readOnly: true, risk: "read" as const },
  { key: "wishlist-add", cli: "wishlist add", mcpTool: "amazon_kindle_wishlist_add", readOnly: false, risk: "write-mutate" as const },
  { key: "kindle-send", cli: "kindle send", mcpTool: "amazon_kindle_send", readOnly: false, risk: "write-mutate" as const },
  { key: "kindle-send-plan", cli: "kindle send --dry-run", mcpTool: "amazon_kindle_send_plan", readOnly: true, risk: "read" as const },
  { key: "kindle-recent", cli: "kindle recent", mcpTool: "amazon_kindle_recent_docs", readOnly: true, risk: "read" as const },
  { key: "content-devices", cli: "content devices", mcpTool: "amazon_kindle_content_devices", readOnly: true, risk: "read" as const },
  { key: "goodreads-sync-plan", cli: "sync goodreads-plan", mcpTool: "amazon_kindle_goodreads_sync_plan", readOnly: true, risk: "read" as const },
  { key: "parity", cli: "parity", mcpTool: "amazon_kindle_parity", readOnly: true, risk: "read" as const },
  { key: "photo-resolve", cli: "books resolve", mcpTool: "amazon_kindle_books_resolve", readOnly: true, risk: "read" as const },
  { key: "add-plan", cli: "add-plan", mcpTool: "amazon_kindle_add_plan", readOnly: true, risk: "read" as const },
] as const;

function authPaths() {
  const dir = join(homedir(), ".amazon");
  return {
    dir,
    sh: join(dir, "auth.sh"),
    bat: join(dir, "auth.bat"),
    meta: join(dir, "session-meta.json"),
    config: join(dir, "config.json"),
  };
}

function loadLocalConfig(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(authPaths().config, "utf8"));
  } catch {
    return {};
  }
}

function goodreadsUserId(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.GOODREADS_USER_ID) return process.env.GOODREADS_USER_ID;
  const cfg = loadLocalConfig();
  if (typeof cfg.goodreads_user_id === "string") return cfg.goodreads_user_id;
  return "179929687";
}

export async function doctor(): Promise<CommandEnvelope> {
  if (!process.env.AMAZON_COOKIE && process.env.AMAZON_COOKIES) {
    process.env.AMAZON_COOKIE = process.env.AMAZON_COOKIES;
  }
  const cookie = Boolean(process.env.AMAZON_COOKIE);
  const kindleEmail = Boolean(process.env.KINDLE_EMAIL || process.env.KINDLE_SEND_ADDRESS);
  const smtp = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD),
  );
  const cfg = loadLocalConfig();
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
    kindleEmails: cfg.kindle_emails || null,
    goodreadsUserId: goodreadsUserId(),
    live,
    capabilities: CAPABILITIES.map((c) => c.key),
    sendPaths: ["web (POST /sendtokindle/*)", "email (SMTP → KINDLE_EMAIL)"],
    notes: [
      "Preferred Kindle path: web upload via AMAZON_COOKIE (no SMTP).",
      "Parity: amazon wishlist ↔ goodreads to-read (RSS).",
      "Brave CDP :9333 profile amazon-kindle-debug-profile for session refresh.",
    ],
  });
}

export async function authStatus(): Promise<CommandEnvelope> {
  const cookie = process.env.AMAZON_COOKIE || process.env.AMAZON_COOKIES || "";
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
      if (typeof parsed.cookies === "string") {
        header = parsed.cookies;
      } else {
        const arr = Array.isArray(parsed) ? parsed : parsed.cookies || parsed;
        if (!Array.isArray(arr)) throw new Error("JSON must be cookies array or {cookies}");
        const amazon = arr.filter(
          (c: { domain?: string }) => !c.domain || String(c.domain).includes("amazon"),
        );
        header = amazon.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ");
      }
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
  await writeFile(
    sh,
    `# Amazon buyer session\nexport AMAZON_COOKIE='${safe}'\nexport AMAZON_COOKIES='${safe}'\nexport AMAZON_DOMAIN=www.amazon.com\n`,
    { mode: 0o600 },
  );
  await writeFile(
    bat,
    `@echo off\nset "AMAZON_COOKIE=${header}"\nset "AMAZON_COOKIES=${header}"\nset "AMAZON_DOMAIN=www.amazon.com"\n`,
  );
  const names = header.split(/;\s*/).map((p) => p.split("=")[0]).filter(Boolean);
  await writeFile(
    meta,
    JSON.stringify(
      {
        imported_at: new Date().toISOString(),
        cookie_count: names.length,
        cookie_names: names,
        source: opts.file || "header",
      },
      null,
      2,
    ),
  );
  process.env.AMAZON_COOKIE = header;
  process.env.AMAZON_COOKIES = header;
  return envelope("auth-import", "write-safe", {
    imported: true,
    cookieCount: names.length,
    cookieNames: names,
    authFile: sh,
  });
}

export async function wishlistList(opts: { url?: string; fixture?: string } = {}): Promise<CommandEnvelope> {
  let html: string;
  if (opts.fixture) {
    html = await readFileAsync(opts.fixture, "utf8");
  } else {
    const url = opts.url || "https://www.amazon.com/hz/wishlist/ls";
    const res = await executeAmazonGet(url);
    if (res.status >= 300 && res.status < 400) {
      return envelope(
        "wishlist-list",
        "read",
        { redirected: true, status: res.status },
        { ok: false, warnings: ["session redirect — re-login Brave CDP or re-import AMAZON_COOKIE"] },
      );
    }
    html = res.text;
  }
  const page = parseWishlistHtml(html);
  return envelope("wishlist-list", "read", page);
}

export async function wishlistAdd(opts: {
  asin?: string;
  title?: string;
  author?: string;
  listName?: string;
  execute?: boolean;
}): Promise<CommandEnvelope> {
  const query = opts.asin ? undefined : [opts.title, opts.author].filter(Boolean).join(" ");
  if (!opts.asin && !query) throw new Error("asin or title required");
  const plan = await browserWishlistAdd({
    asin: opts.asin,
    query,
    listName: opts.listName,
    execute: Boolean(opts.execute),
  });
  return envelope("wishlist-add", "write-mutate", plan);
}

function wishlistToRefs(
  items: Array<{ title: string | null; author: string | null; asin: string | null }>,
): BookRef[] {
  return items.map((it) => ({
    key: bookKey(it.title, it.author, it.asin),
    title: it.title,
    author: it.author,
    asin: it.asin,
    source: "amazon-wishlist" as const,
  }));
}

export async function kindleSendPlan(
  opts: KindleSendOptions & { via?: "email" | "web" | "browser" },
): Promise<CommandEnvelope> {
  const via = opts.via || (opts.kindleEmail || process.env.KINDLE_EMAIL ? "email" : "web");
  if (via === "browser") {
    const result = await browserSendToKindle({ files: opts.files, execute: false });
    return envelope("kindle-send-plan", "read", result);
  }
  if (via === "web") {
    const plan = await planWebUpload({ files: opts.files, execute: false, dryRun: true });
    return envelope("kindle-send-plan", "read", { via, ...plan });
  }
  const plan = await planKindleSend(opts);
  return envelope("kindle-send-plan", "read", { via, ...plan }, { warnings: plan.blockers });
}

export async function kindleSend(
  opts: KindleSendOptions & { via?: "email" | "web" | "browser"; archive?: boolean },
): Promise<CommandEnvelope> {
  const via = opts.via || "web";
  if (via === "browser") {
    if (!opts.execute) {
      const plan = await browserSendToKindle({ files: opts.files, execute: false, archive: opts.archive });
      return envelope("kindle-send", "write-mutate", plan);
    }
    emitLiveMutationWarning("Send-to-Kindle BROWSER upload");
    const result = await browserSendToKindle({ files: opts.files, execute: true, archive: opts.archive });
    return envelope("kindle-send", "write-mutate", result);
  }
  if (via === "web") {
    const plan = await planWebUpload({
      files: opts.files,
      execute: opts.execute,
      dryRun: opts.dryRun,
      archive: opts.archive,
    });
    if (plan.dryRun || !opts.execute) {
      return envelope("kindle-send", "write-mutate", { submitted: false, via, plan });
    }
    emitLiveMutationWarning("Send-to-Kindle WEB upload");
    const result = await executeWebUpload({ files: opts.files, execute: true, archive: opts.archive });
    return envelope("kindle-send", "write-mutate", { via, ...result });
  }
  const plan = await planKindleSend(opts);
  if (plan.dryRun || !opts.execute) {
    return envelope("kindle-send", "write-mutate", { submitted: false, via, plan }, { warnings: plan.blockers });
  }
  emitLiveMutationWarning("SMTP Send-to-Kindle");
  const result = await executeKindleSend({ ...opts, execute: true });
  return envelope("kindle-send", "write-mutate", { via, ...result });
}

export async function kindleRecent(): Promise<CommandEnvelope> {
  const data = await recentDocs();
  return envelope("kindle-recent", "read", data);
}

export async function contentDevices(): Promise<CommandEnvelope> {
  const url = "https://www.amazon.com/hz/mycd/digital-console/contentlist/booksAll/dateDsc/";
  const res = await executeAmazonGet(url);
  const signedOut =
    /sign in/i.test(res.bodyPreview || "") && res.status === 200 && res.byteLength < 50_000;
  return envelope("content-devices", "read", {
    status: res.status,
    byteLength: res.byteLength,
    signedOutHint: signedOut,
    url,
    note: "HTML shape varies; prefer Manage Your Content for Send-to-Kindle address discovery.",
  });
}

export async function goodreadsSyncPlan(
  opts: {
    wishlistUrl?: string;
    fixture?: string;
    userId?: string;
    direction?: "amazon-to-goodreads" | "goodreads-to-amazon" | "both";
  } = {},
): Promise<CommandEnvelope> {
  const direction = opts.direction || "both";
  const wl = await wishlistList({ url: opts.wishlistUrl, fixture: opts.fixture });
  const amazonItems =
    (wl.data as { items?: Array<{ title: string | null; author: string | null; asin: string | null }> })
      .items || [];
  const amazonRefs = wishlistToRefs(amazonItems);
  const grRefs = await fetchGoodreadsShelfRss(goodreadsUserId(opts.userId), "to-read");
  const parity = computeParity("amazon-wishlist", amazonRefs, "goodreads:to-read", grRefs);

  const toGoodreads = parity.onlyLeft.map((b) => ({
    ...b,
    action: {
      tool: "goodreads_shelf_add",
      shelf: "to-read",
      execute: false,
      resolve: "searchGoodreadsBookId then shelves add --book-id --execute",
    },
  }));
  const toAmazon = parity.onlyRight.map((b) => ({
    ...b,
    action: {
      path: "amazon wishlist add (search → Add to List)",
      note: "ASIN preferred when known",
      execute: false,
    },
  }));

  return envelope("goodreads-sync-plan", "read", {
    direction,
    parity: parity.summary,
    toGoodreads: direction === "goodreads-to-amazon" ? [] : toGoodreads,
    toAmazon: direction === "amazon-to-goodreads" ? [] : toAmazon,
    sampleOverlap: parity.both.slice(0, 5),
    note: "Dry-run plan. Use `parity` for full lists.",
  });
}

export async function parityCheck(
  opts: { userId?: string; shelf?: string; wishlistUrl?: string; fixture?: string } = {},
): Promise<CommandEnvelope> {
  const wl = await wishlistList({ url: opts.wishlistUrl, fixture: opts.fixture });
  const amazonItems =
    (wl.data as { items?: Array<{ title: string | null; author: string | null; asin: string | null }> })
      .items || [];
  const amazonRefs = wishlistToRefs(amazonItems);
  const grRefs = await fetchGoodreadsShelfRss(goodreadsUserId(opts.userId), opts.shelf || "to-read");
  const report = computeParity("amazon-wishlist", amazonRefs, `goodreads:${opts.shelf || "to-read"}`, grRefs);
  return envelope("parity", "read", {
    ...report,
    onlyLeft: report.onlyLeft.slice(0, 200),
    onlyRight: report.onlyRight.slice(0, 200),
    both: report.both.slice(0, 100),
    truncated: {
      onlyLeft: Math.max(0, report.onlyLeft.length - 200),
      onlyRight: Math.max(0, report.onlyRight.length - 200),
      both: Math.max(0, report.both.length - 100),
    },
  });
}

export async function booksResolve(opts: {
  title?: string;
  author?: string;
  asin?: string;
  text?: string;
}): Promise<CommandEnvelope> {
  let title = opts.title || null;
  let author = opts.author || null;
  if (opts.text && !title) {
    const lines = opts.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    title = lines[0] || null;
    const by = opts.text.match(/\bby\s+([A-Z][\w.'\-]+(?:\s+[A-Z][\w.'\-]+){0,3})/);
    if (by) author = by[1];
  }
  const asin = opts.asin || null;
  const amazonUrl = asin
    ? `https://www.amazon.com/dp/${asin}`
    : title
      ? `https://www.amazon.com/s?k=${encodeURIComponent([title, author].filter(Boolean).join(" "))}`
      : null;
  let goodreadsId: string | null = null;
  if (title) {
    try {
      goodreadsId = await searchGoodreadsBookId(title, author);
    } catch {
      goodreadsId = null;
    }
  }
  const ref: BookRef = {
    key: bookKey(title, author, asin),
    title,
    author,
    asin,
    goodreadsId,
    source: opts.text ? "photo" : "manual",
  };
  return envelope("photo-resolve", "read", {
    book: ref,
    amazonUrl,
    actions: {
      goodreads: goodreadsId
        ? { tool: "goodreads_shelf_add", args: { bookId: goodreadsId, shelf: "to-read", execute: false } }
        : { tool: "goodreads_shelf_add", resolve: "search first", execute: false },
      amazonWishlist: {
        path: amazonUrl,
        note: "Open ASIN/search → Add to List (Want to Read / Shopping List)",
      },
      kindle: { note: "If you have an EPUB/PDF: kindle send --via web --execute" },
    },
  });
}

export async function addPlan(opts: {
  title?: string;
  author?: string;
  asin?: string;
  text?: string;
  targets?: Array<"goodreads" | "amazon" | "kindle">;
}): Promise<CommandEnvelope> {
  const resolved = await booksResolve(opts);
  const targets = opts.targets || ["goodreads", "amazon"];
  return envelope("add-plan", "read", {
    ...(resolved.data as object),
    targets,
    executeGates: {
      goodreads: "goodreads-cli shelves add --book-id <id> --name to-read --execute",
      amazon: "Browser wishlist add until POST add-to-list is mapped",
      kindle: "amazon-kindle-cli kindle send <file> --via web --execute",
    },
  });
}
