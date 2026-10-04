import { describe, expect, it } from 'vitest';
import { DEFAULT_BOARD_SETTINGS, DEFAULT_THRESHOLDS } from '@clubhouse/contracts';
import {
  addDays,
  BOARD_RULES,
  classifyKcal,
  classifyProtein,
  crownHolder,
  dayItems,
  dayPoints,
  isSolidDay,
  nextActions,
  rankByPoints,
  solidDayRate,
  weeklyAwards,
  weekStanding,
  type BoardDayFacts,
  type WeekInput,
} from '../src';

const T = DEFAULT_THRESHOLDS;
const MON = '2026-09-28';
const rules = { workoutCap: DEFAULT_BOARD_SETTINGS.workoutCap, noPlanTarget: DEFAULT_BOARD_SETTINGS.noPlanTarget };

const day = (over: Partial<BoardDayFacts> = {}): BoardDayFacts => ({ mealsOnTime: 3, snapOnly: 0, kcal: 'on', protein: 'on', workouts: 0, weighedIn: false, settled: true, ...over });

/** A week where each char is a day: S = solid full day, P = partial (one meal), . = nothing, V = vacation, J = before joining. */
function week(pattern: string, opts: Partial<WeekInput> = {}): WeekInput {
  return {
    weekStart: MON,
    today: addDays(MON, 6),
    days: [...pattern].map((c, i) => ({
      date: addDays(MON, i),
      facts: c === 'S' ? day() : c === 'P' ? day({ mealsOnTime: 1, kcal: 'off', protein: 'off' }) : c === '.' ? day({ mealsOnTime: 0, kcal: null, protein: null }) : null,
      vacation: c === 'V',
      beforeJoin: c === 'J',
    })),
    workoutDates: [],
    plan: { kind: 'none', doneOn: null },
    rules,
    closed: true,
    ...opts,
  };
}

describe('calorie and protein classes', () => {
  it('green is on track, a bit over is close, red is off', () => {
    expect(classifyKcal(2000, 2000, T)).toBe('on');
    expect(classifyKcal(2200, 2000, T)).toBe('near');
    expect(classifyKcal(2500, 2000, T)).toBe('off');
  });
  it('under-eating is close only down to the 70 % floor', () => {
    expect(classifyKcal(1500, 2000, T)).toBe('near'); // 75 %
    expect(classifyKcal(1300, 2000, T)).toBe('off'); // 65 %: one small snack logged earns nothing
  });
  it('protein plenty is on track; a bit low counts from 60 %', () => {
    expect(classifyProtein(200, 100, T)).toBe('on');
    expect(classifyProtein(70, 100, T)).toBe('near');
    expect(classifyProtein(50, 100, T)).toBe('off');
  });
  it('no target means no class', () => {
    expect(classifyKcal(500, 0, T)).toBeNull();
    expect(classifyProtein(20, 0, T)).toBeNull();
  });
});

describe('day points', () => {
  it('caps meals at three and tops snapped meals up to the cap', () => {
    expect(dayPoints(day({ mealsOnTime: 5 })).meals).toBe(30);
    const p = dayPoints(day({ mealsOnTime: 2, snapOnly: 3 }));
    expect([p.meals, p.snap]).toEqual([20, 5]);
  });
  it('maxes out at 70 a day', () => {
    expect(dayPoints(day()).total).toBe(70);
  });
  it('counts calories and protein only once the day settles', () => {
    expect(dayPoints(day({ settled: false })).total).toBe(30);
  });
  it('an honest day over target still beats not logging', () => {
    const over = dayPoints(day({ kcal: 'off', protein: 'on' })).total;
    const skipped = dayPoints(day({ mealsOnTime: 0, kcal: null, protein: null })).total;
    expect(over).toBeGreaterThan(skipped);
    expect(over).toBe(45);
  });
});

describe('solid days', () => {
  it('needs two meals and one good call', () => {
    expect(isSolidDay(day())).toBe(true);
    expect(isSolidDay(day({ mealsOnTime: 1 }))).toBe(false);
    expect(isSolidDay(day({ kcal: 'off', protein: 'off' }))).toBe(false);
    expect(isSolidDay(day({ kcal: 'off', protein: 'off', workouts: 1 }))).toBe(true);
    expect(isSolidDay(day({ kcal: 'near', protein: 'off' }))).toBe(true);
  });
  it('photo-only meals count towards the two meals', () => {
    expect(isSolidDay(day({ mealsOnTime: 1, snapOnly: 1 }))).toBe(true);
  });
  it('is never solid before the day settles', () => {
    expect(isSolidDay(day({ settled: false }))).toBe(false);
  });
});

