/**
 * Normalize book identity for parity across Amazon / Kindle / Goodreads.
 */
export interface BookRef {
  key: string; // normalized match key
  title: string | null;
  author: string | null;
  asin?: string | null;
  goodreadsId?: string | null;
  source:
    | "amazon-wishlist"
    | "kindle-library"
    | "goodreads-shelf"
    | "photo"
    | "epub"
    | "manual";
  raw?: Record<string, unknown>;
}

export function normalizeTitle(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAuthor(author: string | null | undefined): string {
  if (!author) return "";
  return author
    .toLowerCase()
    .replace(/^by\s+/i, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function bookKey(
  title: string | null,
  author?: string | null,
  asin?: string | null,
): string {
  // Never make ASIN the only key: Goodreads records usually have no ASIN.
  // ASIN is an exact-match bonus in refsEqual; title+author is cross-surface identity.
  void asin;
  const t = normalizeTitle(title);
  const a = normalizeAuthor(author);
  const alast = a.split(" ").filter(Boolean).slice(-1)[0] || "";
  return `t:${t}|a:${alast}`;
}

export function refsEqual(a: BookRef, b: BookRef): boolean {
  if (a.asin && b.asin && a.asin.toUpperCase() === b.asin.toUpperCase())
    return true;
  if (a.goodreadsId && b.goodreadsId && a.goodreadsId === b.goodreadsId)
    return true;
  // Title/author fallback is deliberately independent of ASIN availability.
  const at = normalizeTitle(a.title);
  const bt = normalizeTitle(b.title);
  const aa =
    normalizeAuthor(a.author).split(" ").filter(Boolean).slice(-1)[0] || "";
  const ba =
    normalizeAuthor(b.author).split(" ").filter(Boolean).slice(-1)[0] || "";
  return Boolean(at && bt && at === bt && aa && ba && aa === ba);
}

export interface ParityReport {
  left: { name: string; count: number };
  right: { name: string; count: number };
  onlyLeft: BookRef[];
  onlyRight: BookRef[];
  both: Array<{ left: BookRef; right: BookRef }>;
  summary: {
    leftOnly: number;
    rightOnly: number;
    overlap: number;
    coverageLeftInRight: number;
    coverageRightInLeft: number;
  };
}

export function computeParity(
  leftName: string,
  left: BookRef[],
  rightName: string,
  right: BookRef[],
): ParityReport {
  const rightUsed = new Set<number>();
  const both: ParityReport["both"] = [];
  const onlyLeft: BookRef[] = [];

  for (const L of left) {
    let hit = -1;
    for (let i = 0; i < right.length; i++) {
      if (rightUsed.has(i)) continue;
      if (refsEqual(L, right[i])) {
        hit = i;
        break;
      }
    }
    if (hit >= 0) {
      rightUsed.add(hit);
      both.push({ left: L, right: right[hit] });
    } else {
      onlyLeft.push(L);
    }
  }
  const onlyRight = right.filter((_, i) => !rightUsed.has(i));
  return {
    left: { name: leftName, count: left.length },
    right: { name: rightName, count: right.length },
    onlyLeft,
    onlyRight,
    both,
    summary: {
      leftOnly: onlyLeft.length,
      rightOnly: onlyRight.length,
      overlap: both.length,
      coverageLeftInRight: left.length ? both.length / left.length : 0,
      coverageRightInLeft: right.length ? both.length / right.length : 0,
    },
  };
}
