import type { Pricing } from './types';

export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** ADM-AI-04: cost per call from the price row in force when the call was made. */
export function costOf(usage: UsageLike, p: Pricing | null): number {
  if (!p) return 0;
  const m = 1_000_000;
  const cost =
    ((usage.input_tokens ?? 0) * p.inputPerMtok +
      (usage.output_tokens ?? 0) * p.outputPerMtok +
      (usage.cache_read_input_tokens ?? 0) * p.cacheReadPerMtok +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWritePerMtok) /
    m;
  return Math.round(cost * 1e6) / 1e6;
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
