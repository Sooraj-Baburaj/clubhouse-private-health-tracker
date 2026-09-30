export interface ConsistencyInput {
  /** Days in the week considered so far (1–7). */
  days: number;
  daysWithFoodLog: number;
  daysInCalorieBand: number;
  /** Activity plan sessions done / planned this week; null when the member has no plan. */
  planDone: number | null;
  planTarget: number | null;
}

export type ConsistencyWord = 'solid' | 'building' | 'rough week';

export interface ConsistencyResult {
  score: number;
  word: ConsistencyWord;
  components: { logging: number; inBand: number; plan: number };
}

/** SYS-CALC-33: 40 % days with any food log + 30 % days inside the calorie band + 30 % activity plan adherence. */
export function consistencyScore(input: ConsistencyInput): ConsistencyResult {
  const days = Math.max(1, input.days);
  const logging = Math.min(1, input.daysWithFoodLog / days);
  const inBand = Math.min(1, input.daysInCalorieBand / days);
  // Without a plan the plan component follows the logging share so members aren't penalised.
  const plan = input.planTarget && input.planTarget > 0 ? Math.min(1, (input.planDone ?? 0) / input.planTarget) : logging;
  const score = Math.round(100 * (0.4 * logging + 0.3 * inBand + 0.3 * plan));
  return { score, word: consistencyWord(score), components: { logging: Math.round(logging * 100), inBand: Math.round(inBand * 100), plan: Math.round(plan * 100) } };
}

export function consistencyWord(score: number): ConsistencyWord {
  if (score >= 75) return 'solid';
  if (score >= 45) return 'building';
  return 'rough week';
}