describe('week standing', () => {
  it('a perfect week of logging is 7 × 70 plus the full-week bonus', () => {
    const w = weekStanding(week('SSSSSSS'));
    expect(w.points).toBe(7 * 70 + BOARD_RULES.fullWeek);
    expect(w.solidDays).toBe(7);
    expect(w.status).toBe('ranked');
  });
  it('the full-week bonus waits for the close', () => {
    expect(weekStanding(week('SSSSSSS', { closed: false })).points).toBe(7 * 70);
  });
  it('caps workouts and credits the no-plan target on the day it is reached', () => {
    const dates = [0, 0, 1, 2, 3, 4].map((i) => addDays(MON, i));
    const w = weekStanding(week('SSSSSSS', { workoutDates: dates }));
    expect(w.workouts).toBe(6);
    expect(w.workoutsCounted).toBe(rules.workoutCap);
    expect(w.parts.workouts).toBe(rules.workoutCap * 40);
    expect(w.days[1]!.parts.plan).toBe(40); // third workout landed on Tuesday
    expect(w.points).toBe(7 * 70 + 50 + 160 + 40);
  });
  it('maxes out at 750 a week', () => {
    const w = weekStanding(week('SSSSSSS', { workoutDates: [0, 1, 2, 3].map((i) => addDays(MON, i)), days: week('SSSSSSS').days.map((d, i) => ({ ...d, facts: { ...d.facts!, weighedIn: i === 0 } })) }));
    expect(w.points).toBe(750);
  });
  it('a weekly plan pays on the day it was done; a rest week keeps the bonus', () => {
    expect(weekStanding(week('SSSSSSS', { plan: { kind: 'plan', doneOn: addDays(MON, 4) } })).days[4]!.parts.plan).toBe(40);
    expect(weekStanding(week('SSSSSSS', { plan: { kind: 'plan', doneOn: null } })).planDone).toBe(false);
    expect(weekStanding(week('SSSSSSS', { plan: { kind: 'rest', doneOn: null } })).days[0]!.parts.plan).toBe(40);
  });
  it('fills vacation days with the average settled day and ranks with up to three of them', () => {
    const w = weekStanding(week('SSPVVVS'));
    const avg = Math.round((70 + 70 + 10 + 70) / 4);
    expect(w.days[3]!.parts.away).toBe(avg);
    expect(w.parts.away).toBe(avg * 3);
    expect(w.status).toBe('ranked');
  });
  it('four vacation days make the week away', () => {
    expect(weekStanding(week('SVVVVSS')).status).toBe('away');
  });
  it('a member who joined late in the week is new, not ranked', () => {
    const w = weekStanding(week('JJJJSSS'));
    expect(w.status).toBe('new');
    expect(w.days[0]!.state).toBe('away');
  });
  it('days to come score nothing and show as future', () => {
    const w = weekStanding(week('SSSSSSS', { today: addDays(MON, 2), closed: false }));
    expect(w.days.slice(3).every((d) => d.state === 'future' && d.points === 0)).toBe(true);
    expect(w.days[2]!.state).toBe('today');
  });
  it('pending counts calories and protein still to land', () => {
    const base = week('SS', { today: addDays(MON, 1), closed: false });
    base.days[1]!.facts = day({ settled: false });
    expect(weekStanding(base).pending).toBe(40);
  });
  it('late logs never reach the board: they are simply not in the facts', () => {
    expect(weekStanding(week('.......')).points).toBe(0);
  });
});

