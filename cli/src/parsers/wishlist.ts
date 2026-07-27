import * as cheerio from "cheerio";

export interface WishlistItem {
  asin: string | null;
  title: string | null;
  author: string | null;
  url: string | null;
}

export interface WishlistPage {
  listName: string | null;
  items: WishlistItem[];
  nextPageUrl: string | null;
}

export function parseWishlistHtml(html: string, baseUrl = "https://www.amazon.com"): WishlistPage {
  const $ = cheerio.load(html);
  const listName =
    $("#profile-list-name").text().trim() || $("h1").first().text().trim() || null;

  const items: WishlistItem[] = [];
    // Prefer explicit wishlist item roots — avoids nested-card title bleed.
    const roots = $("[data-itemid], li[data-id], div[id^='item_']").toArray();
    const els = roots.length ? roots : $("[data-asin]").toArray();
    for (const el of els) {
      const root = $(el);
      const nameEl = root.find('[id^="itemName_"]').first();
      const link = nameEl.length
        ? nameEl
        : root.find('a[href*="/dp/"], a[href*="/gp/product/"]').first();
      const href = link.attr("href") || null;
      let asin: string | null = root.attr("data-asin") || null;
      if (!asin && href) {
        const m = href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        if (m) asin = m[1];
      }
      // Own text only — no descendant aggregation that merges neighboring cards.
      let title: string | null = null;
      if (nameEl.length) {
        title = nameEl.clone().children().remove().end().text().trim() || nameEl.text().trim() || null;
      } else if (link.length) {
        title = link.clone().children().remove().end().text().trim() || null;
      }
      if (title) title = title.replace(/\s+/g, " ").trim();
      const byline = root.find('[id^="item-byline-"]').first();
      let author: string | null = null;
      if (byline.length) {
            author = byline.text().replace(/\s+/g, " ").trim() || null;
          } else {
            const by = root
              .find(".a-size-base")
              .filter((_, e) => /\bby\s+/i.test($(e).text().trim()))
              .first();
            if (by.length) author = by.text().replace(/\s+/g, " ").trim() || null;
          }
          if (author) {
                      author = author
                        .replace(/^\s*by\s+/i, "")
                        .replace(/\s*\(Kindle Edition\)\s*$/i, "")
                        .trim() || null;
                    }
                if (!title && !asin) continue;

                items.push({
                  asin,
                  title,
                  author,
                  url: href ? new URL(href, baseUrl).toString() : null,
                });
              }

  const seen = new Set<string>();
  const deduped = items.filter((it) => {
    const k = it.asin || it.title || "";
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const next =
    $("ul.a-pagination li.a-last a").attr("href") ||
    $('a:contains("Next")').attr("href") ||
    null;

  return {
    listName,
    items: deduped,
    nextPageUrl: next ? new URL(next, baseUrl).toString() : null,
  };
}
