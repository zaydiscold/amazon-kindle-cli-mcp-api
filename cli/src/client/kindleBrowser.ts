import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface BrowserSendOptions {
  files: string[];
  execute?: boolean;
  archive?: boolean;
  cdp?: string;
}

function scriptPath(): string {
  // dist/client → cli/dist/client; repo root is three parents from here.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "../../../scripts/kindle-browser-upload.py");
}

export async function browserSendToKindle(opts: BrowserSendOptions): Promise<Record<string, unknown>> {
  const py = process.env.PYTHON || "python";
  const args = [scriptPath(), ...opts.files];
  if (opts.execute) args.push("--execute");
  if (opts.archive === false) args.push("--no-archive");
  if (opts.cdp) args.push("--cdp", opts.cdp);

  return await new Promise((resolve, reject) => {
    const proc = spawn(py, args, { windowsHide: true });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += String(d)));
    proc.stderr.on("data", (d) => (err += String(d)));
    proc.once("error", reject);
    proc.once("close", (code) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(out.trim());
      } catch {
        reject(new Error(`kindle browser uploader exit=${code}; stdout=${out.slice(0, 500)} stderr=${err.slice(0, 500)}`));
        return;
      }
      if (code !== 0 || data.ok === false) {
        reject(new Error(`kindle browser uploader failed: ${String(data.error || err || code)}`));
        return;
      }
      resolve(data);
    });
  });
}
