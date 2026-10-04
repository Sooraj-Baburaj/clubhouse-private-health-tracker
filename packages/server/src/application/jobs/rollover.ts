import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { MEAL_SLOTS } from '@clubhouse/contracts';
import { addDays, badgeFor, lastSettledDate, localDateOf, localMinutesOf, slotWindows, smartTime } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../../container';
import { log } from '../../lib/log';
import { refreshWeeksFor, teamMorning } from '../board';
import { postSystemMessage } from '../chat';
import { ensureSchedules } from '../inbox';
import { runDayEnd } from '../memeEngine';
import { computeDayFacts, recomputeMemberStreaks, recomputeTeamStreak } from '../momentum';
import { notifyUser } from '../notify';
import { checkStreakRecord } from '../records';
import { rescheduleUser } from '../scheduler';
import { getTeam } from '../team';
import { authUserFor, getJobState, hasTime, setJobState, type Stats, type StepCtx } from './shared';

const MAX_MEMBERS = 40;
const MAX_REPLAY_DAYS = 7;
const STREAK_LABEL = { logging: 'logging', in_range: 'in-range', activity: 'activity' } as const;

/** The member-local date that has fully ended and settled: yesterday, once local time is past 03:00. */
export const rolloverTargetDate = lastSettledDate;

/** SYS-NOTIF-04 smart times: median log time per slot over 14 days minus 10 minutes (needs ≥ 5 samples). */
async function recomputeSmartTimes(c: Container, userId: string, today: string, tz: string) {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  if (!user || !profile) return;
  const team = await getTeam(c, user.teamId);
  const windows = slotWindows(team.settings.mealSlots);
  const logs = await c.db
    .select({ slot: s.foodLogs.mealSlot, at: s.foodLogs.loggedAt })
    .from(s.foodLogs)
    .where(and(eq(s.foodLogs.userId, userId), gte(s.foodLogs.date, addDays(today, -14)), isNull(s.foodLogs.deletedAt), eq(s.foodLogs.addedLate, false)));
  const next: Record<string, string> = {};
  for (const slot of MEAL_SLOTS) {
    const samples = logs.filter((l) => l.slot === slot).map((l) => localMinutesOf(l.at, tz));
    if (samples.length < 5) continue;
    const def = team.settings.notificationDefaults[`${slot}_reminder` as keyof typeof team.settings.notificationDefaults]?.time ?? windows[slot].to;
    next[slot] = smartTime(samples, def, windows[slot]);
  }
  if (JSON.stringify(next) !== JSON.stringify(profile.smartTimes)) {
    await c.db.update(s.profiles).set({ smartTimes: next, updatedAt: c.clock.now() }).where(eq(s.profiles.userId, userId));
  }
}

/**
 * Step 3 (§14): per member whose local day has settled (≥ 03:00) and whose watermark is behind — day facts for the
 * missed days (replay capped at 7), day-end triggers, streaks, milestones, smart times, rescheduling, then the
 * watermark. Every piece is idempotent, so a late, missed or repeated tick is harmless.
 */
