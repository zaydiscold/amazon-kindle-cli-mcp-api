import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authVerify } from "../src/engine.js";

const originalCookie = process.env.AMAZON_COOKIE;

beforeEach(() => {
  process.env.AMAZON_COOKIE = "session-id=test; at-main=test";
});

afterEach(() => {
  if (originalCookie === undefined) delete process.env.AMAZON_COOKIE;
  else process.env.AMAZON_COOKIE = originalCookie;
});

describe("auth verify", () => {
  it("reports retail and Kindle authentication independently", async () => {
    const result = await authVerify(
      { listId: "TESTLIST" },
      {
        wishlist: async () => {
          throw new Error("wishlist list redirect 302 — refresh AMAZON_COOKIE");
        },
        kindle: async () => ({ status: 200, docs: { items: [] } }),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.data).toMatchObject({
      persistedSessionPresent: true,
      retailAuthenticated: false,
      kindleAuthenticated: true,
      refreshRequired: true,
    });
  });

  it("passes only when both retail and Kindle HTTP surfaces are authenticated", async () => {
    const result = await authVerify(
      { listId: "TESTLIST" },
      {
        wishlist: async () => ({
          items: [{ asin: "B000000001" }],
          pagesFetched: 1,
        }),
        kindle: async () => ({ status: 200, docs: { items: [] } }),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      persistedSessionPresent: true,
      retailAuthenticated: true,
      kindleAuthenticated: true,
      refreshRequired: false,
    });
  });
});
