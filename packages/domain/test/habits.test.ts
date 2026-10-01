import { describe, expect, it } from 'vitest';
import {
  addDays,
  habitAdherence,
  habitCells,
  habitKeptThisWeek,
  habitScheduleLabel,
  habitStreak,
  habitsStreak,
  habitTapValue,
  isHabitComplete,
  isHabitScheduledOn,
  isHabitShownOn,
  type HabitRule,
  type HabitValues,
} from '../src';

// 2026-09-28 is a Monday.
const MON = '2026-09-28';
const base = { startsOn: '2026-09-01', endsOn: null, required: true, target: 1 } as const;
const daily: HabitRule = { ...base, id: 'skin', kind: 'check', schedule: { type: 'daily', days: [], perWeek: 3 } };
const plants: HabitRule = { ...base, id: 'plants', kind: 'check', schedule: { type: 'days', days: [1, 4], perWeek: 2 } };
const laundry: HabitRule = { ...base, id: 'laundry', kind: 'check', schedule: { type: 'weekly', days: [], perWeek: 2 } };
const water: HabitRule = { ...base, id: 'water', kind: 'count', target: 8, required: false, schedule: { type: 'daily', days: [], perWeek: 3 } };

function values(entries: Record<string, Record<string, number>>): HabitValues {
  return new Map(Object.entries(entries).map(([id, days]) => [id, new Map(Object.entries(days))]));
}

/** Pattern of done days from `from`: 'x' = done, '.' = not. */
function pattern(from: string, p: string): Record<string, number> {
  return Object.fromEntries([...p].flatMap((c, i) => (c === 'x' ? [[addDays(from, i), 1]] : [])));
}

describe('habit schedule and completion', () => {
  it('schedules daily, weekday and weekly habits', () => {
    expect(isHabitScheduledOn(daily, MON)).toBe(true);
    expect(isHabitScheduledOn(plants, MON)).toBe(false);
    expect(isHabitScheduledOn(plants, addDays(MON, 1))).toBe(true);
    expect(isHabitScheduledOn(laundry, MON)).toBe(true);
    expect(isHabitScheduledOn({ ...daily, startsOn: addDays(MON, 1) }, MON)).toBe(false);
    expect(isHabitScheduledOn({ ...daily, endsOn: addDays(MON, -1) }, MON)).toBe(false);
  });

  it('completes by kind', () => {
    expect(isHabitComplete('check', 1, 1)).toBe(true);
    expect(isHabitComplete('count', 7, 8)).toBe(false);
    expect(isHabitComplete('count', 8, 8)).toBe(true);
    expect(isHabitComplete('duration', 20, 20)).toBe(true);
    expect(isHabitComplete('scale', 2, 5)).toBe(true);
    expect(isHabitComplete('scale', 0, 5)).toBe(false);
  });

  it('cycles tile taps and wraps at the end', () => {
    expect(habitTapValue('check', 0, 1)).toBe(1);
    expect(habitTapValue('check', 1, 1)).toBe(0);
    expect(habitTapValue('count', 7, 8)).toBe(8);
    expect(habitTapValue('count', 8, 8)).toBe(0);
    expect(habitTapValue('duration', 15, 20)).toBe(20);
    expect(habitTapValue('duration', 20, 20)).toBe(0);
    expect(habitTapValue('scale', 5, 5)).toBe(0);
  });

  it('labels schedules', () => {
    expect(habitScheduleLabel(daily.schedule)).toBe('Every day');
    expect(habitScheduleLabel(plants.schedule)).toBe('Tue · Fri');
    expect(habitScheduleLabel(laundry.schedule)).toBe('2× a week');
  });

  it('keeps a weekly habit on the list until the week is on target', () => {
    const v = values({ laundry: { [MON]: 1, [addDays(MON, 2)]: 1 } });
    expect(isHabitShownOn(laundry, v, addDays(MON, 2))).toBe(true); // done that day
    expect(isHabitShownOn(laundry, v, addDays(MON, 3))).toBe(false); // 2 of 2 already
    expect(isHabitShownOn(laundry, v, addDays(MON, 7))).toBe(true); // new week
  });
});

