/**
 * Send to Kindle via amazon.com/sendtokindle web upload (no SMTP).
 *
 * Flow (sniffed 2026-07-27 on Brave CDP):
 *  1. GET  /sendtokindle                 → CSRF anti-csrftoken-a2z meta/header
 *  2. POST /sendtokindle/init            → { uploadUrl, stkToken? }
 *  3. PUT  uploadUrl                     → raw file bytes (content-type = mime)
 *  4. POST /sendtokindle/send-v2         → finalize { status: true }
 *  5. GET  /sendtokindle/recent-docs     → poll status IN_PROGRESS → COMPLETE
 *
 * Requires AMAZON_COOKIE. Dry-run by default.
 */
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { cookieHeader } from "./live.js";
import { amazonXhrHeaders } from "./httpHeaders.js";

const MIME: Record<string, string> = {
  ".epub": "application/epub+zip",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".rtf": "application/rtf",
};

export interface WebUploadOptions {
  files: string[];
  execute?: boolean;
  dryRun?: boolean;
  archive?: boolean; // add to library (default true)
  title?: string;
}

/** Git Bash passes /c/foo as C:\\c\\foo to native Node; repair it. */
function nativePath(input: string): string {
  const m = input.match(/^C:\\c\\(.+)$/i);
  if (m) return `C:\\${m[1]}`;
  return input;
}

async function amazonFetch(
  url: string,
  init: RequestInit & { csrf?: string } = {},
): Promise<Response> {
  const cookie = cookieHeader();
  if (!cookie) throw new Error("AMAZON_COOKIE required for web upload");
  const headers = new Headers(amazonXhrHeaders(cookie, "https://www.amazon.com/sendtokindle"));
  for (const [key, value] of Object.entries(init.headers || {})) headers.set(key, value);
  if (init.csrf) headers.set("anti-csrftoken-a2z", init.csrf);
  return fetch(url, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(120_000) });
}

export async function extractSendToKindleCsrf(): Promise<string> {
  const res = await amazonFetch("https://www.amazon.com/sendtokindle");
  const html = await res.text();
  // Send-to-Kindle's own JS calls dndUtils.getCsrfToken(), which reads exactly
  // `<input name="csrfToken" value="…">`. Prefer it over generic Amazon navbar tokens.
  const m =
    html.match(/<input[^>]+name=["']csrfToken["'][^>]+value=["']([^"']+)["']/i) ||
    html.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["']csrfToken["']/i) ||
    html.match(/anti-csrftoken-a2z&quot;:&quot;([^&]+)/i) ||
    html.match(/anti-csrftoken-a2z["'\\s:]+["']([^"']{20,})/i);
  if (!m) {
    throw new Error("could not extract anti-csrftoken-a2z from /sendtokindle");
  }
  return m[1].replace(/\\u002F/g, "/");
}

export async function planWebUpload(opts: WebUploadOptions) {
  const files = [];
  for (const rawPath of opts.files) {
    const p = nativePath(rawPath);
    const st = await stat(p);
    const ext = p.toLowerCase().slice(p.lastIndexOf("."));
    if (!MIME[ext]) throw new Error(`unsupported extension ${ext}`);
    files.push({ path: p, bytes: st.size, ext, mime: MIME[ext], name: basename(p) });
  }
  const dryRun = opts.dryRun || !opts.execute;
  return {
    dryRun,
    execute: !dryRun,
    route: "POST /sendtokindle/init → PUT uploadUrl → POST /sendtokindle/send-v2",
    archive: opts.archive !== false,
    files,
    cookiePresent: Boolean(cookieHeader()),
  };
}

export async function executeWebUpload(opts: WebUploadOptions) {
  const plan = await planWebUpload(opts);
  if (plan.dryRun) return { submitted: false, plan };

  const csrf = await extractSendToKindleCsrf();
  const results = [];

  for (const f of plan.files) {
    const bytes = await readFile(f.path);
    const initRes = await amazonFetch("https://www.amazon.com/sendtokindle/init", {
      method: "POST",
      csrf,
      headers: { "content-type": "application/json", accept: "application/json", "x-requested-with": "XMLHttpRequest" },
      body: JSON.stringify({
        fileSize: f.bytes,
        contentType: f.mime,
        appVersion: "1.0",
        appName: "drag_drop_web",
        fileExtension: f.ext.replace(".", ""),
      }),
    });
    const initJson = (await initRes.json()) as {
      uploadUrl?: string;
      stkToken?: string;
      token?: string;
      [k: string]: unknown;
    };
    if (!initRes.ok || !initJson.uploadUrl) {
      results.push({ file: f.name, ok: false, stage: "init", status: initRes.status, body: initJson });
      continue;
    }

    const putRes = await fetch(initJson.uploadUrl, {
      method: "PUT",
      headers: { "content-type": f.mime },
      body: bytes,
      signal: AbortSignal.timeout(300_000),
    });
    if (!putRes.ok) {
      results.push({ file: f.name, ok: false, stage: "put", status: putRes.status });
      continue;
    }

    // stkToken often returned as CAS_TOKEN|docId|ts embedded in upload flow
    const stkToken =
      (initJson.stkToken as string) ||
      (initJson.token as string) ||
      // parse doc id from upload URL path
      (() => {
        const m = String(initJson.uploadUrl).match(/kindle-docs-cas\/[a-f0-9]+\/([A-F0-9]{32})\//i);
        const docId = m?.[1];
        if (!docId) return "";
        return `CAS_TOKEN|${docId}|${Date.now()}`;
      })();

    const title =
      opts.title ||
      f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

    const sendBody = {
      extName: "drag_drop_web",
      inputFormat: f.ext.replace(".", ""),
      extVersion: "1.0",
      stkToken,
      title,
      dataType: f.mime,
      stkGuid: "",
      archive: plan.archive,
      fileSize: f.bytes,
      forceConvert: "false",
      inputFileName: f.name,
    };

    const sendRes = await amazonFetch("https://www.amazon.com/sendtokindle/send-v2", {
      method: "POST",
      csrf,
      headers: { "content-type": "application/json", accept: "application/json", "x-requested-with": "XMLHttpRequest" },
      body: JSON.stringify(sendBody),
    });
    const sendJson = await sendRes.json().catch(() => ({}));
    results.push({
      file: f.name,
      ok: sendRes.ok && (sendJson as { status?: boolean }).status === true,
      stage: "send-v2",
      status: sendRes.status,
      send: sendJson,
      stkTokenPreview: stkToken.slice(0, 24) + "…",
    });
  }

  // recent docs snapshot
  let recent: unknown = null;
  try {
    const r = await amazonFetch("https://www.amazon.com/sendtokindle/recent-docs", {
      headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest" },
    });
    recent = await r.json();
  } catch {
    /* ignore */
  }

  return {
    submitted: results.some((r) => r.ok),
    plan,
    results,
    recent,
    mutationVerified: false as const,
    verificationRequired: "Poll kindle send status / open Kindle library or recent-docs until COMPLETE",
  };
}

export async function recentDocs(limit?: number) {
  const r = await amazonFetch("https://www.amazon.com/sendtokindle/recent-docs", {
    headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest" },
  });
  const docs = await r.json();
  if (!Array.isArray(docs) || limit === undefined) return { status: r.status, docs, truncated: false };
  return { status: r.status, docs: docs.slice(0, limit), truncated: docs.length > limit };
}
