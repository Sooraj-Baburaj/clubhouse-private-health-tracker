import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_STREAK_SETTINGS } from '@clubhouse/contracts';
import { addDays, computeDailyStreak, computeTeamStreak, computeWeeklyStreak, milestonesCrossed, teamDayQualifies, vacationDaysInQuarter } from '../src';

const S = DEFAULT_STREAK_SETTINGS;
const FROM = '2026-01-01';

/** Build facts from a pattern string: L = logged, . = missed, V = vacation. Last char is today. */
function run(pattern: string, todayCounts = true) {
  const facts = [...pattern].map((c, i) => ({ date: addDays(FROM, i), qualifies: c === 'L', vacation: c === 'V' }));
  return computeDailyStreak({ facts, from: FROM, today: addDays(FROM, pattern.length - 1), todayCounts, settings: S });
}

describe('daily streak (SYS-STREAK-01…04)', () => {
  it('counts consecutive logged days', () => {
    expect(run('LLLLL')).toMatchObject({ current: 5, best: 5, status: 'active' });
  });
  it('with no grace, a missed day pauses and freezes the count', () => {
    const r = run('LLL..');
    expect(r).toMatchObject({ current: 3, status: 'paused', graceLeft: 0 });
    expect(r.pausedSince).toBe(addDays(FROM, 3));
  });
  it('resumes at the frozen count when logging within the window', () => {
    expect(run('LLL..L')).toMatchObject({ current: 4, status: 'active' });
  });
  it('resets to 0 after 3 missed days but keeps the best', () => {
    const r = run('LLLL...L');
    expect(r.current).toBe(1);
    expect(r.best).toBe(4);
    expect(run('LLLL....')).toMatchObject({ current: 0, status: 'reset', best: 4 });
  });
  it('earns one grace day per 7 counted days and spends it on a miss', () => {
    const r = run('LLLLLLL.LL');
    expect(r.current).toBe(9);
    expect(r.status).toBe('active');
    expect(r.history.find((h) => h.state === 'grace')).toBeTruthy();
    expect(r.graceLeft).toBe(0);
  });
  it('banks grace up to 3', () => {
    const r = run('L'.repeat(35));
    expect(r.graceLeft).toBe(3);
  });
  it('vacation freezes the streak', () => {
    expect(run('LLLVVVVVLL')).toMatchObject({ current: 5 });
    expect(run('LLLVV').status).toBe('vacation');
  });
  it('today is never a miss', () => {
    const r = run('LLLL.');
    expect(r).toMatchObject({ current: 4, status: 'active' });
    expect(r.atRisk).toBe(true);
  });
  it('in-range style: a qualifying today waits for day end', () => {
    expect(run('LLL', false).current).toBe(2);
  });
  it('misses before the first log do nothing', () => {
    expect(run('....LL')).toMatchObject({ current: 2, status: 'active' });
  });
  it('nightly (evalDate = yesterday) and on-log (today) agree on completed days', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('L', '.', 'V'), { minLength: 2, maxLength: 60 }), (arr) => {
        const pattern = arr.join('');
        const facts = [...pattern].map((c, i) => ({ date: addDays(FROM, i), qualifies: c === 'L', vacation: c === 'V' }));
        const yesterday = addDays(FROM, pattern.length - 2);
        const nightly = computeDailyStreak({ facts: facts.slice(0, -1), from: FROM, today: yesterday, todayCounts: true, settings: S });
        const onLog = computeDailyStreak({ facts, from: FROM, today: addDays(FROM, pattern.length - 1), todayCounts: true, settings: S });
        const upToYesterday = onLog.history.slice(0, -1);
        // Completed-day states match; yesterday's state may be 'pending' in the nightly run only if it was today there.
        const n = nightly.history.slice(0, -1);
        expect(upToYesterday.slice(0, n.length)).toEqual(n);
      }),
    );
  });
});

describe('weekly activity streak (SYS-STREAK-06)', () => {
  it('counts met weeks, current week never misses, two missed weeks reset', () => {
    const weeks = [
      { weekStart: '2026-09-01', met: true, frozen: false },
      { weekStart: '2026-09-08', met: true, frozen: false },
      { weekStart: '2026-09-15', met: false, frozen: true },
      { weekStart: '2026-09-22', met: true, frozen: false },
      { weekStart: '2026-09-29', met: false, frozen: false },
    ];
    expect(computeWeeklyStreak(weeks, '2026-09-29')).toMatchObject({ current: 3, status: 'active' });
    const missed = [...weeks.slice(0, 4), { weekStart: '2026-09-29', met: false, frozen: false }, { weekStart: '2026-10-06', met: false, frozen: false }, { weekStart: '2026-10-13', met: false, frozen: false }];
    expect(computeWeeklyStreak(missed, '2026-10-13')).toMatchObject({ current: 0, status: 'reset', best: 3 });
  });
});

describe('team streak (SYS-STREAK-07)', () => {
  it('needs every active, non-vacation member', () => {
    expect(teamDayQualifies([{ active: true, onVacation: false, logged: true }, { active: true, onVacation: true, logged: false }, { active: false, onVacation: false, logged: false }])).toBe(true);
    expect(teamDayQualifies([{ active: true, onVacation: false, logged: false }])).toBe(false);
    expect(teamDayQualifies([])).toBeNull();
    const r = computeTeamStreak([{ date: '2026-09-28', qualifies: true }, { date: '2026-09-29', qualifies: true }, { date: '2026-09-30', qualifies: true }], '2026-09-28', '2026-09-30', S);
    expect(r.current).toBe(3);
  });
});

describe('milestones and vacation quota', () => {
  it('detects crossed milestones', () => {
    expect(milestonesCrossed(6, 7, S.milestones)).toEqual([7]);
    expect(milestonesCrossed(7, 8, S.milestones)).toEqual([]);
  });
  it('counts vacation days inside the quarter', () => {
    expect(vacationDaysInQuarter([{ from: '2026-09-25', to: '2026-10-05' }], '2026-09-30')).toBe(6);
    expect(vacationDaysInQuarter([{ from: '2026-09-25', to: '2026-10-05' }], '2026-10-02')).toBe(5);
  });
});
