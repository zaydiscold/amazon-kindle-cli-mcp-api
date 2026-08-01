/**
 * Amazon wishlist list via pure HTTP.
 *
 * 1. GET /hz/wishlist/ls/{listId}?sort=date-added&viewType=list
 * 2. Parse items + showMoreUrl (paginationToken)
 * 3. GET /hz/wishlist/slv/items?filter=…&paginationToken=… until exhausted
 *
 * No browser scroll. Requires AMAZON_COOKIE.
 */
import { cookieHeader, executeAmazonGet } from "./live.js";
import { parseWishlistHtml, type WishlistItem, type WishlistPage } from "../parsers/wishlist.js";

const UA = "amazon-kindle-cli/0.3.0 (+wishlist-list-http)";

export interface WishlistListHttpOptions {
  /** Full list URL or id. Default AMAZON_WISHLIST_ID or /hz/wishlist/ls */
  url?: string;
  listId?: string;
  /** Max pagination hops (safety). Default 40. */
  maxPages?: number;
  fixture?: string;
}

function requireCookie(): string {
  const c = cookieHeader();
  if (!c) throw new Error("AMAZON_COOKIE required for wishlist list");
  return c;
}

function resolveListUrl(opts: WishlistListHttpOptions): string {
  if (opts.url) return opts.url;
  const id = opts.listId || process.env.AMAZON_WISHLIST_ID;
  if (id) {
    return `https://www.amazon.com/hz/wishlist/ls/${id}?sort=date-added&viewType=list`;
  }
  return "https://www.amazon.com/hz/wishlist/ls?sort=date-added&viewType=list";
}

/** Pull showMoreUrl / paginationToken from list HTML or JSON fragment. */
export function extractShowMoreUrl(html: string): string | null {
  const patterns = [
    /"showMoreUrl"\s*:\s*"([^"]+)"/i,
    /name="showMoreUrl"\s+value="([^"]+)"/i,
    /href="(\/hz\/wishlist\/slv\/items\?[^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      let u = m[1]
        .replace(/&amp;/g, "&")
        .replace(/\\\//g, "/")
        .replace(/\\u0026/g, "&");
      if (u.startsWith("/")) u = `https://www.amazon.com${u}`;
      return u;
    }
  }
  return null;
}

async function getHtml(url: string): Promise<{ status: number; text: string }> {
  requireCookie();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      cookie: requireCookie(),
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "x-requested-with": "XMLHttpRequest",
      referer: "https://www.amazon.com/hz/wishlist/ls",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  return { status: res.status, text };
}

function mergeItems(into: WishlistItem[], page: WishlistItem[]): number {
  const seen = new Set(into.map((i) => i.asin || i.title || "").filter(Boolean));
  let added = 0;
  for (const it of page) {
    const k = it.asin || it.title || "";
    if (!k || seen.has(k)) continue;
    seen.add(k);
    into.push(it);
    added += 1;
  }
  return added;
}

export async function executeWishlistListHttp(opts: WishlistListHttpOptions = {}): Promise<{
  listName: string | null;
  listUrl: string;
  items: WishlistItem[];
  pagesFetched: number;
  via: "http";
  truncated: boolean;
}> {
  if (opts.fixture) {
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(opts.fixture, "utf8");
    const page = parseWishlistHtml(html);
    return {
      listName: page.listName,
      listUrl: opts.fixture,
      items: page.items,
      pagesFetched: 1,
      via: "http",
      truncated: false,
    };
  }

  const listUrl = resolveListUrl(opts);
  const maxPages = opts.maxPages ?? 40;
  const first = await getHtml(listUrl);
  if (first.status >= 300 && first.status < 400) {
    throw new Error(`wishlist list redirect ${first.status} — refresh AMAZON_COOKIE`);
  }

  const items: WishlistItem[] = [];
  let page = parseWishlistHtml(first.text, listUrl);
  mergeItems(items, page.items);
  let listName = page.listName;
  let next = page.showMoreUrl || extractShowMoreUrl(first.text) || page.nextPageUrl;
  let pagesFetched = 1;
  let truncated = false;

  while (next && pagesFetched < maxPages) {
    const more = await getHtml(next);
    if (more.status >= 300 && more.status < 400) break;
    // slv/items may return HTML fragment or JSON-wrapped HTML
    let html = more.text;
    try {
      const j = JSON.parse(more.text) as { html?: string; itemsHtml?: string; showMoreUrl?: string };
      if (j.html || j.itemsHtml) html = String(j.html || j.itemsHtml);
      if (j.showMoreUrl) {
        next = j.showMoreUrl.startsWith("http")
          ? j.showMoreUrl
          : `https://www.amazon.com${j.showMoreUrl}`;
      }
    } catch {
      /* plain html fragment */
    }
    const frag = parseWishlistHtml(html, listUrl);
    if (!listName && frag.listName) listName = frag.listName;
    const added = mergeItems(items, frag.items);
    pagesFetched += 1;
    const following = extractShowMoreUrl(html) || frag.nextPageUrl;
    if (!following || added === 0) {
      next = following && added > 0 ? following : null;
      if (following && added === 0) break;
    } else {
      next = following;
    }
  }
  if (next && pagesFetched >= maxPages) truncated = true;

  return {
    listName,
    listUrl,
    items,
    pagesFetched,
    via: "http",
    truncated,
  };
}

/** Thin wrapper used by engine when fixture-less. */
export async function wishlistListHttp(opts: WishlistListHttpOptions = {}) {
  return executeWishlistListHttp(opts);
}
