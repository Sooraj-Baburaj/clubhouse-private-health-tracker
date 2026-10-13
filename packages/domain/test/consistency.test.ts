import { describe, expect, it } from 'vitest';
import { addDays, consistencyScore, dayTallies, daysLeftInWeek, habitTally, planWeekTally, type ConsistencyDay, type HabitRule, type HabitValues } from '../src';

const MON = '2026-10-12';
const none = { logging: null, calories: null, protein: null, activity: null, habits: null };
const day = (date: string, over: Partial<ConsistencyDay> = {}): ConsistencyDay => ({ date, foodLogged: true, caloriesInRange: true, proteinOnTrack: true, excluded: false, ...over });

describe('consistency (SYS-CALC-33 v2)', () => {
  it('weights the parts 25/25/15/20/15 and maps to words', () => {
    const all = { done: 1, due: 1 };
    expect(consistencyScore({ logging: all, calories: all, protein: all, activity: all, habits: all })).toMatchObject({ score: 100, word: 'solid' });
    const r = consistencyScore({ logging: { done: 7, due: 7 }, calories: { done: 0, due: 7 }, protein: { done: 0, due: 7 }, activity: { done: 0, due: 3 }, habits: { done: 0, due: 7 } });
    expect(r.score).toBe(25);
    expect(r.word).toBe('rough week');
    expect(r.parts.calories).toMatchObject({ pct: 0, done: 0, due: 7, weight: 25 });
  });

  it('leaves out parts that don’t apply and shares their weight', () => {
    // No plan, no habits: logging 100 %, calories 50 %, protein 0 % → (25 + 12.5 + 0) / 65.
    const r = consistencyScore({ ...none, logging: { done: 4, due: 4 }, calories: { done: 2, due: 4 }, protein: { done: 0, due: 4 } });
    expect(r.score).toBe(58);
    expect(r.parts.activity).toBeNull();
    expect(consistencyScore(none)).toMatchObject({ score: null, word: null });
  });

  it('judges today’s calories only once the day is over; today counts for logging once something is logged', () => {
    const today = addDays(MON, 2);
    const t = dayTallies([day(MON), day(addDays(MON, 1), { foodLogged: false, caloriesInRange: false, proteinOnTrack: false }), day(today, { caloriesInRange: false })], today);
    expect(t.logging).toEqual({ done: 2, due: 3 });
    expect(t.calories).toEqual({ done: 1, due: 2 });
    expect(dayTallies([day(today, { foodLogged: false })], today).logging).toEqual({ done: 0, due: 0 });
  });

  it('skips days before joining and on a break', () => {
    const t = dayTallies([day(MON, { excluded: true, foodLogged: false }), day(addDays(MON, 1))], addDays(MON, 3));
    expect(t.logging).toEqual({ done: 1, due: 1 });
    expect(dayTallies([day(MON, { proteinOnTrack: null })], addDays(MON, 1)).protein).toBeNull();
  });

  it('lets planned sessions land on any day: only missed once they can no longer fit in the week', () => {
    expect(daysLeftInWeek(MON, MON)).toBe(7);
    expect(daysLeftInWeek(MON, addDays(MON, 6))).toBe(1);
    expect(daysLeftInWeek(MON, addDays(MON, 7))).toBe(0);
    // 3 walks planned, none yet: on track until Thursday is gone.
    expect(planWeekTally([{ target: 3, done: 0 }], 4)).toEqual({ done: 0, due: 0 });
    expect(planWeekTally([{ target: 3, done: 0 }], 2)).toEqual({ done: 0, due: 1 });
    expect(planWeekTally([{ target: 3, done: 1 }], 2)).toEqual({ done: 1, due: 1 });
    // A finished week: extra sessions of one item don't make up for another.
    expect(planWeekTally([{ target: 3, done: 5 }, { target: 2, done: 0 }], 0)).toEqual({ done: 3, due: 5 });
  });

  it('counts required habits: each scheduled day, today once done, and weekly habits like planned sessions', () => {
    const daily: HabitRule = { id: 'water', kind: 'check', target: 1, schedule: { type: 'daily', days: [], perWeek: 1 }, required: true, startsOn: '2026-01-01', endsOn: null };
    const weekly: HabitRule = { id: 'yoga', kind: 'check', target: 1, schedule: { type: 'weekly', days: [], perWeek: 2 }, required: true, startsOn: '2026-01-01', endsOn: null };
    const optional: HabitRule = { ...daily, id: 'read', required: false };
    const today = addDays(MON, 3);
    const values: HabitValues = new Map([
      ['water', new Map([[MON, 1], [addDays(MON, 2), 1]])],
      ['yoga', new Map([[addDays(MON, -7), 1]])],
    ]);
    const never = () => false;
    // Mon ✓ Tue ✗ Wed ✓, Thursday not done yet.
    expect(habitTally([daily, optional], values, MON, addDays(MON, 6), today, never)).toEqual({ done: 2, due: 3 });
    // Last week's yoga: once out of two.
    expect(habitTally([weekly], values, addDays(MON, -7), addDays(MON, -1), today, never)).toEqual({ done: 1, due: 2 });
    expect(habitTally([optional], values, MON, today, today, never)).toBeNull();
  });
});
