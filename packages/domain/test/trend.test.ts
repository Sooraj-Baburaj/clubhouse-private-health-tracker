import { describe, expect, it } from 'vitest';
import { consistencyScore, forecast, weightTrend, whatIf } from '../src';

describe('weight trend (SYS-CALC-30)', () => {
  it('is an EMA with smoothing 0.1', () => {
    const t = weightTrend([
      { date: '2026-09-01', kg: 80 },
      { date: '2026-09-02', kg: 81 },
      { date: '2026-09-03', kg: 79 },
    ]);
    expect(t[0]!.trend).toBe(80);
    expect(t[1]!.trend).toBeCloseTo(80.1);
    expect(t[2]!.trend).toBeCloseTo(80.1 + 0.1 * (79 - 80.1), 2);
  });
});

describe('forecast (SYS-CALC-31/32/34)', () => {
  const baseInput = { trendKg: 75, tdee: 2500, goalWeightKg: 70, goalDate: '2026-12-14', today: '2026-09-30' };
  it('locks under 7 logged days', () => {
    const r = forecast({ ...baseInput, netKcalByDay: [2000, 2000, 2000] });
    expect(r.locked).toBe(true);
    expect(r.sentence).toMatch(/Log 4 more days/);
  });
  it('projects with (avg net − TDEE) × days ÷ 7,700', () => {
    const r = forecast({ ...baseInput, netKcalByDay: Array(21).fill(2115) }); // 385 under → 0.35 kg/week
    expect(r.locked).toBe(false);
    expect(r.weeklyChangeKg).toBeCloseTo(-0.35, 2);
    expect(r.projectedAtGoalDate!.kg).toBeCloseTo(75 - (385 * 75) / 7700, 1);
    expect(r.sentence).toBe('Your average net is 390 kcal under, which points to about 0.35 kg a week to lose.');
    expect(r.goalEta).not.toBeNull();
    expect(r.series.length).toBeGreaterThan(1);
  });
  it('says "more than a year" beyond 52 weeks or in the wrong direction', () => {
    expect(forecast({ ...baseInput, netKcalByDay: Array(21).fill(2490) }).etaBeyondYear).toBe(true);
    expect(forecast({ ...baseInput, netKcalByDay: Array(21).fill(2700) }).etaBeyondYear).toBe(true);
  });
  it('what-if shifts the net by at most ±200 kcal', () => {
    const a = forecast({ ...baseInput, netKcalByDay: Array(21).fill(2300) });
    const b = whatIf({ ...baseInput, netKcalByDay: Array(21).fill(2300) }, -500);
    expect(b.avgNet).toBe(a.avgNet - 200);
  });
});

describe('consistency (SYS-CALC-33)', () => {
  it('weights 40/30/30 and maps to words', () => {
    const r = consistencyScore({ days: 7, daysWithFoodLog: 7, daysInCalorieBand: 7, planDone: 5, planTarget: 5 });
    expect(r).toMatchObject({ score: 100, word: 'solid' });
    expect(consistencyScore({ days: 7, daysWithFoodLog: 5, daysInCalorieBand: 3, planDone: 3, planTarget: 5 }).word).toBe('building');
    expect(consistencyScore({ days: 7, daysWithFoodLog: 1, daysInCalorieBand: 0, planDone: 0, planTarget: 5 }).word).toBe('rough week');
  });
});
