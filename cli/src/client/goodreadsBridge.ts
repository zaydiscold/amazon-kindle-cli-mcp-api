/** Goodreads helpers — RSS first (no cookie thrash), HTML optional. */
import { bookKey, type BookRef } from "../parity.js";

export async function fetchGoodreadsShelfRss(
  userId: string,
  shelf = "to-read",
): Promise<BookRef[]> {
  const url = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${encodeURIComponent(shelf)}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": "amazon-kindle-cli/0.2",
      accept: "application/rss+xml,application/xml,text/xml,*/*",
    },
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`Goodreads RSS ${res.status}`);
  const xml = await res.text();
  const items = xml.split(/<item>/i).slice(1);
  const out: BookRef[] = [];
  for (const chunk of items) {
    const title =
      textBetween(chunk, "title")
        ?.replace(/^<!\[CDATA\[|\]\]>$/g, "")
        .trim() || null;
    // skip shelf title item
    if (title && /books on Goodreads/i.test(title)) continue;
    const author =
      textBetween(chunk, "author_name")
        ?.replace(/^<!\[CDATA\[|\]\]>$/g, "")
        .trim() ||
      textBetween(chunk, "dc:creator")
        ?.replace(/^<!\[CDATA\[|\]\]>$/g, "")
        .trim() ||
      null;
    const bookId =
      textBetween(chunk, "book_id") ||
      chunk.match(/\/book\/show\/(\d+)/)?.[1] ||
      null;
    const isbn = textBetween(chunk, "isbn") || null;
    out.push({
      key: bookKey(title, author),
      title,
      author,
      goodreadsId: bookId,
      asin: null,
      source: "goodreads-shelf",
      raw: { isbn, shelf },
    });
  }
  return out;
}

function textBetween(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

/** Resolve Goodreads book id via public search HTML (best-effort). */
export async function searchGoodreadsBookId(
  title: string,
  author?: string | null,
): Promise<string | null> {
  const q = [title, author].filter(Boolean).join(" ");
  const url = `https://www.goodreads.com/search?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { "user-agent": "amazon-kindle-cli/0.2", accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/\/book\/show\/(\d+)[^"]*/);
  return m?.[1] ?? null;
}