describe('ranking', () => {
  it('ties share a rank', () => {
    const r = rankByPoints([
      { id: 'a', points: 300 },
      { id: 'b', points: 410 },
      { id: 'c', points: 300 },
      { id: 'd', points: 100 },
    ]);
    expect(r.map((x) => [x.id, x.rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['d', 4],
    ]);
  });
});

describe('solid-day rate and the crown', () => {
  const through = '2026-10-04';
  const days = (n: number, solid: number) =>
    Array.from({ length: n }, (_, i) => ({ date: addDays(through, -i), solid: i < solid, logged: true, vacation: false, beforeJoin: false }));
  it('counts only eligible days in the last 28', () => {
    const r = solidDayRate([...days(28, 20), { date: addDays(through, -27), solid: false, logged: false, vacation: true, beforeJoin: false }], through);
    expect(r.eligible).toBe(27);
    expect(r.strip[0]).toBe('away');
    const v = solidDayRate(days(10, 5), through);
    expect(v.eligible).toBe(10);
    expect(v.strip.filter((s) => s === 'pre')).toHaveLength(18);
    expect(v.ranked).toBe(true);
    expect(v.crownEligible).toBe(false);
  });
  it('the holder keeps the crown on a tie', () => {
    const rows = [
      { id: 'a', solid: 20, eligible: 28, streak: 3, best: 9 },
      { id: 'b', solid: 20, eligible: 28, streak: 30, best: 30 },
    ];
    expect(crownHolder(rows, 'a')).toBe('a');
    expect(crownHolder(rows, null)).toBe('b');
  });
  it('needs 14 eligible days', () => {
    expect(crownHolder([{ id: 'a', solid: 10, eligible: 10, streak: 1, best: 1 }], null)).toBeNull();
  });
});

describe('awards', () => {
  const row = (id: string, points: number, over = {}) => ({ id, points, prevPoints: 200, streak: 5, workouts: 2, planDone: false, hasPlan: false, proteinDays: 2, bestBefore: 600, ...over });
  it('need three ranked members', () => {
    expect(weeklyAwards([row('a', 400), row('b', 300)], null)).toEqual([]);
  });
  it('picks the winner, crown, streak, plan keeper, protein pro and comeback', () => {
    const a = weeklyAwards(
      [row('a', 612, { bestBefore: 580, prevPoints: 580 }), row('b', 588, { streak: 31, prevPoints: 560 }), row('c', 540, { planDone: true, hasPlan: true, workouts: 5, proteinDays: 6, prevPoints: 360 })],
      { id: 'b', solid: 27, eligible: 28 },
    );
    expect(Object.fromEntries(a.map((x) => [x.key, x.id]))).toEqual({ winner: 'a', consistent: 'b', streak: 'b', plan: 'c', protein: 'c', comeback: 'c' });
    expect(a.find((x) => x.key === 'winner')!.detail.best).toBe(true);
  });
  it('shares Week winner between everyone level on the most points', () => {
    const a = weeklyAwards([row('a', 540), row('b', 540), row('c', 500)], null);
    expect(a.filter((x) => x.key === 'winner').map((x) => [x.id, x.detail.shared])).toEqual([
      ['a', true],
      ['b', true],
    ]);
    expect(weeklyAwards([row('a', 540), row('b', 500), row('c', 480)], null).find((x) => x.key === 'winner')!.detail.shared).toBe(false);
  });
});

describe('next actions and earned items', () => {
  it('suggests the next meal, a workout and the weigh-in', () => {
    const n = nextActions({ slotsLogged: ['breakfast'], snapPending: null, nextSlot: 'lunch', workoutsCounted: 1, weighedIn: false, rules, eligibleToday: true });
    expect(n.map((x) => x.kind)).toEqual(['meal', 'workout', 'weigh_in']);
  });
  it('offers finishing a snapped meal first and stops meals at the cap', () => {
    const n = nextActions({ slotsLogged: ['breakfast', 'lunch', 'dinner'], snapPending: { slot: 'lunch', logId: 'x' }, nextSlot: 'dinner', workoutsCounted: 4, weighedIn: true, rules, eligibleToday: true });
    expect(n).toEqual([{ kind: 'finish', slot: 'lunch', logId: 'x', points: 5 }]);
  });
  it('labels how a day was earned', () => {
    const w = weekStanding(week('S', { days: [{ date: MON, facts: day({ workouts: 1 }), vacation: false, beforeJoin: false }], workoutDates: [MON], closed: false, today: MON }));
    expect(dayItems(w.days[0]!.parts, day())).toEqual([
      { label: '3 meals', points: 30 },
      { label: 'Calories on track', points: 25 },
      { label: 'Protein on track', points: 15 },
      { label: 'Workout', points: 40 },
    ]);
  });
});
