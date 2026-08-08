import { afterEach, describe, expect, it, vi } from "vitest";
import { executeWishlistListHttp } from "../src/client/wishlistListHttp.js";
import { parseWishlistHtml } from "../src/parsers/wishlist.js";

const originalCookie = process.env.AMAZON_COOKIE;
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalCookie === undefined) delete process.env.AMAZON_COOKIE;
  else process.env.AMAZON_COOKIE = originalCookie;
});

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

  it("retries a public wishlist without stale retail cookies", async () => {
    process.env.AMAZON_COOKIE = "session-id=stale; at-main=stale";
    const requests: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        requests.push(init);
        if (requests.length === 1) {
          return new Response("", {
            status: 302,
            headers: {
              location:
                "https://www.amazon.com/ap/signin?openid.pape.max_auth_age=900",
            },
          });
        }
        return new Response(
          '<div data-asin="B00TESTTESTB" data-itemid="1"><a href="/dp/B00TESTTESTB">Public Book</a></div>',
          { status: 200 },
        );
      }),
    );

    const result = await executeWishlistListHttp({
      listId: "TESTLIST",
      maxPages: 1,
    });
    expect(result.items[0]?.asin).toBe("B00TESTTESTB");
    expect(result.sessionMode).toBe("public");
    expect(new Headers(requests[0].headers).has("cookie")).toBe(true);
    expect(new Headers(requests[1].headers).has("cookie")).toBe(false);
  });

  it("applies --limit without claiming a full paginated inventory", async () => {
    delete process.env.AMAZON_COOKIE;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            '<div data-asin="B00LIMIT001"><a href="/dp/B00LIMIT001">One</a></div><div data-asin="B00LIMIT002"><a href="/dp/B00LIMIT002">Two</a></div>',
            { status: 200 },
          ),
      ),
    );
    const result = await executeWishlistListHttp({
      listId: "TESTLIST",
      maxPages: 1,
      limit: 1,
    });
    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });
});
