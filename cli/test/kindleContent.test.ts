import { afterEach, describe, expect, it, vi } from "vitest";
import { executeContentList } from "../src/client/kindleContentHttp.js";
import {
  extractCsrfToken,
  parseContentOwnershipResponse,
} from "../src/parsers/kindleContent.js";

const originalCookie = process.env.AMAZON_COOKIE;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalCookie === undefined) delete process.env.AMAZON_COOKIE;
  else process.env.AMAZON_COOKIE = originalCookie;
});

const shell =
  '<html><script>var csrfToken = "synthetic-csrf-token";</script></html>';

function ownership(
  items: unknown[],
  hasMoreItems = false,
  numberOfItems = items.length,
) {
  return JSON.stringify({
    GetContentOwnershipData: {
      success: true,
      items,
      hasMoreItems,
      numberOfItems,
    },
  });
}

describe("Kindle owned books and personal documents", () => {
  it("extracts the MYCD shell CSRF token without returning it", () => {
    expect(extractCsrfToken(shell)).toBe("synthetic-csrf-token");
  });

  it("normalizes purchased books and strips raw download URLs", () => {
    const page = parseContentOwnershipResponse(
      ownership([
        {
          asin: "B00SYNTHET1",
          title: "Synthetic Purchased Book",
          authors: "Example Author",
          acquiredDate: "2026-01-02",
          dpURL: "https://downloads.example.invalid/private?signature=secret",
        },
      ]),
      "book",
    );
    expect(page.items).toEqual([
      {
        asin: "B00SYNTHET1",
        title: "Synthetic Purchased Book",
        author: "Example Author",
        acquiredDate: "2026-01-02",
        docId: null,
        contentType: "book",
      },
    ]);
    expect(JSON.stringify(page)).not.toMatch(
      /downloads\.example|signature|secret/,
    );
  });

  it("requests pdocs with the observed POST envelope and limits returned items", async () => {
    process.env.AMAZON_COOKIE = "session-id=redacted";
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ url, init });
        if (requests.length === 1) return new Response(shell, { status: 200 });
        return new Response(
          ownership([
            {
              contentIdentifier: "pdoc-synthetic-1",
              title: "Synthetic PDF",
              authors: "Uploader",
              acquiredDate: "2026-02-03",
            },
            {
              contentIdentifier: "pdoc-synthetic-2",
              title: "Second PDF",
              authors: "Uploader",
              acquiredDate: "2026-02-02",
            },
          ]),
          { status: 200 },
        );
      }),
    );

    const result = await executeContentList({ type: "pdocs", limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      docId: "pdoc-synthetic-1",
      contentType: "pdoc",
    });
    expect(result.truncated).toBe(true);
    expect(result.totalCount).toBe(2);
    expect(requests).toHaveLength(2);
    expect(requests[1].url).toBe(
      "https://www.amazon.com/hz/mycd/digital-console/ajax",
    );
    const body = new URLSearchParams(String(requests[1].init?.body));
    expect(body.get("activity")).toBe("GetContentOwnershipData");
    expect(body.get("clientId")).toBe("MYCD_WebService");
    expect(body.get("csrfToken")).toBe("synthetic-csrf-token");
    expect(JSON.parse(body.get("activityInput") || "{}")).toMatchObject({
      contentCategoryReference: "pdocs",
      contentType: "KindlePDoc",
      fetchCriteria: { startIndex: 0, batchSize: 25 },
    });
    // Public inventory output is bounded metadata/counts only: no shell or action URL leaks.
    expect(JSON.stringify(result)).not.toMatch(
      /csrf|session-id|redacted|\/hz\/mycd\/digital-console/i,
    );
  });

  it("walks book pages, deduplicates overlap, and stops at the final page", async () => {
    process.env.AMAZON_COOKIE = "session-id=redacted";
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) return new Response(shell, { status: 200 });
        if (calls === 2) {
          return new Response(
            ownership(
              [
                { asin: "B00PAGE0001", title: "First" },
                { asin: "B00PAGE0002", title: "Second" },
              ],
              true,
              3,
            ),
            { status: 200 },
          );
        }
        return new Response(
          ownership(
            [
              { asin: "B00PAGE0002", title: "Second duplicate" },
              { asin: "B00PAGE0003", title: "Third" },
            ],
            false,
            3,
          ),
          { status: 200 },
        );
      }),
    );

    const result = await executeContentList({ type: "books" });
    expect(result.items.map((item) => item.asin)).toEqual([
      "B00PAGE0001",
      "B00PAGE0002",
      "B00PAGE0003",
    ]);
    expect(result.totalCount).toBe(3);
    expect(result.truncated).toBe(false);
    expect(calls).toBe(3);
  });

  it.each([
    ["signed-out HTML", '<form id="ap_signin_form"></form>', "sign-in"],
    ["challenge HTML", "<title>Robot Check</title>", "challenge"],
  ])("rejects %s shell pages", async (_name, html, message) => {
    process.env.AMAZON_COOKIE = "session-id=redacted";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(html, { status: 200 })),
    );
    await expect(executeContentList({ type: "books" })).rejects.toThrow(
      message,
    );
  });

  it("rejects HTTP 200 semantic failures", async () => {
    process.env.AMAZON_COOKIE = "session-id=redacted";
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return new Response(
          calls === 1 ? shell : JSON.stringify({ success: false }),
          { status: 200 },
        );
      }),
    );
    await expect(executeContentList({ type: "books" })).rejects.toThrow(
      "successful GetContentOwnershipData",
    );
  });
});
