#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  "",
  ".cmd",
  ".env",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".ts",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const SKIP_PATHS = new Set(["pnpm-lock.yaml"]);
const RULES = [
  {
    id: "amazon-cookie-env",
    pattern: /AMAZON_COOKIES?\s*=\s*["']?([^\s"'\n]{24,})/gi,
  },
  {
    id: "amazon-session-cookie",
    pattern:
      /(?:session-id|session-token|at-main|x-main|ubid-main|sess-at-main|aws-waf-token)=([A-Za-z0-9._%+/=-]{20,})/gi,
  },
  {
    id: "amazon-csrf-token",
    pattern:
      /(?:anti-csrftoken-a2z|csrfToken)["'\s:=]+([A-Za-z0-9._%+/=-]{24,})/gi,
  },
  {
    id: "smtp-password",
    pattern: /SMTP_(?:PASS|PASSWORD)\s*=\s*["']?([^\s"'\n]{12,})/gi,
  },
  {
    id: "cookie-header",
    pattern: /\bCookie:\s*([^\n]{24,}=.+)/gi,
  },
];

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return (
    value.includes("<") ||
    value.includes(">") ||
    normalized.includes("example") ||
    normalized.includes("placeholder") ||
    normalized.includes("redacted") ||
    normalized.includes("your-") ||
    normalized.includes("test-token") ||
    normalized.includes("secret-cookie") ||
    normalized.includes("fresh-token")
  );
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

const findings = [];
for (const path of trackedFiles()) {
  if (SKIP_PATHS.has(path) || !TEXT_EXTENSIONS.has(extname(path).toLowerCase())) continue;
  let info;
  try {
    info = statSync(path);
  } catch {
    continue;
  }
  if (!info.isFile() || info.size > MAX_FILE_BYTES) continue;
  const buffer = readFileSync(path);
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const value = match[1] ?? "";
      if (!value || isPlaceholder(value)) continue;
      findings.push({
        path,
        line: lineNumber(text, match.index ?? 0),
        rule: rule.id,
      });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.path}:${finding.line}: potential secret (${finding.rule}); value omitted`);
  }
  process.exitCode = 1;
} else {
  console.log("Secret scan passed. No Amazon session, CSRF, or SMTP credentials detected.");
}
