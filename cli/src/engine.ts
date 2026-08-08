import { envelope, type CommandEnvelope } from "./lib.js";
import { executeAmazonGet } from "./client/live.js";
import {
  executeKindleSend,
  planKindleSend,
  type KindleSendOptions,
} from "./client/kindleSend.js";
import {
  executeWebUpload,
  planWebUpload,
  recentDocs,
} from "./client/kindleWebUpload.js";
import {
  executeWishlistHttpAdd,
  planWishlistHttpAdd,
} from "./client/wishlistHttp.js";
import {
  contentListHttp,
  type ContentKind,
} from "./client/kindleContentHttp.js";
import { wishlistListHttp } from "./client/wishlistListHttp.js";
import {
  resolveAmazonSearchHttp,
  resolveWishlistTargetHttp,
} from "./client/wishlistResolveHttp.js";
import { emitLiveMutationWarning } from "./risk.js";
import { bookKey, computeParity, type BookRef } from "./parity.js";
import {
  fetchGoodreadsShelfRss,
  searchGoodreadsBookId,
} from "./client/goodreadsBridge.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CAPABILITIES = [
  {
    key: "doctor",
    cli: "doctor",
    mcpTool: "amazon_kindle_doctor",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "auth-status",
    cli: "auth status",
    mcpTool: "amazon_kindle_auth_status",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "auth-verify",
    cli: "auth verify",
    mcpTool: "amazon_kindle_auth_verify",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "auth-import",
    cli: "auth import",
    mcpTool: "amazon_kindle_auth_import",
    readOnly: false,
    risk: "write-safe" as const,
  },
  {
    key: "wishlist-list",
    cli: "wishlist list",
    mcpTool: "amazon_kindle_wishlist_list",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "wishlist-add",
    cli: "wishlist add",
    mcpTool: "amazon_kindle_wishlist_add",
    readOnly: false,
    risk: "write-mutate" as const,
  },
  {
    key: "kindle-send",
    cli: "kindle send",
    mcpTool: "amazon_kindle_send",
    readOnly: false,
    risk: "write-mutate" as const,
  },
  {
    key: "kindle-send-plan",
    cli: "kindle send --dry-run",
    mcpTool: "amazon_kindle_send_plan",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "kindle-recent",
    cli: "kindle recent",
    mcpTool: "amazon_kindle_recent_docs",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "content-devices",
    cli: "content devices",
    mcpTool: "amazon_kindle_content_devices",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "kindle-books",
    cli: "kindle books",
    mcpTool: "amazon_kindle_books",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "kindle-pdocs",
    cli: "kindle pdocs",
    mcpTool: "amazon_kindle_pdocs",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "goodreads-sync-plan",
    cli: "sync goodreads-plan",
    mcpTool: "amazon_kindle_goodreads_sync_plan",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "parity",
    cli: "parity",
    mcpTool: "amazon_kindle_parity",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "photo-resolve",
    cli: "books resolve",
    mcpTool: "amazon_kindle_books_resolve",
    readOnly: true,
    risk: "read" as const,
  },
  {
    key: "add-plan",
    cli: "add-plan",
    mcpTool: "amazon_kindle_add_plan",
    readOnly: true,
    risk: "read" as const,
  },
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
  const kindleEmail = Boolean(
    process.env.KINDLE_EMAIL || process.env.KINDLE_SEND_ADDRESS,
  );
  const smtp = Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    (process.env.SMTP_PASS || process.env.SMTP_PASSWORD),
  );
  const cfg = loadLocalConfig();
  let live: unknown = null;
  if (cookie) {
    try {
      const r = await executeAmazonGet(
        "https://www.amazon.com/gp/css/homepage.html",
      );
      live = {
        status: r.status,
        signedInHint:
          /Hello,\s*[^<]+/i.test(r.text) ||
          /nav-link-accountList/i.test(r.text),
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
      "All product paths are HTTP/scriptable. Browser is auth-capture only, not runtime.",
      "Wishlist list: GET ls + paginate GET /hz/wishlist/slv/items?paginationToken=…",
      "Wishlist add: GET /dp/{ASIN} CSRF → POST /hz/wishlist/additemtolist",
      "Kindle send default: web upload. Parity via wishlist HTTP + Goodreads RSS.",
    ],
  });
}

