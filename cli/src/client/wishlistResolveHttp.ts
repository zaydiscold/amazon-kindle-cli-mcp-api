/** HTTP equivalents of the legacy wishlist browser helper's discovery steps.
 *
 * - title/author query: GET /s?k=… → product candidates / ASIN
 * - named list: GET /hz/wishlist/ls → list name → listId
 *
 * The caller makes the actual add only after this resolver returns an ASIN/listId.
 */
import * as cheerio from "cheerio";
import { cookieHeader } from "./live.js";
import { amazonNavigateHeaders } from "./httpHeaders.js";

export interface AmazonSearchCandidate {
  asin: string;
  title: string | null;
  author: string | null;
  url: string;
}

export interface AmazonWishlistTarget {
  id: string;
  name: string;
  url: string;
}

function requireCookie(): string {
  const cookie = cookieHeader();
  if (!cookie) throw new Error("AMAZON_COOKIE required for Amazon HTTP resolution");
  return cookie;
}

async function getHtml(url: string): Promise<{ status: number; url: string; html: string }> {
  const res = await fetch(url, {
    headers: amazonNavigateHeaders(requireCookie()),
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });
  return { status: res.status, url: res.url, html: await res.text() };
}

function assertAuthenticated(res: { status: number; url: string; html: string }, operation: string): void {
  if (
    (res.status >= 300 && res.status < 400) ||
    /\/ap\/signin|id="ap_signin_form"|Sign-In/i.test(res.url + res.html.slice(0, 20_000))
  ) {
    throw new Error(`Amazon session is not authenticated during ${operation}; refresh AMAZON_COOKIE`);
  }
}

/** Find Amazon product candidates using the ordinary HTTP search surface. */
export async function resolveAmazonSearchHttp(query: string, max = 10): Promise<AmazonSearchCandidate[]> {
  const q = query.trim();
  if (!q) throw new Error("title or query is required for Amazon HTTP search");
  const res = await getHtml(`https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=stripbooks`);
  assertAuthenticated(res, "product search");
  const $ = cheerio.load(res.html);
  const out: AmazonSearchCandidate[] = [];
  const seen = new Set<string>();
  for (const card of $("[data-asin]").toArray()) {
    const root = $(card);
    const asin = (root.attr("data-asin") || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    const link = root.find(`a[href*="/dp/${asin}"], a[href*="/gp/product/${asin}"]`).first();
    const href = link.attr("href") || `/dp/${asin}`;
    const title = root.find("h2 span, [data-cy='title-recipe'] span").first().text().replace(/\s+/g, " ").trim() || null;
    const author = root
      .find(".a-row.a-size-base.a-color-secondary, .a-row.a-size-base.a-color-secondary .a-size-base-plus")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .replace(/^by\s+/i, "")
      .trim() || null;
    seen.add(asin);
    out.push({ asin, title, author, url: new URL(href, "https://www.amazon.com").toString() });
    if (out.length >= max) break;
  }
  return out;
}

/** Discover all visible account lists over HTTP; used for --list-name. */
export async function discoverWishlistTargetsHttp(): Promise<AmazonWishlistTarget[]> {
  const res = await getHtml("https://www.amazon.com/hz/wishlist/ls");
  assertAuthenticated(res, "list discovery");
  const $ = cheerio.load(res.html);
  const out: AmazonWishlistTarget[] = [];
  const seen = new Set<string>();
  $("a[href*='/hz/wishlist/ls/']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/\/hz\/wishlist\/ls\/([A-Z0-9]{10,})/i);
    if (!m || seen.has(m[1])) return;
    const name = $(el).text().replace(/\s+/g, " ").trim();
    if (!name) return;
    seen.add(m[1]);
    out.push({ id: m[1], name, url: new URL(href, "https://www.amazon.com").toString() });
  });
  return out;
}

/** Resolve a case-insensitive exact list name. */
export async function resolveWishlistTargetHttp(name: string): Promise<AmazonWishlistTarget> {
  const wanted = name.trim().toLocaleLowerCase();
  const targets = await discoverWishlistTargetsHttp();
  const target = targets.find((t) => t.name.trim().toLocaleLowerCase() === wanted);
  if (!target) {
    throw new Error(`Amazon list ${JSON.stringify(name)} not found through HTTP; available: ${targets.map((t) => t.name).join(", ") || "none"}`);
  }
  return target;
}
