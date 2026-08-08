import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface WishlistBrowserAddOptions {
  asin?: string;
  query?: string;
  listName?: string;
  execute?: boolean;
}

export async function browserWishlistAdd(
  opts: WishlistBrowserAddOptions,
): Promise<Record<string, unknown>> {
  const root = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../scripts",
  );
  const script = join(root, "amazon-wishlist-add.py");
  const args = [script];
  if (opts.asin) args.push("--asin", opts.asin);
  if (opts.query) args.push("--query", opts.query);
  args.push("--list-name", opts.listName || "Shopping List");
  if (opts.execute) args.push("--execute");

  return await new Promise((resolve, reject) => {
    const proc = spawn(process.env.PYTHON || "python", args, {
      windowsHide: true,
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += String(d)));
    proc.stderr.on("data", (d) => (err += String(d)));
    proc.once("error", reject);
    proc.once("close", (code) => {
      try {
        const data = JSON.parse(out.trim()) as Record<string, unknown>;
        if (code !== 0 || data.ok === false)
          reject(new Error(String(data.error || err || code)));
        else resolve(data);
      } catch {
        reject(
          new Error(`wishlist browser helper exit=${code}: ${err || out}`),
        );
      }
    });
  });
}
