import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  assertTrustedAmazonUrl,
  trustedPresignedUploadUrl,
} from "../src/client/trustedAmazon.js";
import { kindleSend, wishlistAdd } from "../src/engine.js";

describe("release hardening", () => {
  it("accepts only trusted Amazon retail and upload origins", () => {
    expect(assertTrustedAmazonUrl("/hz/wishlist/ls").origin).toBe(
      "https://www.amazon.com",
    );
    expect(() =>
      assertTrustedAmazonUrl("https://www.amazon.com.attacker.invalid/capture"),
    ).toThrow("restricted");
    expect(() =>
      assertTrustedAmazonUrl("http://www.amazon.com/hz/wishlist/ls"),
    ).toThrow("HTTPS");
    expect(() =>
      assertTrustedAmazonUrl("https://user:pass@www.amazon.com/hz/wishlist/ls"),
    ).toThrow("embedded credentials");
    expect(
      trustedPresignedUploadUrl("https://bucket.s3.amazonaws.com/object"),
    ).toContain("amazonaws.com");
    expect(() =>
      trustedPresignedUploadUrl("https://uploads.attacker.invalid/object"),
    ).toThrow("restricted");
  });

  it("emits exact wishlist approvals and blocks unapproved execution before HTTP", async () => {
    const preview = await wishlistAdd({
      asin: "B0DSGQ5XPS",
      listId: "LIST123456",
      execute: false,
    });
    expect(preview.data).toMatchObject({
      submitted: false,
      requiredApprovals: {
        approvedAsin: "B0DSGQ5XPS",
        approvedListId: "LIST123456",
      },
    });
    await expect(
      wishlistAdd({ asin: "B0DSGQ5XPS", listId: "LIST123456", execute: true }),
    ).rejects.toThrow("approvedAsin approval is required");
    await expect(
      wishlistAdd({
        asin: "B0DSGQ5XPS",
        listId: "LIST123456",
        approvedAsin: "B000000000",
        approvedListId: "LIST123456",
        execute: true,
      }),
    ).rejects.toThrow("approvedAsin approval mismatch");
  });

  it("binds Send-to-Kindle execution to exact file hashes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kindle-release-"));
    const file = join(dir, "owned.epub");
    await writeFile(file, "owned test book");

    const preview = await kindleSend({
      files: [file],
      via: "web",
      execute: false,
    });
    const data = preview.data as {
      requiredApprovals: { approvedFileSha256: string[] };
    };
    expect(data.requiredApprovals.approvedFileSha256).toHaveLength(1);
    expect(data.requiredApprovals.approvedFileSha256[0]).toMatch(
      /^[a-f0-9]{64}$/,
    );

    await expect(
      kindleSend({ files: [file], via: "web", execute: true }),
    ).rejects.toThrow("approvedFileSha256 is required");
  });
});