describe('habits streak', () => {
  it('counts days with every required habit done and ignores optional ones', () => {
    const v = values({ skin: pattern(MON, 'xxxxx'), water: {} });
    expect(habitsStreak([daily, water], v, addDays(MON, 4))).toEqual({ current: 5, best: 5 });
  });

  it('leaves today open until it is complete', () => {
    const v = values({ skin: pattern(MON, 'xxxx.') });
    expect(habitsStreak([daily], v, addDays(MON, 4)).current).toBe(4);
  });

  it('treats days with nothing required as neutral', () => {
    const v = values({ plants: { [addDays(MON, 1)]: 1, [addDays(MON, 4)]: 1 } });
    expect(habitsStreak([plants], v, addDays(MON, 5)).current).toBe(2);
  });

  it('judges weekly habits on Sunday', () => {
    const lastWeek = addDays(MON, -7);
    const met = values({ skin: pattern(lastWeek, 'xxxxxxxx'), laundry: { [lastWeek]: 1, [addDays(lastWeek, 3)]: 1 } });
    const missed = values({ skin: pattern(lastWeek, 'xxxxxxxx'), laundry: { [lastWeek]: 1 } });
    const s = { ...base, startsOn: lastWeek };
    const hs = [{ ...daily, ...s }, { ...laundry, ...s }];
    expect(habitsStreak(hs, met, MON).current).toBe(8);
    expect(habitsStreak(hs, missed, MON, { settings: { graceEarnedPer7: 0, graceBankMax: 0, pauseWindowDays: 0, resetAfterDays: 1 } }).current).toBe(1);
  });

  it('skips vacation days', () => {
    const v = values({ skin: { [MON]: 1, [addDays(MON, 2)]: 1 } });
    const r = habitsStreak([{ ...daily, startsOn: MON }], v, addDays(MON, 2), { isVacation: (d) => d === addDays(MON, 1) });
    expect(r.current).toBe(2);
  });
});

describe('per-habit stats', () => {
  it('streaks a weekday habit over its days only', () => {
    const v = values({ plants: { [addDays(MON, -6)]: 1, [addDays(MON, -3)]: 1, [addDays(MON, 1)]: 1 } });
    expect(habitStreak({ ...plants, startsOn: addDays(MON, -7) }, v, addDays(MON, 2))).toEqual({ current: 3, best: 3 });
  });

  it('measures adherence for daily and weekly habits', () => {
    const v = values({ skin: pattern(MON, 'xx.xxxx'), laundry: { [MON]: 1 } });
    expect(habitAdherence(daily, v, MON, addDays(MON, 6))).toEqual({ kept: 6, scheduled: 7 });
    expect(habitAdherence(laundry, v, MON, addDays(MON, 6))).toEqual({ kept: 1, scheduled: 2 });
    // A week that hasn't ended inside the window isn't judged.
    expect(habitAdherence(laundry, v, MON, addDays(MON, 5))).toEqual({ kept: 0, scheduled: 0 });
  });

  it('builds five weeks of cells ending with this week', () => {
    const today = addDays(MON, 2);
    const cells = habitCells(plants, values({ plants: { [addDays(MON, 1)]: 1 } }), today);
    expect(cells).toHaveLength(35);
    expect(cells[0]!.date).toBe(addDays(MON, -28));
    expect(cells.find((c) => c.date === addDays(MON, 1))!.state).toBe('done');
    expect(cells.find((c) => c.date === MON)!.state).toBe('off');
    expect(cells.find((c) => c.date === addDays(MON, 4))!.state).toBe('future');
    expect(cells.find((c) => c.date === addDays(MON, -3))!.state).toBe('miss');
  });

  it('calls a habit kept this week when every scheduled day so far was done', () => {
    const today = addDays(MON, 3);
    expect(habitKeptThisWeek(daily, values({ skin: pattern(addDays(today, -6), 'xxxxxx.') }), today)).toBe(true);
    expect(habitKeptThisWeek(daily, values({ skin: pattern(addDays(today, -6), 'xx.xxxx') }), today)).toBe(false);
    expect(habitKeptThisWeek(laundry, values({ laundry: { [MON]: 1 } }), today)).toBe(true);
    expect(habitKeptThisWeek(laundry, values({}), addDays(MON, 6))).toBe(false);
  });
});
