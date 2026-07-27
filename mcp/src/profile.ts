export const FULL_TOOL_NAMES = [
  "amazon_kindle_doctor",
  "amazon_kindle_auth_status",
  "amazon_kindle_auth_import",
  "amazon_kindle_wishlist_list",
  "amazon_kindle_send_plan",
  "amazon_kindle_send",
  "amazon_kindle_content_devices",
  "amazon_kindle_goodreads_sync_plan",
] as const;

export const CORE_TOOL_NAMES = [
  "amazon_kindle_doctor",
  "amazon_kindle_wishlist_list",
  "amazon_kindle_send_plan",
  "amazon_kindle_send",
  "amazon_kindle_goodreads_sync_plan",
] as const;

export type McpProfile = "full" | "core";
export function parseMcpProfile(v: string | undefined): McpProfile {
  if (v === "core") return "core";
  return "full";
}
