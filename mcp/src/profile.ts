export const FULL_TOOL_NAMES = [
  "amazon_kindle_doctor",
  "amazon_kindle_auth_status",
  "amazon_kindle_auth_verify",
  "amazon_kindle_auth_import",
  "amazon_kindle_wishlist_list",
  "amazon_kindle_wishlist_add",
  "amazon_kindle_send_plan",
  "amazon_kindle_send",
  "amazon_kindle_recent_docs",
  "amazon_kindle_content_devices",
  "amazon_kindle_books",
  "amazon_kindle_pdocs",
  "amazon_kindle_goodreads_sync_plan",
  "amazon_kindle_parity",
  "amazon_kindle_books_resolve",
  "amazon_kindle_add_plan",
] as const;

export type AmazonKindleToolName = (typeof FULL_TOOL_NAMES)[number];

export const READ_TOOL_NAMES = [
  "amazon_kindle_doctor",
  "amazon_kindle_auth_status",
  "amazon_kindle_auth_verify",
  "amazon_kindle_wishlist_list",
  "amazon_kindle_send_plan",
  "amazon_kindle_recent_docs",
  "amazon_kindle_content_devices",
  "amazon_kindle_books",
  "amazon_kindle_pdocs",
  "amazon_kindle_goodreads_sync_plan",
  "amazon_kindle_parity",
  "amazon_kindle_books_resolve",
  "amazon_kindle_add_plan",
] as const satisfies readonly AmazonKindleToolName[];

export const CORE_TOOL_NAMES = [
  ...READ_TOOL_NAMES,
  "amazon_kindle_wishlist_add",
  "amazon_kindle_send",
] as const satisfies readonly AmazonKindleToolName[];

export type McpProfile = "full" | "core" | "read";

export function parseMcpProfile(value: string | undefined): McpProfile {
  const profile = value?.trim() || "read";
  if (profile === "full" || profile === "core" || profile === "read")
    return profile;
  throw new Error(
    `AMAZON_KINDLE_MCP_PROFILE must be one of full, core, read (received ${JSON.stringify(profile)})`,
  );
}

export function toolsForProfile(
  profile: McpProfile,
): ReadonlySet<AmazonKindleToolName> {
  if (profile === "full") return new Set(FULL_TOOL_NAMES);
  if (profile === "core") return new Set(CORE_TOOL_NAMES);
  return new Set(READ_TOOL_NAMES);
}
