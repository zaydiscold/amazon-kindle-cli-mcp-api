export type Risk = "read" | "write-safe" | "write-mutate" | "write-destructive";

export interface CommandEnvelope<T = unknown> {
  ok: boolean;
  capability: string;
  risk: Risk;
  data: T;
  warnings?: string[];
  meta?: Record<string, unknown>;
}

export function envelope<T>(
  capability: string,
  risk: Risk,
  data: T,
  extra: { warnings?: string[]; meta?: Record<string, unknown>; ok?: boolean } = {},
): CommandEnvelope<T> {
  return {
    ok: extra.ok ?? true,
    capability,
    risk,
    data,
    warnings: extra.warnings,
    meta: extra.meta,
  };
}

export function printJson(value: unknown, pretty = false): void {
  process.stdout.write(JSON.stringify(value, null, pretty ? 2 : undefined) + "\n");
}
