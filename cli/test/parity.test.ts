import { describe, expect, it } from "vitest";
import { bookKey, computeParity, normalizeTitle } from "../src/parity.js";
import { parityCheck } from "../src/engine.js";

describe("parity", () => {
  it("normalizes titles", () => {
    expect(normalizeTitle("The Little Prince")).toContain("little prince");
  });

  it("matches by asin", () => {
    const L = [{ key: "x", title: "A", author: null, asin: "B00TESTTESTB", source: "amazon-wishlist" as const }];
    const R = [{ key: "y", title: "B", author: null, asin: "B00TESTTESTB", source: "goodreads-shelf" as const }];
    const p = computeParity("L", L, "R", R);
    expect(p.summary.overlap).toBe(1);
  });

  it("falls back from an Amazon ASIN to Goodreads title-author", () => {
    const L = [{ key: bookKey("Roadkill", "Dennis E. Taylor", "B0BNWHFVVS"), title: "Roadkill", author: "Dennis E. Taylor", asin: "B0BNWHFVVS", source: "amazon-wishlist" as const }];
    const R = [{ key: bookKey("Roadkill", "Dennis E. Taylor"), title: "Roadkill", author: "Dennis E. Taylor", goodreadsId: "123", source: "goodreads-shelf" as const }];
    expect(computeParity("L", L, "R", R).summary.overlap).toBe(1);
  });

  it("matches by title+author last name", () => {
    const k1 = bookKey("Roadkill", "Dennis E. Taylor");
    const k2 = bookKey("Roadkill", "Taylor");
    expect(k1).toBe(k2);
  });

  it("does not report an empty Amazon side when wishlist acquisition fails", async () => {
    await expect(parityCheck({ fixture: "__missing_wishlist_fixture__.html" })).rejects.toThrow(
      "wishlist read failed",
    );
  });
});
