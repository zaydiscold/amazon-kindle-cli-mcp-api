/** Shared browser-shaped HTTP headers for Amazon's web surface.
 *
 * Amazon accepts the authenticated cookie only with a conventional browser request
 * profile; a custom agent UA is redirected to signin even when the same cookie is valid.
 * This is still raw HTTP — no CDP/UI product transport.
 */
export const AMAZON_HTTP_UA =
  process.env.AMAZON_HTTP_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

export function amazonNavigateHeaders(cookie: string, referer = "https://www.amazon.com/"): Record<string, string> {
  return {
    cookie,
    "user-agent": AMAZON_HTTP_UA,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "upgrade-insecure-requests": "1",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    referer,
  };
}

export function amazonXhrHeaders(cookie: string, referer: string): Record<string, string> {
  return {
    cookie,
    "user-agent": AMAZON_HTTP_UA,
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "x-requested-with": "XMLHttpRequest",
    origin: "https://www.amazon.com",
    referer,
  };
}
