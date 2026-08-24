/**
 * Send to Kindle via amazon.com/sendtokindle web upload (no SMTP).
 * Requires AMAZON_COOKIE. Dry-run by default.
 */
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { cookieHeader, readBoundedText } from "./live.js";
import { amazonXhrHeaders } from "./httpHeaders.js";
import {
  assertTrustedAmazonUrl,
  trustedPresignedUploadUrl,
  TRUSTED_AMAZON_ORIGIN,
} from "./trustedAmazon.js";

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
  archive?: boolean;
  title?: string;
}

function nativePath(input: string): string {
  const match = input.match(/^C:\\c\\(.+)$/i);
  return match ? `C:\\${match[1]}` : input;
}

async function amazonFetch(
  value: string,
  init: RequestInit & { csrf?: string } = {},
): Promise<Response> {
  const url = assertTrustedAmazonUrl(value);
  const cookie = cookieHeader();
  if (!cookie) throw new Error("AMAZON_COOKIE required for web upload");
  const headers = new Headers(amazonXhrHeaders(cookie, `${TRUSTED_AMAZON_ORIGIN}/sendtokindle`));
  for (const [key, headerValue] of Object.entries(init.headers || {})) {
    if (headerValue !== undefined) headers.set(key, String(headerValue));
  }
  if (init.csrf) headers.set("anti-csrftoken-a2z", init.csrf);
  const response = await fetch(url, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  });
  const location = response.headers.get("location");
  if (location && response.status >= 300 && response.status < 400) {
    const redirect = new URL(location, url);
    if (redirect.origin !== TRUSTED_AMAZON_ORIGIN) {
      throw new Error(`Send-to-Kindle returned a cross-origin redirect to ${redirect.origin}`);
    }
  }
  return response;
}

async function boundedJson(response: Response): Promise<unknown> {
  const text = await readBoundedText(response);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Send-to-Kindle returned invalid JSON (HTTP ${response.status}); body omitted`);
  }
}

export async function extractSendToKindleCsrf(): Promise<string> {
  const response = await amazonFetch(`${TRUSTED_AMAZON_ORIGIN}/sendtokindle`);
  const html = await readBoundedText(response);
  const match =
    html.match(/<input[^>]+name=["']csrfToken["'][^>]+value=["']([^"']+)["']/i) ||
    html.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["']csrfToken["']/i) ||
    html.match(/anti-csrftoken-a2z&quot;:&quot;([^&]+)/i) ||
    html.match(/anti-csrftoken-a2z["'\\s:]+["']([^"']{20,})/i);
  if (!match?.[1]) throw new Error("could not extract Send-to-Kindle CSRF token");
  return match[1].replace(/\\u002F/g, "/");
}

export async function planWebUpload(opts: WebUploadOptions) {
  if (!opts.files.length) throw new Error("at least one file is required");
  if (opts.files.length > 25) throw new Error("Send-to-Kindle accepts at most 25 files per request");
  const files = [];
  let totalBytes = 0;
  for (const rawPath of opts.files) {
    const path = nativePath(rawPath);
    const info = await stat(path);
    if (!info.isFile()) throw new Error("Send-to-Kindle input must be a file");
    const extension = path.toLowerCase().slice(path.lastIndexOf("."));
    if (!MIME[extension]) throw new Error(`unsupported extension ${extension}`);
    totalBytes += info.size;
    files.push({
      path,
      bytes: info.size,
      ext: extension,
      mime: MIME[extension],
      name: basename(path),
    });
  }
  if (totalBytes > 200 * 1024 * 1024) throw new Error("Send-to-Kindle batch exceeds 200 MB");
  const dryRun = Boolean(opts.dryRun || !opts.execute);
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
  const results: Array<Record<string, unknown>> = [];

  for (const file of plan.files) {
    const bytes = await readFile(file.path);
    const initResponse = await amazonFetch(`${TRUSTED_AMAZON_ORIGIN}/sendtokindle/init`, {
      method: "POST",
      csrf,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify({
        fileSize: file.bytes,
        contentType: file.mime,
        appVersion: "1.0",
        appName: "drag_drop_web",
        fileExtension: file.ext.replace(".", ""),
      }),
    });
    const initJson = (await boundedJson(initResponse)) as {
      uploadUrl?: string;
      stkToken?: string;
      token?: string;
    };
    if (!initResponse.ok || !initJson.uploadUrl) {
      results.push({ file: file.name, ok: false, stage: "init", status: initResponse.status });
      continue;
    }

    let uploadUrl: string;
    try {
      uploadUrl = trustedPresignedUploadUrl(initJson.uploadUrl);
    } catch {
      results.push({ file: file.name, ok: false, stage: "upload-url", error: "untrusted upload host" });
      continue;
    }
    const putResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.mime },
      body: bytes,
      redirect: "error",
      signal: AbortSignal.timeout(300_000),
    });
    if (!putResponse.ok) {
      results.push({ file: file.name, ok: false, stage: "put", status: putResponse.status });
      continue;
    }

    const stkToken =
      initJson.stkToken ||
      initJson.token ||
      (() => {
        const match = uploadUrl.match(/kindle-docs-cas\/[a-f0-9]+\/([A-F0-9]{32})\//i);
        return match?.[1] ? `CAS_TOKEN|${match[1]}|${Date.now()}` : "";
      })();
    const title =
      opts.title ||
      file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

    const sendResponse = await amazonFetch(`${TRUSTED_AMAZON_ORIGIN}/sendtokindle/send-v2`, {
      method: "POST",
      csrf,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify({
        extName: "drag_drop_web",
        inputFormat: file.ext.replace(".", ""),
        extVersion: "1.0",
        stkToken,
        title,
        dataType: file.mime,
        stkGuid: "",
        archive: plan.archive,
        fileSize: file.bytes,
        forceConvert: "false",
        inputFileName: file.name,
      }),
    });
    const sendJson = (await boundedJson(sendResponse)) as { status?: boolean };
    results.push({
      file: file.name,
      ok: sendResponse.ok && sendJson.status === true,
      stage: "send-v2",
      status: sendResponse.status,
      stkTokenPresent: Boolean(stkToken),
      responseBodyOmitted: true,
    });
  }

  let recent: unknown = null;
  try {
    const response = await amazonFetch(`${TRUSTED_AMAZON_ORIGIN}/sendtokindle/recent-docs`, {
      headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest" },
    });
    recent = await boundedJson(response);
  } catch {
    // Independent verification remains optional and bounded.
  }

  return {
    submitted: results.some((result) => result.ok === true),
    plan,
    results,
    recent,
    mutationVerified: false as const,
    verificationRequired: "Poll Send-to-Kindle status or open the Kindle library until the document is COMPLETE",
  };
}

export async function recentDocs(limit?: number) {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
    throw new Error("limit must be an integer from 1 through 500");
  }
  const response = await amazonFetch(`${TRUSTED_AMAZON_ORIGIN}/sendtokindle/recent-docs`, {
    headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest" },
  });
  const docs = await boundedJson(response);
  if (!Array.isArray(docs) || limit === undefined) {
    return { status: response.status, docs, truncated: false };
  }
  return {
    status: response.status,
    docs: docs.slice(0, limit),
    truncated: docs.length > limit,
  };
}
