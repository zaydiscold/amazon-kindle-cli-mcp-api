import { readFile } from "node:fs/promises";
import { cookieHeader } from "./live.js";
import { amazonNavigateHeaders, amazonXhrHeaders } from "./httpHeaders.js";
import {
  extractCsrfToken,
  isChallengeHtml,
  isSignedOutHtml,
  parseContentListHtml,
  parseContentOwnershipResponse,
  type ContentItem,
} from "../parsers/kindleContent.js";

export type ContentKind = "books" | "pdocs";
export interface ContentListOptions {
  type?: ContentKind;
  limit?: number;
  fixture?: string;
}

const BASE_URL = "https://www.amazon.com";
const CONTENT_URLS: Record<ContentKind, string> = {
  books: `${BASE_URL}/hz/mycd/digital-console/contentlist/booksAll/dateDsc/`,
  pdocs: `${BASE_URL}/hz/mycd/digital-console/contentlist/pdocs/dateDsc/`,
};
const BATCH_SIZE = 25;

function contentRequest(kind: ContentKind, startIndex: number) {
  const common = {
    contentCategoryReference: kind === "books" ? "booksAll" : "pdocs",
    itemStatusList: kind === "books" ? ["Active", "Expired"] : ["Active"],
    fetchCriteria: {
      sortOrder: "DESCENDING",
      sortIndex: "DATE",
      startIndex,
      batchSize: BATCH_SIZE,
      totalContentCount: -1,
    },
    surfaceType: "Desktop",
  };
  if (kind === "pdocs") return { ...common, contentType: "KindlePDoc" };
  return {
    ...common,
    contentType: "Ebook",
    excludeExpiredItemsFor: [
      "KOLL",
      "Purchase",
      "Pottermore",
      "FreeTrial",
      "DeviceRegistration",
      "KindleUnlimited",
      "Sample",
      "Prime",
      "ComicsUnlimited",
      "Comixology",
    ],
    originTypes: [
      "Purchase",
      "PublicLibraryLending",
      "PersonalLending",
      "Sample",
      "ComicsUnlimited",
      "KOLL",
      "RFFLending",
      "Pottermore",
      "Prime",
      "Rental",
      "DeviceRegistration",
      "FreeTrial",
      "KindleUnlimited",
      "Comixology",
    ],
    showSharedContent: true,
  };
}

async function getPage(url: string, cookie: string) {
  const response = await fetch(url, {
    headers: amazonNavigateHeaders(cookie, url),
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });
  return {
    status: response.status,
    text: await response.text(),
    location: response.headers.get("location"),
  };
}

async function getOwnershipPage(
  kind: ContentKind,
  csrfToken: string,
  cookie: string,
  startIndex: number,
) {
  const url = `${BASE_URL}/hz/mycd/digital-console/ajax`;
  const headers = {
    ...amazonXhrHeaders(cookie, CONTENT_URLS[kind]),
    accept: "application/json, text/javascript, */*; q=0.01",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "x-requested-with": "XMLHttpRequest",
  };
  // Observed, fixture-verified XHR envelope; not authenticated-live-verified.
  const body = new URLSearchParams({
    activity: "GetContentOwnershipData",
    activityInput: JSON.stringify(contentRequest(kind, startIndex)),
    clientId: "MYCD_WebService",
    csrfToken,
  });
  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });
  return {
    status: response.status,
    text: await response.text(),
    location: response.headers.get("location"),
  };
}

export async function executeContentList(
  opts: ContentListOptions = {},
): Promise<{
  items: ContentItem[];
  totalCount: number | null;
  contentType: ContentKind;
  truncated: boolean;
  via: "http";
  sessionMode: "authenticated";
}> {
  const type = opts.type ?? "books";
  if (opts.fixture) {
    const raw = await readFile(opts.fixture, "utf8");
    const itemType = type === "books" ? "book" : "pdoc";
    if (raw.trim().startsWith("{")) {
      const page = parseContentOwnershipResponse(raw, itemType);
      const items =
        opts.limit === undefined ? page.items : page.items.slice(0, opts.limit);
      return {
        items,
        totalCount: page.totalCount ?? page.items.length,
        contentType: type,
        truncated: items.length < page.items.length || page.hasMoreItems,
        via: "http",
        sessionMode: "authenticated",
      };
    }
    const page = parseContentListHtml(raw, itemType);
    if (page.signedOut || isChallengeHtml(raw))
      throw new Error("fixture represents an Amazon sign-in or challenge page");
    const items =
      opts.limit === undefined ? page.items : page.items.slice(0, opts.limit);
    return {
      items,
      totalCount: page.totalCount ?? page.items.length,
      contentType: type,
      truncated: items.length < page.items.length,
      via: "http",
      sessionMode: "authenticated",
    };
  }
  const cookie = cookieHeader();
  if (!cookie)
    throw new Error(
      "AMAZON_COOKIE required for private Kindle content HTTP reads",
    );
  const first = await getPage(CONTENT_URLS[type], cookie);
  if (
    (first.status >= 300 && first.status < 400) ||
    isSignedOutHtml(first.text) ||
    isChallengeHtml(first.text)
  ) {
    throw new Error(
      "Kindle content session requires sign-in or Amazon presented a challenge; refresh ~/.amazon/auth.sh",
    );
  }
  if (first.status < 200 || first.status >= 300)
    throw new Error(
      `Kindle content page returned HTTP ${first.status}${first.location ? ` (${first.location})` : ""}`,
    );
  const csrfToken = extractCsrfToken(first.text);
  if (!csrfToken)
    throw new Error("Kindle content page did not expose var csrfToken");

  const items: ContentItem[] = [];
  const seenItemKeys = new Set<string>();
  let totalCount: number | null = null;
  let startIndex = 0;
  let hasMoreItems = true;
  while (
    hasMoreItems &&
    (opts.limit === undefined || items.length < opts.limit)
  ) {
    const response = await getOwnershipPage(
      type,
      csrfToken,
      cookie,
      startIndex,
    );
    if (
      (response.status >= 300 && response.status < 400) ||
      isSignedOutHtml(response.text) ||
      isChallengeHtml(response.text)
    ) {
      throw new Error(
        "Kindle content AJAX session requires sign-in or Amazon presented a challenge; refresh ~/.amazon/auth.sh",
      );
    }
    if (response.status !== 200)
      throw new Error(`Kindle content AJAX returned HTTP ${response.status}`);
    const page = parseContentOwnershipResponse(
      response.text,
      type === "books" ? "book" : "pdoc",
    );
    for (const item of page.items) {
      // Amazon pages can overlap while inventory changes. Keep the first record
      // for a stable bounded view without exposing raw content/action fields.
      const key = item.asin || item.docId || item.title;
      if (!key || seenItemKeys.has(key)) continue;
      seenItemKeys.add(key);
      items.push(item);
    }
    totalCount = page.totalCount ?? totalCount;
    hasMoreItems = page.hasMoreItems && page.items.length > 0;
    startIndex += BATCH_SIZE;
  }
  const limited = opts.limit === undefined ? items : items.slice(0, opts.limit);
  return {
    items: limited,
    totalCount,
    contentType: type,
    truncated: limited.length < items.length || hasMoreItems,
    via: "http",
    sessionMode: "authenticated",
  };
}

export async function contentListHttp(opts: ContentListOptions = {}) {
  return executeContentList(opts);
}
export type { ContentItem };
