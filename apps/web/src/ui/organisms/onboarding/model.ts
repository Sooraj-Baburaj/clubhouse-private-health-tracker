import type { ActivityLevel, GoalType, Sex, Units } from '@clubhouse/contracts';
import { addDays, ageFromDob, cmToFtIn, computeTargets, ftInToCm, isValidTimeZone, kgToLb, lbToKg, type TargetResult } from '@clubhouse/domain';

/** Raw form state for step 1; numbers stay strings while typing and are shown in the member's units. */
export interface AboutDraft {
  units: Units;
  cm: string;
  ft: string;
  inch: string;
  weight: string;
  dob: string;
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  timezone: string;
}

export interface About {
  units: Units;
  heightCm: number;
  weightKg: number;
  dob: string;
  sex: Sex;
  activityLevel: ActivityLevel;
  timezone: string;
}

export interface GoalDraft {
  goal: GoalType;
  mode: 'pace' | 'date';
  pace: number;
  targetWeight: string;
  targetDate: string;
}

export type AboutErrors = Partial<Record<'height' | 'weight' | 'dob' | 'sex' | 'activityLevel' | 'timezone', string>>;

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : null;
};
const r1 = (n: number) => String(Math.round(n * 10) / 10);

export function aboutFromProfile(p: { units: Units; heightCm: number | null; weightKg: number | null; dob: string | null; sex: Sex | null; activityLevel: string | null }, timezone: string): AboutDraft {
  const ftIn = p.heightCm ? cmToFtIn(p.heightCm) : null;
  return {
    units: p.units,
    cm: p.heightCm ? r1(p.heightCm) : '',
    ft: ftIn ? String(ftIn.ft) : '',
    inch: ftIn ? String(ftIn.inch) : '',
    weight: p.weightKg ? r1(p.units === 'imperial' ? kgToLb(p.weightKg) : p.weightKg) : '',
    dob: p.dob ?? '',
    sex: p.sex,
    activityLevel: (p.activityLevel as ActivityLevel | null) ?? null,
    timezone,
  };
}

/** Switch units while keeping the same body: converts the typed height and weight. */
export function switchUnits(d: AboutDraft, units: Units): AboutDraft {
  if (d.units === units) return d;
  const w = num(d.weight);
  if (units === 'imperial') {
    const cm = num(d.cm);
    const fi = cm ? cmToFtIn(cm) : null;
    return { ...d, units, ft: fi ? String(fi.ft) : d.ft, inch: fi ? String(fi.inch) : d.inch, weight: w ? r1(kgToLb(w)) : d.weight };
  }
  const ft = num(d.ft);
  const inch = num(d.inch) ?? 0;
  return { ...d, units, cm: ft ? r1(ftInToCm(ft, inch)) : d.cm, weight: w ? r1(lbToKg(w)) : d.weight };
}

export function parseAbout(d: AboutDraft, today: string): { value: About | null; errors: AboutErrors } {
  const errors: AboutErrors = {};
  let heightCm: number | null;
  if (d.units === 'imperial') {
    const ft = num(d.ft);
    heightCm = ft != null ? ftInToCm(ft, num(d.inch) ?? 0) : null;
  } else heightCm = num(d.cm);
  if (heightCm == null) errors.height = 'Add your height.';
  else if (heightCm < 100 || heightCm > 250) errors.height = d.units === 'imperial' ? 'Use a height between 3 ft 4 in and 8 ft 2 in.' : 'Use a height between 100 and 250 cm.';
  const w = num(d.weight);
  const weightKg = w == null ? null : d.units === 'imperial' ? lbToKg(w) : w;
  if (weightKg == null) errors.weight = 'Add your weight.';
  else if (weightKg < 25 || weightKg > 350) errors.weight = d.units === 'imperial' ? 'Use a weight between 55 and 770 lb.' : 'Use a weight between 25 and 350 kg.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dob)) errors.dob = 'Add your date of birth.';
  else {
    const age = ageFromDob(d.dob, today);
    if (d.dob > today || age < 13 || age > 110) errors.dob = 'Check that date — you need to be at least 13.';
  }
  if (!d.sex) errors.sex = 'Pick one — it tunes the calorie maths.';
  if (!d.activityLevel) errors.activityLevel = 'Pick the closest match.';
  if (!d.timezone.trim() || !isValidTimeZone(d.timezone.trim())) errors.timezone = 'Pick a timezone from the list.';
  if (Object.keys(errors).length) return { value: null, errors };
  return {
    value: { units: d.units, heightCm: Math.round(heightCm! * 10) / 10, weightKg: Math.round(weightKg! * 10) / 10, dob: d.dob, sex: d.sex!, activityLevel: d.activityLevel!, timezone: d.timezone.trim() },
    errors,
  };
}

export function parseTargetWeightKg(g: GoalDraft, units: Units): number | null {
  const n = num(g.targetWeight);
  if (n == null) return null;
  return Math.round((units === 'imperial' ? lbToKg(n) : n) * 10) / 10;
}

/** Client-side preview (same maths the server runs) so the target card moves as the member picks. */
export function previewTargets(about: About, goal: GoalType, g: GoalDraft, today: string): TargetResult {
  const byDate = goal !== 'maintain' && g.mode === 'date';
  return computeTargets({
    sex: about.sex,
    dob: about.dob,
    heightCm: about.heightCm,
    weightKg: about.weightKg,
    activityLevel: about.activityLevel,
    goal,
    paceKgPerWeek: goal === 'maintain' || byDate ? null : g.pace,
    targetWeightKg: parseTargetWeightKg(g, about.units),
    targetDate: byDate && g.targetDate ? g.targetDate : null,
    today,
  });
}

export const minTargetDate = (today: string) => addDays(today, 14);
