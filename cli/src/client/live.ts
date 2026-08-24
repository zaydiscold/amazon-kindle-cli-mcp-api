import { amazonNavigateHeaders } from "./httpHeaders.js";
import {
  assertTrustedAmazonUrl,
  TRUSTED_AMAZON_ORIGIN,
} from "./trustedAmazon.js";

const MAX_AMAZON_RESPONSE_BYTES = 8 * 1024 * 1024;

export function cookieHeader(): string | undefined {
  return process.env.AMAZON_COOKIE || process.env.AMAZON_COOKIES || undefined;
}

export async function readBoundedText(
  response: Response,
  limit = MAX_AMAZON_RESPONSE_BYTES,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new Error(`Amazon response exceeded ${limit} bytes`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`Amazon response exceeded ${limit} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validateRedirect(response: Response, requestUrl: URL): void {
  if (response.status < 300 || response.status >= 400) return;
  const location = response.headers.get("location");
  if (!location) return;
  const redirect = new URL(location, requestUrl);
  if (redirect.origin !== TRUSTED_AMAZON_ORIGIN) {
    throw new Error(
      `Amazon returned a cross-origin redirect to ${redirect.origin}`,
    );
  }
}

export async function executeAmazonGet(
  value: string,
  authenticated = true,
): Promise<{
  status: number;
  contentType: string;
  byteLength: number;
  requestAccepted: boolean;
  mutationVerified: false;
  text: string;
  bodyPreview: string;
}> {
  const url = assertTrustedAmazonUrl(value);
  let headers: Record<string, string> = {
    "user-agent":
      process.env.AMAZON_HTTP_USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
  };
  if (authenticated) {
    const cookie = cookieHeader();
    if (!cookie) {
      throw new Error(
        "AMAZON_COOKIE is required (source ~/.amazon/auth.sh or auth import)",
      );
    }
    headers = amazonNavigateHeaders(cookie);
  }
  const res = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  validateRedirect(res, url);
  const text = await readBoundedText(res);
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    byteLength: Buffer.byteLength(text),
    requestAccepted: res.ok,
    mutationVerified: false,
    text,
    bodyPreview: text.slice(0, 200).replace(/\s+/g, " ").trim(),
  };
}
