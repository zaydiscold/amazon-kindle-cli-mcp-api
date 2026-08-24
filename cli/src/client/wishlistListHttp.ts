/**
 * Amazon wishlist list via pure HTTP.
 *
 * 1. GET /hz/wishlist/ls/{listId}?sort=date-added&viewType=list
 * 2. Parse items + showMoreUrl (paginationToken)
 * 3. GET /hz/wishlist/slv/items?filter=…&paginationToken=… until exhausted
 *
 * No browser scroll. Authenticated and public lists are both supported.
 */
import { readFile, stat } from "node:fs/promises";
import { cookieHeader, readBoundedText } from "./live.js";
import { amazonNavigateHeaders } from "./httpHeaders.js";
import { assertTrustedAmazonUrl, TRUSTED_AMAZON_ORIGIN } from "./trustedAmazon.js";
import { parseWishlistHtml, type WishlistItem } from "../parsers/wishlist.js";

const MAX_FIXTURE_BYTES = 8 * 1024 * 1024;

export interface WishlistListHttpOptions {
  /** Full amazon.com list URL or id. Default AMAZON_WISHLIST_ID or /hz/wishlist/ls */
  url?: string;
  listId?: string;
  /** Max pagination hops (safety). Default 40, maximum 100. */
  maxPages?: number;
  /** Max items to return (applied client-side). Undefined = no limit. */
  limit?: number;
  fixture?: string;
}

function validateOptions(opts: WishlistListHttpOptions): void {
  if (opts.maxPages !== undefined && (!Number.isInteger(opts.maxPages) || opts.maxPages < 1 || opts.maxPages > 100)) {
    throw new Error("maxPages must be an integer from 1 through 100");
  }
  if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 5_000)) {
    throw new Error("limit must be an integer from 1 through 5000");
  }
}

function resolveListUrl(opts: WishlistListHttpOptions): string {
  if (opts.url) return assertTrustedAmazonUrl(opts.url).toString();
  const id = opts.listId || process.env.AMAZON_WISHLIST_ID;
  if (id) {
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) throw new Error("invalid Amazon wishlist id");
    return `${TRUSTED_AMAZON_ORIGIN}/hz/wishlist/ls/${encodeURIComponent(id)}?sort=date-added&viewType=list`;
  }
  return `${TRUSTED_AMAZON_ORIGIN}/hz/wishlist/ls?sort=date-added&viewType=list`;
}

function normalizePaginationUrl(value: string, base: string): string {
  return assertTrustedAmazonUrl(new URL(value, base).toString()).toString();
}

/** Pull showMoreUrl / paginationToken from list HTML or JSON fragment. */
export function extractShowMoreUrl(html: string, base = TRUSTED_AMAZON_ORIGIN): string | null {
  const patterns = [
    /"showMoreUrl"\s*:\s*"([^"]+)"/i,
    /name="showMoreUrl"\s+value="([^"]+)"/i,
    /href="(\/hz\/wishlist\/slv\/items\?[^"]+)"/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (!match?.[1]) continue;
    const raw = match[1]
      .replace(/&amp;/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\u0026/g, "&");
    return normalizePaginationUrl(raw, base);
  }
  return null;
}

async function getHtml(
  value: string,
  withCookie: boolean,
): Promise<{ status: number; text: string; location: string | null }> {
  const url = assertTrustedAmazonUrl(value);
  const cookie = withCookie ? cookieHeader() || "" : "";
  const headers = amazonNavigateHeaders(cookie, `${TRUSTED_AMAZON_ORIGIN}/hz/wishlist/ls`);
  if (!cookie) delete headers.cookie;
  const res = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });
  const location = res.headers.get("location");
  if (location && res.status >= 300 && res.status < 400) {
    const redirect = new URL(location, url);
    if (redirect.origin !== TRUSTED_AMAZON_ORIGIN) {
      throw new Error(`wishlist returned a cross-origin redirect to ${redirect.origin}`);
    }
  }
  return { status: res.status, text: await readBoundedText(res), location };
}

function isSignInRedirect(result: { status: number; location: string | null }): boolean {
  return result.status >= 300 && result.status < 400 && /\/ap\/signin/i.test(result.location || "");
}

function mergeItems(into: WishlistItem[], page: WishlistItem[]): number {
  const seen = new Set(into.map((item) => item.asin || item.title || "").filter(Boolean));
  let added = 0;
  for (const item of page) {
    const key = item.asin || item.title || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    into.push(item);
    added += 1;
  }
  return added;
}

