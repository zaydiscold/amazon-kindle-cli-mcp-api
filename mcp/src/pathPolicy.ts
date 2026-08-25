import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

function configuredRoot(): string {
  return realpathSync(
    resolve(process.env.AMAZON_KINDLE_MCP_FILE_ROOT || process.cwd()),
  );
}

export function resolveMcpFile(value: string): string {
  const root = configuredRoot();
  const requested = value.trim();
  if (!requested) throw new Error("MCP file path is required");
  const candidate = realpathSync(
    isAbsolute(requested) ? requested : resolve(root, requested),
  );
  if (process.env.AMAZON_KINDLE_MCP_ALLOW_ARBITRARY_FILES === "1") {
    return candidate;
  }
  const rel = relative(root, candidate);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return candidate;
  }
  throw new Error(
    "MCP file access is restricted to AMAZON_KINDLE_MCP_FILE_ROOT; set the root explicitly for owned books or fixtures",
  );
}

export function resolveOptionalMcpFile(
  value: string | undefined,
): string | undefined {
  return value ? resolveMcpFile(value) : undefined;
}