export async function rolloverMembers(c: Container, ctx: StepCtx): Promise<Stats> {
  const now = c.clock.now();
  const nowIso = now.toISOString();
  const due = await c.db.execute<{ id: string }>(sql`
    select u.id from users u
      join teams t on t.id = u.team_id
      join profiles p on p.user_id = u.id
     where u.status = 'active' and u.onboarded_at is not null
       and (p.rolled_over_for is null
            or p.rolled_over_for < ((${nowIso}::timestamptz at time zone coalesce(u.timezone, t.timezone)) - interval '3 hours')::date - 1)
     order by p.rolled_over_for asc nulls first
     limit ${MAX_MEMBERS}`);
  const stats = { due: due.length, rolled: 0, days: 0, milestones: 0, errors: 0 };
  for (const { id } of due) {
    if (!hasTime(ctx, 5000)) break;
    try {
      const user = await c.db.query.users.findFirst({ where: eq(s.users.id, id) });
      const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, id) });
      if (!user || !profile) continue;
      const u = await authUserFor(c, user);
      const target = rolloverTargetDate(now, u.timezone);
      if (profile.rolledOverFor && profile.rolledOverFor >= target) continue;
      const today = localDateOf(now, u.timezone);
      let from = profile.rolledOverFor ? addDays(profile.rolledOverFor, 1) : target;
      if (from < addDays(target, -(MAX_REPLAY_DAYS - 1))) from = addDays(target, -(MAX_REPLAY_DAYS - 1));
      const settledDays: string[] = [];
      for (let d = from; d <= target; d = addDays(d, 1)) {
        await computeDayFacts(c, id, d);
        await runDayEnd(c, u, d);
        settledDays.push(d);
        stats.days++;
      }
      // Calories and protein land on the board once a day settles (and a new week starts on Monday).
      await refreshWeeksFor(c, id, [...settledDays, today]);
      // Streaks are evaluated as of the member's current local date: completed days (including the one just rolled
      // over) are final and today is pending, so this agrees with the on-log path.
      const changes = await recomputeMemberStreaks(c, id, today);
      for (const ch of changes) {
        for (const m of ch.milestones) {
          const b = badgeFor(m);
          stats.milestones++;
          await notifyUser(c, id, { type: 'milestone', title: `${b.emoji} ${b.name}`, body: `${m}-day ${STREAK_LABEL[ch.kind]} momentum. That’s a badge!`, url: '/momentum', dedupeKey: `milestone:${id}:${ch.kind}:${m}` });
          await postSystemMessage(c, u.teamId, { systemKind: 'milestone', body: `${u.displayName} reached ${m} days of ${STREAK_LABEL[ch.kind]} momentum ${b.emoji} ${b.name}`, mentions: [id], meta: { userId: id, kind: ch.kind, days: m, badge: b.name } });
        }
      }
      const logging = changes.find((ch) => ch.kind === 'logging');
      if (logging && logging.after > logging.before) {
        const st = await c.db.query.streakStates.findFirst({ where: and(eq(s.streakStates.userId, id), eq(s.streakStates.kind, 'logging')) });
        await checkStreakRecord(c, id, st?.best ?? logging.after, target);
      }
      await recomputeSmartTimes(c, id, today, u.timezone);
      await ensureSchedules(c, id);
      await rescheduleUser(c, id);
      await c.db.update(s.profiles).set({ rolledOverFor: target }).where(eq(s.profiles.userId, id));
      stats.rolled++;
    } catch (e) {
      stats.errors++;
      log.error('jobs.rollover_failed', { userId: id, error: (e as Error).message, stack: (e as Error).stack?.split('\n').slice(0, 4).join(' | ') });
    }
  }
  return stats;
}

/** Step 4 (§14): once every active member of a team has rolled over for the team-local date, settle the team streak. */
export async function rolloverTeams(c: Container, ctx: StepCtx): Promise<Stats> {
  const now = c.clock.now();
  const teams = await c.db.query.teams.findMany();
  const stats = { teams: teams.length, settled: 0, waiting: 0, milestones: 0, weeksClosed: 0 };
  for (const t of teams) {
    if (!hasTime(ctx, 2000)) break;
    const target = rolloverTargetDate(now, t.timezone);
    const key = `team_rollover:${t.id}`;
    const state = await getJobState<{ date: string }>(c, key);
    if (state && state.date >= target) continue;
    const [pending] = await c.db.execute<{ n: number }>(sql`
      select count(*)::int as n from users u join profiles p on p.user_id = u.id
       where u.team_id = ${t.id} and u.status = 'active' and u.onboarded_at is not null
         and (p.rolled_over_for is null or p.rolled_over_for < ${target}::date)`);
    if (Number(pending?.n ?? 0) > 0) {
      stats.waiting++;
      continue;
    }
    const team = await getTeam(c, t.id);
    const r = await recomputeTeamStreak(c, t.id, localDateOf(now, team.timezone));
    for (const m of r?.milestones ?? []) {
      stats.milestones++;
      await postSystemMessage(c, t.id, { systemKind: 'team_streak', body: `Team streak: ${m} days in a row with everyone logging 🎉`, meta: { days: m } });
    }
    // Leaderboard: this morning's standings, the crown, and on Monday the weekly close. A failure is retried next
    // tick (the job state below isn't written), and every step is idempotent.
    const morning = await teamMorning(c, t.id, target);
    if (morning.closed) stats.weeksClosed++;
    await setJobState(c, key, { date: target, current: r?.after ?? 0 });
    stats.settled++;
  }
  return stats;
}
