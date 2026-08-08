import { amazonNavigateHeaders } from "./httpHeaders.js";

export function cookieHeader(): string | undefined {
  return process.env.AMAZON_COOKIE || process.env.AMAZON_COOKIES || undefined;
}

export async function executeAmazonGet(
  url: string,
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
  const text = await res.text();
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    byteLength: text.length,
    requestAccepted: res.ok,
    mutationVerified: false,
    text,
    bodyPreview: text.slice(0, 200).replace(/\s+/g, " ").trim(),
  };
}
