import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function normalizeAsin(value: string): string {
  const asin = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error(`invalid ASIN: ${value}`);
  return asin;
}

export function wishlistApprovalTarget(listId: string | undefined): string {
  return listId?.trim() || "<default-list>";
}

export function requireExactApproval(
  label: string,
  actual: string,
  approved: string | undefined,
): void {
  if (!approved?.trim()) throw new Error(`${label} approval is required for execute`);
  if (approved.trim() !== actual) throw new Error(`${label} approval mismatch`);
}

export async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function fileApprovalHashes(paths: string[]): Promise<string[]> {
  return Promise.all(paths.map((path) => sha256File(path)));
}

export function requireFileHashApprovals(actual: string[], approved: string[] | undefined): void {
  const expected = [...actual].sort();
  const supplied = [...(approved ?? [])].map((value) => value.trim()).filter(Boolean).sort();
  if (supplied.length === 0) {
    throw new Error("approvedFileSha256 is required for execute");
  }
  if (expected.length !== supplied.length || expected.some((value, index) => supplied[index] !== value)) {
    throw new Error("approvedFileSha256 mismatch");
  }
}
