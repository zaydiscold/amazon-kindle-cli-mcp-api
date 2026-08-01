import { spawnSync } from "node:child_process";

const candidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
let last;
for (const command of candidates) {
  const result = spawnSync(command, ["scripts/test_brave_amazon_login.py"], {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
  });
  if (!result.error || result.error.code !== "ENOENT") {
    process.exit(result.status ?? 1);
  }
  last = result.error;
}
console.error(`Python interpreter not found: ${last?.message || "unknown error"}`);
process.exit(1);
