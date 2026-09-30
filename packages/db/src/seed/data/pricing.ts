/**
 * Anthropic list prices per million tokens as of September 2026 (Appendix B; verify on the pricing page before launch).
 * Cache writes are 1.25 × input; cache reads are 0.1 × input.
 */
export const PRICING_SEED = [
  { model: 'claude-sonnet-5-5', effectiveFrom: '2026-09-01', inputPerMtok: 2.0, outputPerMtok: 10.0, cacheReadPerMtok: 0.2, cacheWritePerMtok: 2.5 },
  { model: 'claude-haiku-4-5', effectiveFrom: '2026-09-01', inputPerMtok: 1.0, outputPerMtok: 5.0, cacheReadPerMtok: 0.1, cacheWritePerMtok: 1.25 },
];

export const DEFAULT_AI_FEATURES: Record<string, { on: boolean; model: string; dailyCap: number }> = {
  'food.photo': { on: true, model: 'claude-sonnet-5-5', dailyCap: 15 },
  'food.text': { on: true, model: 'claude-sonnet-5-5', dailyCap: 20 },
  'home.summary': { on: true, model: 'claude-sonnet-5-5', dailyCap: 24 },
  'progress.narrative': { on: true, model: 'claude-sonnet-5-5', dailyCap: 4 },
  'diet.draft': { on: true, model: 'claude-sonnet-5-5', dailyCap: 10 },
};

export const DEFAULT_AI_BUDGET = { monthlyCapUsd: 30, alertAtPercent: 80, atCapBehaviour: 'disable' as const };
