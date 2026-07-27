import type { Risk } from "./lib.js";

export function emitLiveMutationWarning(route: string): void {
  process.stderr.write(`[WRITES TO LIVE AMAZON/KINDLE] ${route}\n`);
}

export function riskForMethod(method: string, mutates: boolean): Risk {
  if (!mutates) return "read";
  if (method === "DELETE") return "write-destructive";
  return "write-mutate";
}
