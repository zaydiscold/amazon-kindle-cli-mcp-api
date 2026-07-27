import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { planKindleSend } from "../src/client/kindleSend.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("kindle send plan", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    delete process.env.KINDLE_EMAIL;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("defaults to dry-run with blockers when env missing", async () => {
    const dir = join(tmpdir(), "ak-test-" + Date.now());
    await mkdir(dir, { recursive: true });
    const f = join(dir, "book.epub");
    await writeFile(f, "epub-bytes");
    const plan = await planKindleSend({ files: [f] });
    expect(plan.dryRun).toBe(true);
    expect(plan.blockers.join(" ")).toMatch(/KINDLE_EMAIL|SMTP/);
  });

  it("accepts configured env without execute", async () => {
    process.env.KINDLE_EMAIL = "you@kindle.com";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    const dir = join(tmpdir(), "ak-test2-" + Date.now());
    await mkdir(dir, { recursive: true });
    const f = join(dir, "book.pdf");
    await writeFile(f, "pdf");
    const plan = await planKindleSend({ files: [f], execute: false });
    expect(plan.kindleEmail).toBe("you@kindle.com");
    expect(plan.smtpConfigured).toBe(true);
    expect(plan.dryRun).toBe(true);
  });
});
