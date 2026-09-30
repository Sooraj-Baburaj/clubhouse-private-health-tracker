import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { localDateOf, localTimeOf, weekdayOf, weekStartOf } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../../container';
import { log } from '../../lib/log';
import { runDayEnd } from '../memeEngine';
import { buildWeeklyRecap, notifyRecap, postTeamRecap, teamWeekFact } from '../recaps';
import { authUserFor, getJobState, hasTime, setJobState, type Stats, type StepCtx } from './shared';

const MAX_PER_TICK = 30;

/**
 * Step 5 (§14): members at Sunday ≥ their recap time (default 19:00) whose `recap:<user>` watermark is behind the ISO
 * week get a templated recap: stored, pushed + inbox, weekly_recap triggers, and one team post per week.
 */
export async function weeklyRecaps(c: Container, ctx: StepCtx): Promise<Stats> {
  const now = c.clock.now();
  const users = await c.db.query.users.findMany({ where: and(eq(s.users.status, 'active'), isNotNull(s.users.onboardedAt)) });
  const prefs = users.length
    ? await c.db.query.notificationPreferences.findMany({ where: and(inArray(s.notificationPreferences.userId, users.map((u) => u.id)), eq(s.notificationPreferences.type, 'weekly_recap')) })
    : [];
  const stats = { candidates: 0, built: 0, errors: 0, teamPosts: 0 };
  const facts = new Map<string, string>();
  for (const user of users) {
    if (stats.built >= MAX_PER_TICK || !hasTime(ctx, 4000)) break;
    const u = await authUserFor(c, user);
    const today = localDateOf(now, u.timezone);
    if (weekdayOf(today) !== 6) continue;
    const at = prefs.find((p) => p.userId === u.id)?.time ?? '19:00';
    if (localTimeOf(now, u.timezone) < at) continue;
    const week = weekStartOf(today);
    const key = `recap:${u.id}`;
    const state = await getJobState<{ week: string }>(c, key);
    if (state && state.week >= week) continue;
    stats.candidates++;
    try {
      const factKey = `${u.teamId}:${week}`;
      let fact = facts.get(factKey);
      if (!fact) {
        fact = (await teamWeekFact(c, u.teamId, week)).text;
        facts.set(factKey, fact);
      }
      const { row, created } = await buildWeeklyRecap(c, u, week, today, fact);
      if (created) await notifyRecap(c, u, row);
      await runDayEnd(c, u, today, 'weekly_recap');
      const teamKey = `recap_team:${u.teamId}`;
      const teamState = await getJobState<{ week: string }>(c, teamKey);
      if (!teamState || teamState.week < week) {
        await setJobState(c, teamKey, { week });
        await postTeamRecap(c, u.teamId, week, fact);
        stats.teamPosts++;
      }
      await setJobState(c, key, { week });
      stats.built++;
    } catch (e) {
      stats.errors++;
      log.error('jobs.recap_failed', { userId: u.id, error: (e as Error).message });
    }
  }
  return stats;
}
