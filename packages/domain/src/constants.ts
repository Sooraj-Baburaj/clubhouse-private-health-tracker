import type { ActivityLevel, GymFocus, Intensity, MealSlot } from '@clubhouse/contracts';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, { label: string; hint: string }> = {
  sedentary: { label: 'Mostly sitting', hint: 'Desk job, little exercise' },
  light: { label: 'Lightly active', hint: 'Exercise 1–3 days a week' },
  moderate: { label: 'Moderately active', hint: 'Exercise 3–5 days a week' },
  active: { label: 'Very active', hint: 'Hard exercise 6–7 days a week' },
  very_active: { label: 'Athlete', hint: 'Physical job or training twice a day' },
};

/** kcal per kg of body fat, the conventional planning number (SYS-CALC-31). */
export const KCAL_PER_KG = 7700;
export const MAX_PACE_KG_PER_WEEK = 1;
export const CALORIE_FLOOR = { female: 1200, male: 1500, unspecified: 1500 } as const;
export const LOSE_PACES = [0.25, 0.5, 0.75, 1] as const;
export const GAIN_PACES = [0.25, 0.5] as const;
/** kcal per day per kg/week of loss: 0.25 → 275, 0.5 → 550, 0.75 → 825 (SYS-CALC-03). */
export const LOSE_KCAL_PER_KG_WEEK = 1100;
/** kcal per day per kg/week of gain: 0.25 → +250, 0.5 → +500. */
export const GAIN_KCAL_PER_KG_WEEK = 1000;
export const RECOMPUTE_WEIGHT_DELTA_KG = 2;

export const GYM_FOCUS_MET: Record<GymFocus, number> = { strength: 3.5, cardio: 6.0, mixed: 5.0 };
export const INTENSITY_MULTIPLIER: Record<Intensity, number> = { light: 0.8, moderate: 1, hard: 1.25 };

export const SLOT_ORDER: MealSlot[] = ['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner'];
/** Local time after which "under" bands stop being neutral (SYS-CALC-21). */
export const DAY_CLOSE_TIME = '20:00';

export const BADGES: Record<number, { name: string; emoji: string }> = {
  7: { name: 'Week One', emoji: '🌱' },
  14: { name: 'Fortnight', emoji: '🌿' },
  30: { name: 'Iron Month', emoji: '🛡️' },
  60: { name: 'Sixty Strong', emoji: '💪' },
  100: { name: 'Century', emoji: '💯' },
  365: { name: 'Year of Us', emoji: '🏆' },
};

export const BANNED_COPY_WORDS = ['cheat', 'guilty', 'bad', 'fail', 'lazy', 'should have'] as const;