async function readFixture(path: string): Promise<string> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error("wishlist fixture must be a file");
  if (info.size > MAX_FIXTURE_BYTES) throw new Error(`wishlist fixture exceeded ${MAX_FIXTURE_BYTES} bytes`);
  return readFile(path, "utf8");
}

export async function executeWishlistListHttp(
  opts: WishlistListHttpOptions = {},
): Promise<{
  listName: string | null;
  listUrl: string;
  items: WishlistItem[];
  pagesFetched: number;
  via: "http";
  sessionMode: "authenticated" | "public";
  truncated: boolean;
  terminationReason: "complete" | "item-cap" | "page-cap" | "repeated-page";
}> {
  validateOptions(opts);
  if (opts.fixture) {
    const page = parseWishlistHtml(await readFixture(opts.fixture));
    const items = opts.limit === undefined ? page.items : page.items.slice(0, opts.limit);
    return {
      listName: page.listName,
      listUrl: "<fixture>",
      items,
      pagesFetched: 1,
      via: "http",
      sessionMode: "public",
      truncated: items.length < page.items.length,
      terminationReason: items.length < page.items.length ? "item-cap" : "complete",
    };
  }

  const listUrl = resolveListUrl(opts);
  const maxPages = opts.maxPages ?? 40;
  const limit = opts.limit;
  let withCookie = Boolean(cookieHeader());
  let first = await getHtml(listUrl, withCookie);
  if (withCookie && isSignInRedirect(first)) {
    withCookie = false;
    first = await getHtml(listUrl, false);
  }
  if (first.status >= 300 && first.status < 400) {
    throw new Error(`wishlist list redirect ${first.status}`);
  }
  if (first.status < 200 || first.status >= 300) {
    throw new Error(`wishlist list returned HTTP ${first.status}`);
  }

  const items: WishlistItem[] = [];
  let page = parseWishlistHtml(first.text, listUrl);
  mergeItems(items, page.items);
  let listName = page.listName;
  let next = page.showMoreUrl
    ? normalizePaginationUrl(page.showMoreUrl, listUrl)
    : extractShowMoreUrl(first.text, listUrl) ||
      (page.nextPageUrl ? normalizePaginationUrl(page.nextPageUrl, listUrl) : null);
  let pagesFetched = 1;
  let truncated = false;
  let terminationReason: "complete" | "item-cap" | "page-cap" | "repeated-page" = "complete";
  const seenPages = new Set([listUrl]);

  while (next && pagesFetched < maxPages) {
    if (limit !== undefined && items.length >= limit) {
      truncated = true;
      terminationReason = "item-cap";
      break;
    }
    if (seenPages.has(next)) {
      truncated = true;
      terminationReason = "repeated-page";
      break;
    }
    seenPages.add(next);
    let more = await getHtml(next, withCookie);
    if (withCookie && isSignInRedirect(more)) {
      withCookie = false;
      more = await getHtml(next, false);
    }
    if (more.status >= 300 && more.status < 400) throw new Error(`wishlist pagination redirect ${more.status}`);
    if (more.status < 200 || more.status >= 300) throw new Error(`wishlist pagination returned HTTP ${more.status}`);

    let html = more.text;
    let jsonNext: string | null = null;
    try {
      const json = JSON.parse(more.text) as { html?: string; itemsHtml?: string; showMoreUrl?: string };
      if (json.html || json.itemsHtml) html = String(json.html || json.itemsHtml);
      if (json.showMoreUrl) jsonNext = normalizePaginationUrl(json.showMoreUrl, next);
    } catch {
      // Plain HTML fragment.
    }
    const fragment = parseWishlistHtml(html, listUrl);
    if (!listName && fragment.listName) listName = fragment.listName;
    const added = mergeItems(items, fragment.items);
    pagesFetched += 1;
    const following = jsonNext || extractShowMoreUrl(html, next) ||
      (fragment.nextPageUrl ? normalizePaginationUrl(fragment.nextPageUrl, next) : null);
    if (!following || added === 0) {
      next = null;
      if (following && added === 0) terminationReason = "repeated-page";
    } else {
      next = following;
    }
  }
  if (next && pagesFetched >= maxPages) {
    truncated = true;
    terminationReason = "page-cap";
  }
  if (limit !== undefined && items.length > limit) {
    items.length = limit;
    truncated = true;
    terminationReason = "item-cap";
  }

  return {
    listName,
    listUrl,
    items,
    pagesFetched,
    via: "http",
    sessionMode: withCookie ? "authenticated" : "public",
    truncated,
    terminationReason,
  };
}

export async function wishlistListHttp(opts: WishlistListHttpOptions = {}) {
  return executeWishlistListHttp(opts);
}
