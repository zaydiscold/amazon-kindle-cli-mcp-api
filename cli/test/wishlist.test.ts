import { describe, expect, it } from "vitest";
import { parseWishlistHtml } from "../src/parsers/wishlist.js";

describe("wishlist parser", () => {
  it("extracts asin + title from minimal markup", () => {
    const html = `
      <div data-asin="B00TESTTESTB" data-itemid="1">
        <a href="/dp/B00TESTTESTB">Fantastic Mr. Fox</a>
        <span class="a-size-base">by Roald Dahl</span>
      </div>
    `;
    const page = parseWishlistHtml(html);
    expect(page.items[0]?.asin).toBe("B00TESTTESTB");
    expect(page.items[0]?.title).toMatch(/Fantastic/);
  });
});
