/**
 * Amazon wishlist add via pure HTTP (mapped 2026-08-01 via CDP on product page).
 *
 * Flow:
 *  1. GET  /dp/{ASIN}                         → anti-csrftoken-a2z (+ session)
 *  2. POST /hz/wishlist/additemtolist         → form-urlencoded asin + list
 *
 * Requires AMAZON_COOKIE. Dry-run by default (caller gates execute).
 * Browser path remains optional fallback only.
 */
import { cookieHeader } from "./live.js";

const UA =
  "amazon-kindle-cli/0.3.0 (+wishlist-http; https://github.com/zaydiscold/amazon-kindle-cli-mcp-api)";

export interface WishlistHttpAddOptions {
  asin: string;
  /** Default Shopping List id when known (e.g. 26C3QAASCFU8S). Optional. */
  listId?: string;
  listType?: "wishlist" | "idea-list";
  execute?: boolean;
  dryRun?: boolean;
}

function requireCookie(): string {
  const cookie = cookieHeader();
  if (!cookie) throw new Error("AMAZON_COOKIE required for wishlist HTTP add");
  return cookie;
}

/** Extract anti-csrftoken-a2z from a product or wishlist HTML page. */
export function extractAntiCsrf(html: string): string | null {
  const patterns = [
    // product wishlist form field (preferred — live-verified 2026-08-01)
    /id="addToWishListForm"[\s\S]{0,8000}?name="anti-csrftoken-a2z"\s+value="([^"]+)"/i,
    /name="anti-csrftoken-a2z"\s+value="([^"]+)"/i,
    /anti-csrftoken-a2z&quot;:&quot;([^&]+)/i,
    /anti-csrftoken-a2z["'\\s:]+["']([^"']{16,})/i,
    /name="anti-csrftoken-a2z"\s+content="([^"]+)"/i,
    /"csrfToken"\s*:\s*"([^"]+)"/i,
    /data-anti-csrftoken-a2z="([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].replace(/\\u002F/g, "/").replace(/&quot;/g, '"');
  }
  return null;
}

/** Parse additemtolist HTML for success / already-on-list. */
export function parseAddItemResponse(html: string): {
  success: boolean;
  alreadyOnList: boolean;
  listId: string | null;
  message: string | null;
} {
  const alreadyOnList = /already in/i.test(html) || /moved it to the top/i.test(html);
  const success =
    alreadyOnList ||
    /huc-atwl/i.test(html) ||
    /view your list/i.test(html) ||
    /added to/i.test(html);
  const listMatch = html.match(/\/hz\/wishlist\/ls\/([A-Z0-9]{10,})/i);
  const msgMatch =
    html.match(/huc-atwl-header-main[^>]*>([^<]+)/i) ||
    html.match(/a-size-medium-plus huc-atwl-header-main[^>]*>([^<]+)/i);
  return {
    success,
    alreadyOnList,
    listId: listMatch?.[1] || null,
    message: msgMatch?.[1]?.trim() || null,
  };
}

async function amazonGet(url: string): Promise<{ status: number; text: string; headers: Headers }> {
  const cookie = requireCookie();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      cookie,
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

export async function planWishlistHttpAdd(opts: WishlistHttpAddOptions) {
  const asin = opts.asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    throw new Error(`invalid ASIN: ${opts.asin}`);
  }
  const dryRun = opts.dryRun || !opts.execute;
  return {
    dryRun,
    execute: !dryRun,
    route: "GET /dp/{ASIN} → POST /hz/wishlist/additemtolist",
    asin,
    listId: opts.listId || null,
    listType: opts.listType || "wishlist",
    cookiePresent: Boolean(cookieHeader()),
    bodyTemplate: {
      asin,
      vendorId: "website.wishlist.detail.add",
      listType: opts.listType || "wishlist",
      isAjax: "1",
      ...(opts.listId ? { listId: opts.listId } : {}),
    },
  };
}

export async function executeWishlistHttpAdd(opts: WishlistHttpAddOptions) {
  const plan = await planWishlistHttpAdd(opts);
  if (plan.dryRun) {
    return {
      submitted: false,
      via: "http" as const,
      plan,
      mutationVerified: false as const,
      verificationRequired: "wishlist list and confirm ASIN present",
    };
  }

  const cookie = requireCookie();
  const productUrl = `https://www.amazon.com/dp/${plan.asin}`;
  const product = await amazonGet(productUrl);
  if (product.status >= 300 && product.status < 400) {
    return {
      submitted: false,
      via: "http" as const,
      plan,
      ok: false,
      error: "session redirect on product page — refresh AMAZON_COOKIE",
      status: product.status,
      mutationVerified: false as const,
      verificationRequired: "re-auth then retry",
    };
  }

  const csrf = extractAntiCsrf(product.text);
  if (!csrf) {
    // try wishlist page as secondary CSRF source
    const wl = await amazonGet("https://www.amazon.com/hz/wishlist/ls");
    const csrf2 = extractAntiCsrf(wl.text);
    if (!csrf2) {
      return {
        submitted: false,
        via: "http" as const,
        plan,
        ok: false,
        error: "could not extract anti-csrftoken-a2z from product or wishlist HTML",
        productStatus: product.status,
        mutationVerified: false as const,
        verificationRequired: "capture product HTML fixture or re-auth",
      };
    }
    return await postAdd(plan, cookie, csrf2, productUrl);
  }
  return await postAdd(plan, cookie, csrf, productUrl);
}

async function postAdd(
  plan: Awaited<ReturnType<typeof planWishlistHttpAdd>>,
  cookie: string,
  csrf: string,
  referer: string,
) {
  const body = new URLSearchParams();
  body.set("asin", plan.asin);
  body.set("vendorId", "website.wishlist.detail.add");
  body.set("listType", plan.listType);
  body.set("isAjax", "1");
  if (plan.listId) body.set("listId", plan.listId);

  const res = await fetch("https://www.amazon.com/hz/wishlist/additemtolist?ie=UTF8", {
    method: "POST",
    headers: {
      cookie,
      "user-agent": UA,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      accept: "*/*",
      "x-requested-with": "XMLHttpRequest",
      "anti-csrftoken-a2z": csrf,
      origin: "https://www.amazon.com",
      referer,
    },
    body: body.toString(),
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  const parsed = parseAddItemResponse(text);
  // 200 + huc-atwl / already-in = real success (403 was bad CSRF)
  const ok = res.ok && parsed.success;

  return {
    submitted: ok,
    via: "http" as const,
    plan,
    ok,
    status: res.status,
    contentType: res.headers.get("content-type"),
    alreadyOnList: parsed.alreadyOnList,
    listId: parsed.listId || plan.listId,
    message: parsed.message,
    bodyPreview: text.slice(0, 400).replace(/\s+/g, " ").trim(),
    byteLength: text.length,
    csrfPresent: true,
    mutationVerified: false as const,
    verificationRequired: `wishlist list -- confirm ASIN ${plan.asin} present`,
  };
}