export async function authStatus(): Promise<CommandEnvelope> {
  const cookie = process.env.AMAZON_COOKIE || process.env.AMAZON_COOKIES || "";
  const names = cookie
    ? cookie
        .split(/;\s*/)
        .map((p) => p.split("=")[0])
        .filter(Boolean)
    : [];
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

type AuthVerifyProbes = {
  wishlist: () => Promise<unknown>;
  kindle: () => Promise<{ status?: number; docs?: unknown }>;
};

export async function authVerify(
  opts: { listId?: string } = {},
  probes: AuthVerifyProbes = {
    wishlist: () => wishlistListHttp({ listId: opts.listId, maxPages: 1 }),
    kindle: () => recentDocs(),
  },
): Promise<CommandEnvelope> {
  const cookie = process.env.AMAZON_COOKIE || process.env.AMAZON_COOKIES || "";
  const results = await Promise.allSettled([
    probes.wishlist(),
    probes.kindle(),
  ]);
  const retailReadable = results[0].status === "fulfilled";
  const retailSessionMode =
    results[0].status === "fulfilled" &&
    typeof results[0].value === "object" &&
    results[0].value !== null &&
    "sessionMode" in results[0].value
      ? String((results[0].value as { sessionMode?: unknown }).sessionMode)
      : "authenticated";
  const retailAuthenticated = retailReadable && retailSessionMode !== "public";
  const kindleAuthenticated =
    results[1].status === "fulfilled" &&
    (results[1].value.status === undefined ||
      (results[1].value.status >= 200 && results[1].value.status < 300));
  const reason = (r: PromiseSettledResult<unknown>): string | null =>
    r.status === "rejected"
      ? r.reason instanceof Error
        ? r.reason.message
        : String(r.reason)
      : null;
  const ok = Boolean(cookie) && retailAuthenticated && kindleAuthenticated;

  return envelope(
    "auth-verify",
    "read",
    {
      persistedSessionPresent: Boolean(cookie),
      readReady: retailReadable && kindleAuthenticated,
      retailReadable,
      retailAuthenticated,
      retailWriteReady: retailAuthenticated,
      retailSessionMode,
      kindleAuthenticated,
      refreshRequired: !ok,
      retailError: reason(results[0]),
      kindleError: reason(results[1]),
      recovery: ok
        ? null
        : retailReadable && kindleAuthenticated
          ? "Public wishlist reads and Kindle are ready. Refresh recent Amazon retail authentication before wishlist mutations."
          : "Refresh ~/.amazon/auth.sh from the authenticated browser or run auth import, then retry auth verify.",
    },
    {
      ok,
      warnings: ok
        ? []
        : retailReadable && kindleAuthenticated
          ? [
              "Read paths are ready; wishlist writes require recent Amazon retail authentication",
            ]
          : ["One or more Amazon HTTP read surfaces are unavailable"],
    },
  );
}

export async function authImport(opts: {
  file?: string;
  header?: string;
}): Promise<CommandEnvelope> {
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
        if (!Array.isArray(arr))
          throw new Error("JSON must be cookies array or {cookies}");
        const amazon = arr.filter(
          (c: { domain?: string }) =>
            !c.domain || String(c.domain).includes("amazon"),
        );
        header = amazon
          .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
          .join("; ");
      }
    } else if (trimmed.includes("\t")) {
      const parts: string[] = [];
      for (const line of trimmed.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const cols = line.split("\t");
        if (cols.length >= 7 && cols[0].includes("amazon"))
          parts.push(`${cols[5]}=${cols[6]}`);
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
  const names = header
    .split(/;\s*/)
    .map((p) => p.split("=")[0])
    .filter(Boolean);
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

export async function wishlistList(
  opts: {
    url?: string;
    listId?: string;
    fixture?: string;
    maxPages?: number;
    limit?: number;
  } = {},
): Promise<CommandEnvelope> {
  try {
    const result = await wishlistListHttp({
      url: opts.url,
      listId: opts.listId,
      fixture: opts.fixture,
      maxPages: opts.maxPages,
      limit: opts.limit,
    });
    return envelope("wishlist-list", "read", result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return envelope(
      "wishlist-list",
      "read",
      { error: msg },
      {
        ok: false,
        warnings: [
          msg.includes("redirect")
            ? "session redirect — re-import AMAZON_COOKIE via auth import"
            : msg,
        ],
      },
    );
  }
}

export async function wishlistAdd(opts: {
  asin?: string;
  title?: string;
  author?: string;
  listName?: string;
  listId?: string;
  execute?: boolean;
}): Promise<CommandEnvelope> {
  let asin = opts.asin?.trim().toUpperCase() || undefined;
  let resolvedFromSearch: unknown = undefined;
  if (!asin) {
    const query = [opts.title, opts.author].filter(Boolean).join(" ").trim();
    if (!query) throw new Error("asin or title required for HTTP wishlist add");
    const candidates = await resolveAmazonSearchHttp(query);
    if (!candidates.length)
      throw new Error(
        `no Amazon product candidates found for ${JSON.stringify(query)}`,
      );
    // Retains legacy helper semantics (first Amazon search result), but returns the exact selection.
    asin = candidates[0].asin;
    resolvedFromSearch = { query, selected: candidates[0], candidates };
  }

  let listId = opts.listId || process.env.AMAZON_WISHLIST_ID || undefined;
  let resolvedList: unknown = undefined;
  if (opts.listName && !opts.listId) {
    const target = await resolveWishlistTargetHttp(opts.listName);
    listId = target.id;
    resolvedList = target;
  }

  if (!opts.execute) {
    const plan = await planWishlistHttpAdd({
      asin,
      listId,
      execute: false,
      dryRun: true,
    });
    return envelope("wishlist-add", "write-mutate", {
      submitted: false,
      via: "http",
      plan,
      ...(resolvedFromSearch ? { resolvedFromSearch } : {}),
      ...(resolvedList ? { resolvedList } : {}),
    });
  }
  emitLiveMutationWarning(
    "Amazon wishlist HTTP add (POST /hz/wishlist/additemtolist)",
  );
  const result = await executeWishlistHttpAdd({ asin, listId, execute: true });
  return envelope("wishlist-add", "write-mutate", {
    ...result,
    ...(resolvedFromSearch ? { resolvedFromSearch } : {}),
    ...(resolvedList ? { resolvedList } : {}),
  });
}

function wishlistToRefs(
  items: Array<{
    title: string | null;
    author: string | null;
    asin: string | null;
  }>,
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
  opts: KindleSendOptions & { via?: "email" | "web" },
): Promise<CommandEnvelope> {
  const via =
    opts.via ||
    (opts.kindleEmail || process.env.KINDLE_EMAIL ? "email" : "web");
  if (via === "web") {
    const plan = await planWebUpload({
      files: opts.files,
      execute: false,
      dryRun: true,
    });
    return envelope("kindle-send-plan", "read", { via, ...plan });
  }
  const plan = await planKindleSend(opts);
  return envelope(
    "kindle-send-plan",
    "read",
    { via, ...plan },
    { warnings: plan.blockers },
  );
}

export async function kindleSend(
  opts: KindleSendOptions & { via?: "email" | "web"; archive?: boolean },
): Promise<CommandEnvelope> {
  const via = opts.via || "web";
  if (via === "web") {
    const plan = await planWebUpload({
      files: opts.files,
      execute: opts.execute,
      dryRun: opts.dryRun,
      archive: opts.archive,
    });
    if (plan.dryRun || !opts.execute) {
      return envelope("kindle-send", "write-mutate", {
        submitted: false,
        via,
        plan,
      });
    }
    emitLiveMutationWarning("Send-to-Kindle WEB upload");
    const result = await executeWebUpload({
      files: opts.files,
      execute: true,
      archive: opts.archive,
    });
    return envelope("kindle-send", "write-mutate", { via, ...result });
  }
  const plan = await planKindleSend(opts);
  if (plan.dryRun || !opts.execute) {
    return envelope(
      "kindle-send",
      "write-mutate",
      { submitted: false, via, plan },
      { warnings: plan.blockers },
    );
  }
  emitLiveMutationWarning("SMTP Send-to-Kindle");
  const result = await executeKindleSend({ ...opts, execute: true });
  return envelope("kindle-send", "write-mutate", { via, ...result });
}

export async function kindleRecent(
  opts: { limit?: number } = {},
): Promise<CommandEnvelope> {
  const data = await recentDocs(opts.limit);
  return envelope("kindle-recent", "read", data);
}

export async function contentDevices(): Promise<CommandEnvelope> {
  const url =
    "https://www.amazon.com/hz/mycd/digital-console/contentlist/booksAll/dateDsc/";
  const res = await executeAmazonGet(url);
  const signedOut =
    /sign in/i.test(res.bodyPreview || "") &&
    res.status === 200 &&
    res.byteLength < 50_000;
  return envelope("content-devices", "read", {
    status: res.status,
    byteLength: res.byteLength,
    signedOutHint: signedOut,
    url,
    note: "HTML shape varies; prefer Manage Your Content for Send-to-Kindle address discovery.",
  });
}

async function kindleContent(
  kind: ContentKind,
  opts: { limit?: number; fixture?: string } = {},
): Promise<CommandEnvelope> {
  const data = await contentListHttp({
    type: kind,
    limit: opts.limit,
    fixture: opts.fixture,
  });
  return envelope(
    kind === "books" ? "kindle-books" : "kindle-pdocs",
    "read",
    data,
  );
}

/** Purchased Kindle Ebook inventory; distinct from recent Send-to-Kindle receipts. */
export async function kindleBooks(
  opts: { limit?: number; fixture?: string } = {},
): Promise<CommandEnvelope> {
  return kindleContent("books", opts);
}

/** Personal Document inventory metadata only; never document bytes or download/action URLs. */
export async function kindlePdocs(
  opts: { limit?: number; fixture?: string } = {},
): Promise<CommandEnvelope> {
  return kindleContent("pdocs", opts);
}

export async function goodreadsSyncPlan(
  opts: {
    wishlistUrl?: string;
    listId?: string;
    fixture?: string;
    userId?: string;
    direction?: "amazon-to-goodreads" | "goodreads-to-amazon" | "both";
  } = {},
): Promise<CommandEnvelope> {
  const direction = opts.direction || "both";
  const wl = await wishlistList({
    url: opts.wishlistUrl,
    listId: opts.listId,
    fixture: opts.fixture,
  });
  if (!wl.ok)
    throw new Error(`wishlist read failed: ${JSON.stringify(wl.data)}`);
  const amazonItems =
    (
      wl.data as {
        items?: Array<{
          title: string | null;
          author: string | null;
          asin: string | null;
        }>;
      }
    ).items || [];
  const amazonRefs = wishlistToRefs(amazonItems);
  const grRefs = await fetchGoodreadsShelfRss(
    goodreadsUserId(opts.userId),
    "to-read",
  );
  const parity = computeParity(
    "amazon-wishlist",
    amazonRefs,
    "goodreads:to-read",
    grRefs,
  );

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
  opts: {
    userId?: string;
    shelf?: string;
    wishlistUrl?: string;
    listId?: string;
    fixture?: string;
  } = {},
): Promise<CommandEnvelope> {
  const wl = await wishlistList({
    url: opts.wishlistUrl,
    listId: opts.listId,
    fixture: opts.fixture,
  });
  if (!wl.ok)
    throw new Error(`wishlist read failed: ${JSON.stringify(wl.data)}`);
  const amazonItems =
    (
      wl.data as {
        items?: Array<{
          title: string | null;
          author: string | null;
          asin: string | null;
        }>;
      }
    ).items || [];
  const amazonRefs = wishlistToRefs(amazonItems);
  const grRefs = await fetchGoodreadsShelfRss(
    goodreadsUserId(opts.userId),
    opts.shelf || "to-read",
  );
  const report = computeParity(
    "amazon-wishlist",
    amazonRefs,
    `goodreads:${opts.shelf || "to-read"}`,
    grRefs,
  );
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
    const by = opts.text.match(
      /\bby\s+([A-Z][\w.'\-]+(?:\s+[A-Z][\w.'\-]+){0,3})/,
    );
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
        ? {
            tool: "goodreads_shelf_add",
            args: { bookId: goodreadsId, shelf: "to-read", execute: false },
          }
        : {
            tool: "goodreads_shelf_add",
            resolve: "search first",
            execute: false,
          },
      amazonWishlist: {
        path: amazonUrl,
        note: "HTTP: books resolve → wishlist add --asin <ASIN> --execute; title input uses HTTP /s resolution.",
      },
      kindle: {
        note: "If you have an EPUB/PDF: kindle send --via web --execute",
      },
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
      goodreads:
        "goodreads-cli shelves add --book-id <id> --name to-read --execute",
      amazon:
        "amazon-kindle-cli wishlist add --asin <ASIN> --execute (or title/author → HTTP search resolution)",
      kindle: "amazon-kindle-cli kindle send <file> --via web --execute",
    },
  });
}
