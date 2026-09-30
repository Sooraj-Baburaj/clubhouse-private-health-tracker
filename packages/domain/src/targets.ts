import type { ActivityLevel, GoalType, Sex } from '@clubhouse/contracts';
import {
  ACTIVITY_FACTORS,
  CALORIE_FLOOR,
  GAIN_KCAL_PER_KG_WEEK,
  LOSE_KCAL_PER_KG_WEEK,
  MAX_PACE_KG_PER_WEEK,
  RECOMPUTE_WEIGHT_DELTA_KG,
} from './constants';
import { daysBetween } from './time';

export interface TargetInput {
  sex: Sex;
  dob: string; // YYYY-MM-DD
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: GoalType;
  paceKgPerWeek?: number | null;
  targetWeightKg?: number | null;
  targetDate?: string | null;
  today: string; // member-local date
}

export interface MacroTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export interface TargetResult extends MacroTargets {
  bmr: number;
  tdee: number;
  ageYears: number;
  /** kg/week actually implied by the final calorie target (negative = gain). */
  effectivePaceKgPerWeek: number;
  requestedPaceKgPerWeek: number;
  floorHit: boolean;
  paceCapped: boolean;
  floor: number;
  explanation: string;
}

export function ageFromDob(dob: string, today: string): number {
  const [by, bm, bd] = dob.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return Math.max(0, age);
}

/** Mifflin-St Jeor. "Prefer not to say" gets the average of both formulas (SYS-CALC-01). */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  if (sex === 'male') return base + 5;
  if (sex === 'female') return base - 161;
  return base - 78;
}

export function tdeeFor(bmr: number, level: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[level];
}

/** Requested pace in kg/week (positive), derived from pace or target date. */
export function requestedPace(input: TargetInput): { pace: number; capped: boolean } {
  if (input.goal === 'maintain') return { pace: 0, capped: false };
  const maxPace = input.goal === 'lose' ? MAX_PACE_KG_PER_WEEK : 0.5;
  let pace = input.paceKgPerWeek ?? null;
  if (pace == null && input.targetDate && input.targetWeightKg != null) {
    const weeks = Math.max(1, daysBetween(input.today, input.targetDate) / 7);
    pace = Math.abs(input.weightKg - input.targetWeightKg) / weeks;
  }
  if (pace == null) pace = input.goal === 'lose' ? 0.5 : 0.25;
  const capped = pace > maxPace + 1e-9;
  return { pace: Math.max(0, Math.min(pace, maxPace)), capped };
}

export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export function macrosFor(kcal: number, weightKg: number, goal: GoalType): Omit<MacroTargets, 'kcal'> {
  const protein = Math.round((goal === 'lose' ? 2.0 : 1.8) * weightKg);
  const fat = Math.round((0.27 * kcal) / 9);
  const fibre = Math.round(Math.max(25, (14 * kcal) / 1000));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat, fibre };
}

export function computeTargets(input: TargetInput): TargetResult {
  const ageYears = ageFromDob(input.dob, input.today);
  const bmr = bmrMifflin(input.sex, input.weightKg, input.heightCm, ageYears);
  const tdee = tdeeFor(bmr, input.activityLevel);
  const { pace, capped } = requestedPace(input);
  const floor = CALORIE_FLOOR[input.sex];
  let kcal = tdee;
  if (input.goal === 'lose') kcal = tdee - pace * LOSE_KCAL_PER_KG_WEEK;
  if (input.goal === 'gain') kcal = tdee + pace * GAIN_KCAL_PER_KG_WEEK;
  let floorHit = false;
  if (kcal < floor) {
    kcal = floor;
    floorHit = true;
  }
  kcal = roundTo(kcal, 10);
  const effective =
    input.goal === 'gain' ? -(kcal - tdee) / GAIN_KCAL_PER_KG_WEEK : (tdee - kcal) / LOSE_KCAL_PER_KG_WEEK;
  const macros = macrosFor(kcal, input.weightKg, input.goal);
  return {
    kcal,
    ...macros,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    ageYears,
    effectivePaceKgPerWeek: Math.round(effective * 100) / 100,
    requestedPaceKgPerWeek: pace,
    floorHit,
    paceCapped: capped,
    floor,
    explanation: explainTarget(kcal, input.goal, effective),
  };
}

export function explainTarget(kcal: number, goal: GoalType, effectivePace: number): string {
  const k = kcal.toLocaleString('en-IN');
  if (goal === 'maintain') return `${k} kcal a day to hold steady`;
  const p = Math.abs(effectivePace);
  const pace = p < 0.05 ? 'a little' : `about ${(Math.round(p * 20) / 20).toString()} kg`;
  return goal === 'lose' ? `${k} kcal a day to lose ${pace} a week` : `${k} kcal a day to gain ${pace} a week`;
}

export interface TargetOverrides {
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fibre?: number | null;
}

export function applyOverrides(base: MacroTargets, overrides: TargetOverrides | null | undefined): MacroTargets & { overridden: (keyof MacroTargets)[] } {
  const out: MacroTargets = { ...base };
  const overridden: (keyof MacroTargets)[] = [];
  if (overrides) {
    for (const key of ['kcal', 'protein', 'carbs', 'fat', 'fibre'] as const) {
      const v = overrides[key];
      if (v != null) {
        out[key] = v;
        overridden.push(key);
      }
    }
  }
  return { ...out, overridden };
}

/** Targets recompute when weight moves ≥ 2 kg from the weight they were computed with, or the goal changes (SYS-CALC-06). */
export function needsRecompute(weightUsedKg: number | null, newWeightKg: number, goalChanged: boolean): boolean {
  if (goalChanged) return true;
  if (weightUsedKg == null) return true;
  return Math.abs(newWeightKg - weightUsedKg) >= RECOMPUTE_WEIGHT_DELTA_KG;
}

export interface SafetyCheck {
  ok: boolean;
  reasons: string[];
}

/** ADM-PLAN-11: refuse paces above 1 kg/week and targets below the floors. */
export function checkTargetSafety(sex: Sex, kcal: number, paceKgPerWeek: number): SafetyCheck {
  const reasons: string[] = [];
  if (paceKgPerWeek > MAX_PACE_KG_PER_WEEK) reasons.push(`A pace above ${MAX_PACE_KG_PER_WEEK} kg a week isn't allowed.`);
  const floor = CALORIE_FLOOR[sex];
  if (kcal < floor) reasons.push(`${kcal} kcal is below the safe floor of ${floor.toLocaleString('en-IN')} kcal.`);
  return { ok: reasons.length === 0, reasons };
}
