import * as cheerio from "cheerio";

/** Bounded metadata only. Never expose MYCD download/action URLs or document bytes. */
export interface ContentItem {
  asin: string | null;
  title: string | null;
  author: string | null;
  acquiredDate: string | null;
  docId: string | null;
  contentType: "book" | "pdoc";
}

export interface ContentListPage {
  items: ContentItem[];
  totalCount: number | null;
  nextPageUrl: string | null;
  signedOut: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contentItem(
  raw: Record<string, unknown>,
  contentType: "book" | "pdoc",
): ContentItem {
  const asin = asString(raw.asin);
  const docId = asString(raw.contentIdentifier) || asString(raw.docId);
  return {
    asin,
    title: asString(raw.title),
    author: asString(raw.authors) || asString(raw.author),
    acquiredDate: asString(raw.acquiredDate) || asString(raw.purchaseDate),
    docId,
    contentType,
  };
}

function dedupe(items: ContentItem[]): ContentItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.asin || item.docId || item.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Extract MYCD's page-scoped CSRF token, including `var csrfToken = "..."`. */
export function extractCsrfToken(html: string): string | null {
  const variable = html.match(/\bvar\s+csrfToken\s*=\s*(["'])([^"']+)\1/i);
  if (variable?.[2]) return variable[2];
  const input = html.match(
    /<input[^>]+name=["']csrfToken["'][^>]+value=["']([^"']+)["']/i,
  );
  if (input?.[1]) return input[1];
  const meta = html.match(
    /<meta[^>]+name=["']anti-csrftoken-a2z["'][^>]+content=["']([^"']+)["']/i,
  );
  return meta?.[1] ?? null;
}

export function isSignedOutHtml(html: string): boolean {
  return /\/ap\/signin|id=["']ap_signin_form["']|nav-action-signin-button|your password/i.test(
    html,
  );
}

export function isChallengeHtml(html: string): boolean {
  return /robot check|automated access|verify you are human|captcha/i.test(
    html,
  );
}

/** Parse the observed, fixture-verified GetContentOwnershipData AJAX response. */
export function parseContentOwnershipResponse(
  text: string,
  contentType: "book" | "pdoc",
): { items: ContentItem[]; totalCount: number | null; hasMoreItems: boolean } {
  const parsed = JSON.parse(text) as {
    GetContentOwnershipData?: Record<string, unknown>;
    success?: boolean;
  };
  const payload = parsed.GetContentOwnershipData;
  if (!payload || payload.success === false || parsed.success === false) {
    throw new Error(
      "Kindle content AJAX response did not contain successful GetContentOwnershipData",
    );
  }
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = dedupe(
    rawItems
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      .map((item) => contentItem(item, contentType)),
  );
  return {
    items,
    totalCount:
      typeof payload.numberOfItems === "number" ? payload.numberOfItems : null,
    hasMoreItems: payload.hasMoreItems === true,
  };
}

/** Fixture fallback for minimal HTML samples; live reads use the AJAX parser above. */
export function parseContentListHtml(
  html: string,
  contentType: "book" | "pdoc" = "book",
): ContentListPage {
  if (isSignedOutHtml(html))
    return { items: [], totalCount: null, nextPageUrl: null, signedOut: true };
  const $ = cheerio.load(html);
  const items: ContentItem[] = [];
  $("[data-asin], [data-doc-id], .digital_entity").each((_index, element) => {
    const row = $(element);
    const asin = row.attr("data-asin") || null;
    const docId = row.attr("data-doc-id") || null;
    const title =
      row.attr("data-title") ||
      row.find(".title, .title-column a, .doc-title").first().text().trim() ||
      null;
    const author =
      row.attr("data-author") ||
      row.find(".author, .author-column").first().text().trim() ||
      null;
    if (!asin && !docId && !title) return;
    items.push({
      asin,
      title,
      author,
      acquiredDate:
        row.attr("data-acquired-date") ||
        row.find(".date-column").first().text().trim() ||
        null,
      docId,
      contentType,
    });
  });
  return {
    items: dedupe(items),
    totalCount: null,
    nextPageUrl: null,
    signedOut: false,
  };
}
