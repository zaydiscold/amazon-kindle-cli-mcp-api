export const TRUSTED_AMAZON_ORIGIN = "https://www.amazon.com";

function isAmazonUploadHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "amazonaws.com" || host.endsWith(".amazonaws.com");
}

export function assertTrustedAmazonUrl(
  value: string,
  options: { allowPresignedUpload?: boolean } = {},
): URL {
  let url: URL;
  try {
    url = new URL(value, TRUSTED_AMAZON_ORIGIN);
  } catch {
    throw new Error("invalid Amazon URL");
  }
  if (url.username || url.password) {
    throw new Error("Amazon URLs must not contain embedded credentials");
  }
  if (url.protocol !== "https:") {
    throw new Error("Amazon requests require HTTPS");
  }
  if (url.origin === TRUSTED_AMAZON_ORIGIN) return url;
  if (options.allowPresignedUpload && isAmazonUploadHost(url.hostname)) return url;
  throw new Error(
    `Amazon requests are restricted to ${TRUSTED_AMAZON_ORIGIN}` +
      (options.allowPresignedUpload ? " or an Amazon S3 upload host" : ""),
  );
}

export function trustedAmazonUrl(value: string): string {
  return assertTrustedAmazonUrl(value).toString();
}

export function trustedPresignedUploadUrl(value: string): string {
  return assertTrustedAmazonUrl(value, { allowPresignedUpload: true }).toString();
}
