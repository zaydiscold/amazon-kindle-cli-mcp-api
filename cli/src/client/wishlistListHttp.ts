/**
 * Amazon wishlist list via pure HTTP.
 *
 * 1. GET /hz/wishlist/ls/{listId}?sort=date-added&viewType=list
 * 2. Parse items + showMoreUrl (paginationToken)
 * 3. GET /hz/wishlist/slv/items?filter=…&paginationToken=… until exhausted
 *
 * No browser scroll. Requires AMAZON_COOKIE.
 */
import { cookieHeader } from "./live.js";
import { amazonNavigateHeaders } from "./httpHeaders.js";
import { parseWishlistHtml, type WishlistItem } from "../parsers/wishlist.js";

export interface WishlistListHttpOptions {
  /** Full list URL or id. Default AMAZON_WISHLIST_ID or /hz/wishlist/ls */
  url?: string;
  listId?: string;
  /** Max pagination hops (safety). Default 40. */
  maxPages?: number;
  /** Max items to return (applied client-side). Undefined = no limit. */
  limit?: number;
  fixture?: string;
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

async function getHtml(
  url: string,
  withCookie: boolean,
): Promise<{ status: number; text: string; location: string | null }> {
  const cookie = withCookie ? cookieHeader() || "" : "";
  const headers = amazonNavigateHeaders(
    cookie,
    "https://www.amazon.com/hz/wishlist/ls",
  );
  if (!cookie) delete headers.cookie;
  const res = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  return { status: res.status, text, location: res.headers.get("location") };
}

function isSignInRedirect(result: {
  status: number;
  location: string | null;
}): boolean {
  return (
    result.status >= 300 &&
    result.status < 400 &&
    /\/ap\/signin/i.test(result.location || "")
  );
}

function mergeItems(into: WishlistItem[], page: WishlistItem[]): number {
  const seen = new Set(
    into.map((i) => i.asin || i.title || "").filter(Boolean),
  );
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
}> {
  if (opts.fixture) {
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(opts.fixture, "utf8");
    const page = parseWishlistHtml(html);
    const items =
      opts.limit === undefined ? page.items : page.items.slice(0, opts.limit);
    return {
      listName: page.listName,
      listUrl: opts.fixture,
      items,
      pagesFetched: 1,
      via: "http",
      sessionMode: "public",
      truncated: items.length < page.items.length,
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
    throw new Error(
      `wishlist list redirect ${first.status}${first.location ? ` to ${first.location}` : ""}`,
    );
  }

  const items: WishlistItem[] = [];
  let page = parseWishlistHtml(first.text, listUrl);
  mergeItems(items, page.items);
  let listName = page.listName;
  let next =
    page.showMoreUrl || extractShowMoreUrl(first.text) || page.nextPageUrl;
  let pagesFetched = 1;
  let truncated = false;

  while (next && pagesFetched < maxPages) {
    // Check limit during pagination
    if (limit !== undefined && items.length >= limit) {
      truncated = true;
      break;
    }
    let more = await getHtml(next, withCookie);
    if (withCookie && isSignInRedirect(more)) {
      withCookie = false;
      more = await getHtml(next, false);
    }
    if (more.status >= 300 && more.status < 400) {
      throw new Error(
        `wishlist pagination redirect ${more.status}${more.location ? ` to ${more.location}` : ""}`,
      );
    }
    // slv/items may return HTML fragment or JSON-wrapped HTML
    let html = more.text;
    try {
      const j = JSON.parse(more.text) as {
        html?: string;
        itemsHtml?: string;
        showMoreUrl?: string;
      };
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

  // Apply client-side limit on final result
  if (limit !== undefined && limit > 0 && items.length > limit) {
    items.length = limit;
    truncated = true;
  }

  return {
    listName,
    listUrl,
    items,
    pagesFetched,
    via: "http",
    sessionMode: withCookie ? "authenticated" : "public",
    truncated,
  };
}

/** Thin wrapper used by engine when fixture-less. */
export async function wishlistListHttp(opts: WishlistListHttpOptions = {}) {
  return executeWishlistListHttp(opts);
}
