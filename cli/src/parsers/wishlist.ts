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
  showMoreUrl: string | null;
}

function absUrl(href: string | null | undefined, baseUrl: string): string | null {
  if (!href) return null;
  try {
    return new URL(href.replace(/&amp;/g, "&"), baseUrl).toString();
  } catch {
    return null;
  }
}

function asinFromHref(href: string | null): string | null {
  if (!href) return null;
  const m = href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return m?.[1] ?? null;
}

export function parseWishlistHtml(html: string, baseUrl = "https://www.amazon.com"): WishlistPage {
  const $ = cheerio.load(html);
  const listName =
    $("#profile-list-name").text().trim() ||
    $("h1#profile-list-name").text().trim() ||
    $("h1").first().text().trim() ||
    null;

  const items: WishlistItem[] = [];

  // Modern list rows: anchors id="itemName_{itemId}"
  const nameAnchors = $('[id^="itemName_"]').toArray();
  if (nameAnchors.length) {
    for (const el of nameAnchors) {
      const link = $(el);
      const href = link.attr("href") || null;
      const asin = asinFromHref(href);
      let title = link.clone().children().remove().end().text().trim() || link.text().trim() || null;
      if (title) title = title.replace(/\s+/g, " ").trim();
      const id = (link.attr("id") || "").replace(/^itemName_/, "");
      const root = id
        ? $(`#itemMain_${id}, #item_${id}, [data-itemid="${id}"]`).first()
        : link.closest("li, div");
      let author: string | null = null;
      const byline = root.find('[id^="item-byline-"]').first();
      if (byline.length) {
        author = byline.text().replace(/\s+/g, " ").trim() || null;
      }
      if (author) {
        author =
          author
            .replace(/^\s*by\s+/i, "")
            .replace(/\s*\(Kindle Edition\)\s*$/i, "")
            .trim() || null;
      }
      if (!title && !asin) continue;
      items.push({
        asin,
        title,
        author,
        url: absUrl(href, baseUrl),
      });
    }
  } else {
    // Fallback: data-asin / data-itemid cards
    const roots = $("[data-itemid], li[data-id], div[id^='item_'], [data-asin]").toArray();
    for (const el of roots) {
      const root = $(el);
      const nameEl = root.find('[id^="itemName_"]').first();
      const link = nameEl.length
        ? nameEl
        : root.find('a[href*="/dp/"], a[href*="/gp/product/"]').first();
      const href = link.attr("href") || null;
      let asin: string | null = root.attr("data-asin") || asinFromHref(href);
      let title: string | null = null;
      if (nameEl.length) {
        title = nameEl.clone().children().remove().end().text().trim() || nameEl.text().trim() || null;
      } else if (link.length) {
        title = link.clone().children().remove().end().text().trim() || null;
      }
      if (title) title = title.replace(/\s+/g, " ").trim();
      if (!title && !asin) continue;
      items.push({
        asin,
        title,
        author: null,
        url: absUrl(href, baseUrl),
      });
    }
  }

  // Last-resort: unique /dp/ASIN from page when structure is a fragment
  if (items.length === 0) {
    const seen = new Set<string>();
    const re = /href="([^"]*\/dp\/([A-Z0-9]{10})[^"]*)"[^>]*>([^<]{2,200})/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const asin = m[2];
      if (seen.has(asin)) continue;
      seen.add(asin);
      const title = m[3].replace(/\s+/g, " ").trim();
      if (!title || title.length < 2) continue;
      items.push({ asin, title, author: null, url: absUrl(m[1], baseUrl) });
    }
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

  let showMore: string | null = null;
  const sm =
    html.match(/"showMoreUrl"\s*:\s*"([^"]+)"/i) ||
    html.match(/name="showMoreUrl"\s+value="([^"]+)"/i) ||
    html.match(/href="(\/hz\/wishlist\/slv\/items\?[^"]+)"/i);
  if (sm?.[1]) {
    showMore = sm[1].replace(/&amp;/g, "&").replace(/\\\//g, "/");
    if (showMore.startsWith("/")) showMore = `https://www.amazon.com${showMore}`;
  }

  return {
    listName: listName || null,
    items: deduped,
    nextPageUrl: next ? absUrl(next, baseUrl) : null,
    showMoreUrl: showMore,
  };
}
