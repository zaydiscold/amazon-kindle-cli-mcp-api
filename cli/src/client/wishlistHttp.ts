/**
 * Amazon wishlist add via pure HTTP (mapped 2026-08-01 via CDP on product page).
 * Requires AMAZON_COOKIE. Dry-run by default; exact approval is enforced by the engine.
 */
import { cookieHeader, readBoundedText } from "./live.js";
import { amazonNavigateHeaders, amazonXhrHeaders } from "./httpHeaders.js";
import {
  assertTrustedAmazonUrl,
  TRUSTED_AMAZON_ORIGIN,
} from "./trustedAmazon.js";

export interface WishlistHttpAddOptions {
  asin: string;
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

export function extractAntiCsrf(html: string): string | null {
  const patterns = [
    /id="addToWishListForm"[\s\S]{0,8000}?name="anti-csrftoken-a2z"\s+value="([^"]+)"/i,
    /name="anti-csrftoken-a2z"\s+value="([^"]+)"/i,
    /anti-csrftoken-a2z&quot;:&quot;([^&]+)/i,
    /anti-csrftoken-a2z["'\\s:]+["']([^"']{16,})/i,
    /name="anti-csrftoken-a2z"\s+content="([^"]+)"/i,
    /"csrfToken"\s*:\s*"([^"]+)"/i,
    /data-anti-csrftoken-a2z="([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1])
      return match[1].replace(/\\u002F/g, "/").replace(/&quot;/g, '"');
  }
  return null;
}

export function parseAddItemResponse(html: string): {
  success: boolean;
  alreadyOnList: boolean;
  listId: string | null;
  message: string | null;
} {
  const alreadyOnList =
    /already in/i.test(html) || /moved it to the top/i.test(html);
  const success =
    alreadyOnList ||
    /huc-atwl/i.test(html) ||
    /view your list/i.test(html) ||
    /added to/i.test(html);
  const listMatch = html.match(/\/hz\/wishlist\/ls\/([A-Z0-9]{10,})/i);
  const messageMatch =
    html.match(/huc-atwl-header-main[^>]*>([^<]+)/i) ||
    html.match(/a-size-medium-plus huc-atwl-header-main[^>]*>([^<]+)/i);
  return {
    success,
    alreadyOnList,
    listId: listMatch?.[1] || null,
    message: messageMatch?.[1]?.trim() || null,
  };
}

async function amazonGet(
  value: string,
): Promise<{ status: number; text: string; location: string | null }> {
  const url = assertTrustedAmazonUrl(value);
  const cookie = requireCookie();
  const response = await fetch(url, {
    method: "GET",
    headers: amazonNavigateHeaders(cookie, `${TRUSTED_AMAZON_ORIGIN}/`),
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });
  const location = response.headers.get("location");
  if (location && response.status >= 300 && response.status < 400) {
    const redirect = new URL(location, url);
    if (redirect.origin !== TRUSTED_AMAZON_ORIGIN) {
      throw new Error(
        `Amazon returned a cross-origin redirect to ${redirect.origin}`,
      );
    }
  }
  return {
    status: response.status,
    text: await readBoundedText(response),
    location,
  };
}

export async function planWishlistHttpAdd(opts: WishlistHttpAddOptions) {
  const asin = opts.asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin))
    throw new Error(`invalid ASIN: ${opts.asin}`);
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
  const productUrl = `${TRUSTED_AMAZON_ORIGIN}/dp/${plan.asin}`;
  const product = await amazonGet(productUrl);
  if (product.status >= 300 && product.status < 400) {
    return {
      submitted: false,
      via: "http" as const,
      plan,
      ok: false,
      error: "session redirect on product page; refresh AMAZON_COOKIE",
      status: product.status,
      mutationVerified: false as const,
      verificationRequired: "re-auth then retry",
    };
  }
  if (product.status < 200 || product.status >= 300) {
    return {
      submitted: false,
      via: "http" as const,
      plan,
      ok: false,
      error: `product page returned HTTP ${product.status}; response body omitted`,
      status: product.status,
      mutationVerified: false as const,
      verificationRequired: "verify ASIN and authentication before retrying",
    };
  }

  const csrf = extractAntiCsrf(product.text);
  if (!csrf) {
    const wishlist = await amazonGet(`${TRUSTED_AMAZON_ORIGIN}/hz/wishlist/ls`);
    const fallback = extractAntiCsrf(wishlist.text);
    if (!fallback) {
      return {
        submitted: false,
        via: "http" as const,
        plan,
        ok: false,
        error: "could not extract wishlist CSRF token; response bodies omitted",
        productStatus: product.status,
        mutationVerified: false as const,
        verificationRequired:
          "refresh authentication or update the sanitized parser fixture",
      };
    }
    return postAdd(plan, cookie, fallback, productUrl);
  }
  return postAdd(plan, cookie, csrf, productUrl);
}

async function postAdd(
  plan: Awaited<ReturnType<typeof planWishlistHttpAdd>>,
  cookie: string,
  csrf: string,
  referer: string,
) {
  const body = new URLSearchParams({
    asin: plan.asin,
    vendorId: "website.wishlist.detail.add",
    listType: plan.listType,
    isAjax: "1",
  });
  if (plan.listId) body.set("listId", plan.listId);

  const response = await fetch(
    `${TRUSTED_AMAZON_ORIGIN}/hz/wishlist/additemtolist?ie=UTF8`,
    {
      method: "POST",
      headers: {
        ...amazonXhrHeaders(cookie, referer),
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "anti-csrftoken-a2z": csrf,
      },
      body: body.toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(45_000),
    },
  );
  const text = await readBoundedText(response);
  const parsed = parseAddItemResponse(text);
  const ok = response.ok && parsed.success;

  return {
    submitted: ok,
    via: "http" as const,
    plan,
    ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    alreadyOnList: parsed.alreadyOnList,
    listId: parsed.listId || plan.listId,
    message: parsed.message,
    byteLength: Buffer.byteLength(text),
    responseBodyOmitted: true,
    csrfPresent: true,
    mutationVerified: false as const,
    verificationRequired: `wishlist list -- confirm ASIN ${plan.asin} present`,
  };
}
