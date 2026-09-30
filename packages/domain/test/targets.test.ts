import { describe, expect, it } from 'vitest';
import { applyOverrides, bmrMifflin, checkTargetSafety, computeTargets, macrosFor, needsRecompute, ageFromDob } from '../src';

const base = { dob: '1996-05-10', heightCm: 176, weightKg: 72, activityLevel: 'moderate' as const, today: '2026-09-30' };

describe('Mifflin-St Jeor (SYS-CALC-01)', () => {
  it('computes male, female and the average for prefer-not-to-say', () => {
    expect(bmrMifflin('male', 72, 176, 30)).toBeCloseTo(10 * 72 + 6.25 * 176 - 5 * 30 + 5);
    expect(bmrMifflin('female', 60, 165, 28)).toBeCloseTo(10 * 60 + 6.25 * 165 - 5 * 28 - 161);
    const m = bmrMifflin('male', 70, 170, 30);
    const f = bmrMifflin('female', 70, 170, 30);
    expect(bmrMifflin('unspecified', 70, 170, 30)).toBeCloseTo((m + f) / 2);
  });
  it('computes age from date of birth', () => {
    expect(ageFromDob('1996-05-10', '2026-09-30')).toBe(30);
    expect(ageFromDob('1996-10-10', '2026-09-30')).toBe(29);
  });
});

describe('calorie targets (SYS-CALC-02/03)', () => {
  it('maintain = TDEE from the profile activity factor', () => {
    const r = computeTargets({ ...base, sex: 'male', goal: 'maintain' });
    expect(r.tdee).toBe(Math.round((10 * 72 + 6.25 * 176 - 5 * 30 + 5) * 1.55));
    expect(Math.abs(r.kcal - r.tdee)).toBeLessThanOrEqual(5);
  });
  it('lose 0.5 kg/week subtracts about 550 kcal', () => {
    const r = computeTargets({ ...base, sex: 'male', goal: 'lose', paceKgPerWeek: 0.5 });
    expect(r.tdee - r.kcal).toBeGreaterThanOrEqual(545);
    expect(r.tdee - r.kcal).toBeLessThanOrEqual(555);
    expect(r.explanation).toMatch(/kcal a day to lose about 0.5 kg a week/);
  });
  it('gain adds +250 or +500', () => {
    expect(computeTargets({ ...base, sex: 'male', goal: 'gain', paceKgPerWeek: 0.25 }).kcal - computeTargets({ ...base, sex: 'male', goal: 'maintain' }).kcal).toBeCloseTo(250, -1);
    expect(computeTargets({ ...base, sex: 'male', goal: 'gain', paceKgPerWeek: 0.5 }).kcal - computeTargets({ ...base, sex: 'male', goal: 'maintain' }).kcal).toBeCloseTo(500, -1);
  });
  it('never goes below the floor and reports it', () => {
    const r = computeTargets({ sex: 'female', dob: '1990-01-01', heightCm: 150, weightKg: 48, activityLevel: 'sedentary', goal: 'lose', paceKgPerWeek: 1, today: '2026-09-30' });
    expect(r.kcal).toBe(1200);
    expect(r.floorHit).toBe(true);
    const m = computeTargets({ sex: 'male', dob: '1990-01-01', heightCm: 160, weightKg: 55, activityLevel: 'sedentary', goal: 'lose', paceKgPerWeek: 1, today: '2026-09-30' });
    expect(m.kcal).toBe(1500);
  });
  it('caps pace at 1 kg/week', () => {
    const r = computeTargets({ ...base, sex: 'male', goal: 'lose', paceKgPerWeek: 1.5 });
    expect(r.paceCapped).toBe(true);
    expect(r.requestedPaceKgPerWeek).toBe(1);
  });
  it('derives pace from a target date', () => {
    const r = computeTargets({ ...base, sex: 'male', goal: 'lose', targetWeightKg: 68, targetDate: '2026-12-23' });
    expect(r.requestedPaceKgPerWeek).toBeCloseTo(4 / 12, 2);
  });
});

describe('macros (SYS-CALC-04)', () => {
  it('protein 1.8 g/kg, 2.0 when losing; fat 27 %; fibre 14 g/1000 kcal min 25; carbs remainder', () => {
    const m = macrosFor(2000, 70, 'maintain');
    expect(m.protein).toBe(126);
    expect(m.fat).toBe(60);
    expect(m.fibre).toBe(28);
    expect(m.carbs).toBe(Math.round((2000 - 126 * 4 - 60 * 9) / 4));
    expect(macrosFor(2000, 70, 'lose').protein).toBe(140);
    expect(macrosFor(1500, 70, 'lose').fibre).toBe(25);
  });
});

describe('overrides and recompute (SYS-CALC-05/06)', () => {
  it('applies overrides and lists them', () => {
    const r = applyOverrides({ kcal: 2000, protein: 120, carbs: 200, fat: 60, fibre: 28 }, { protein: 150 });
    expect(r.protein).toBe(150);
    expect(r.overridden).toEqual(['protein']);
  });
  it('recomputes on ≥ 2 kg change or goal change', () => {
    expect(needsRecompute(72, 73.9, false)).toBe(false);
    expect(needsRecompute(72, 74, false)).toBe(true);
    expect(needsRecompute(72, 72, true)).toBe(true);
  });
  it('safety check refuses fast paces and sub-floor targets', () => {
    expect(checkTargetSafety('female', 1100, 0.5).ok).toBe(false);
    expect(checkTargetSafety('male', 1800, 1.2).ok).toBe(false);
    expect(checkTargetSafety('male', 1800, 0.5).ok).toBe(true);
  });
});
