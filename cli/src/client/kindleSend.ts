import nodemailer from "nodemailer";
import { basename } from "node:path";
import { readFile, stat } from "node:fs/promises";

const SUPPORTED = new Set([
  ".epub",
  ".pdf",
  ".txt",
  ".rtf",
  ".htm",
  ".html",
  ".png",
  ".gif",
  ".jpg",
  ".jpeg",
  ".bmp",
  ".docx",
  ".doc",
]);

export interface KindleSendOptions {
  files: string[];
  kindleEmail?: string;
  execute?: boolean;
  dryRun?: boolean;
}

export interface KindleSendPlan {
  dryRun: boolean;
  execute: boolean;
  kindleEmail: string | null;
  files: Array<{ path: string; bytes: number; ext: string }>;
  smtpConfigured: boolean;
  blockers: string[];
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export async function planKindleSend(
  opts: KindleSendOptions,
): Promise<KindleSendPlan> {
  const kindleEmail =
    opts.kindleEmail ||
    env("KINDLE_EMAIL") ||
    env("KINDLE_SEND_ADDRESS") ||
    null;
  const smtpConfigured = Boolean(
    env("SMTP_HOST") &&
    env("SMTP_USER") &&
    (env("SMTP_PASS") || env("SMTP_PASSWORD")),
  );
  const blockers: string[] = [];
  if (!kindleEmail)
    blockers.push(
      "KINDLE_EMAIL / --kindle-email required (you_xxx@kindle.com)",
    );
  if (!smtpConfigured)
    blockers.push("SMTP_HOST + SMTP_USER + SMTP_PASS required");
  if (!opts.files.length) blockers.push("at least one file path required");
  if (opts.files.length > 25)
    blockers.push("Amazon Send-to-Kindle email max is 25 attachments");

  const files: KindleSendPlan["files"] = [];
  let total = 0;
  for (const p of opts.files) {
    const st = await stat(p);
    const ext = p.toLowerCase().slice(p.lastIndexOf("."));
    if (!SUPPORTED.has(ext))
      blockers.push(`unsupported extension: ${ext} (${p})`);
    total += st.size;
    files.push({ path: p, bytes: st.size, ext });
  }
  if (total > 50 * 1024 * 1024)
    blockers.push(`combined size ${total} exceeds ~50MB email limit`);

  const dryRun = opts.dryRun || !opts.execute || blockers.length > 0;
  return {
    dryRun,
    execute: !dryRun,
    kindleEmail,
    files,
    smtpConfigured,
    blockers,
  };
}

export async function executeKindleSend(opts: KindleSendOptions) {
  const plan = await planKindleSend(opts);
  if (plan.dryRun || !plan.execute) {
    return { submitted: false, plan };
  }
  const host = env("SMTP_HOST")!;
  const port = Number(env("SMTP_PORT") || "587");
  const user = env("SMTP_USER")!;
  const pass = (env("SMTP_PASS") || env("SMTP_PASSWORD"))!;
  const from = env("SMTP_FROM") || user;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const attachments = await Promise.all(
    plan.files.map(async (f) => ({
      filename: basename(f.path),
      content: await readFile(f.path),
    })),
  );

  const info = await transporter.sendMail({
    from,
    to: plan.kindleEmail!,
    subject:
      plan.files.length === 1
        ? basename(plan.files[0].path)
        : `Send to Kindle (${plan.files.length} files)`,
    text: "Sent by amazon-kindle-cli",
    attachments,
  });

  return {
    submitted: true,
    plan,
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    mutationVerified: false as const,
    verificationRequired:
      "Open Kindle app / Manage Your Content and Devices → Docs and confirm the file appears",
  };
}
