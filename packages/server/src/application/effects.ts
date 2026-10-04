import { eq } from 'drizzle-orm';
import type { LogSideEffects, PersonalRecord } from '@clubhouse/contracts';
import { badgeFor, weekStartOf } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { log } from '../lib/log';
import type { AuthUser } from '../interface/http/types';
import { currentStanding, refreshWeeksFor } from './board';
import { postSystemMessage } from './chat';
import { memberClock } from './clockCtx';
import { runTriggers, type LogEventContext } from './memeEngine';
import { computeDayFacts, recomputeMemberStreaks, recomputeTeamStreak, teamAllLogged } from './momentum';
import { notifyUser } from './notify';
import { weekPlanProgress } from './plans';
import { signalTeam } from './realtime';
import { checkActivityRecords, checkStreakRecord } from './records';

export const emptyEffects = (): LogSideEffects => ({ memeMoments: [], milestones: [], streak: null, planProgress: null, personalRecords: [], points: null });

export interface SavedEvent {
  kind: 'food' | 'activity' | 'weight' | 'batch';
  id: string;
  date: string;
  isNew: boolean;
  deleted: boolean;
  row: (typeof s.foodLogs.$inferSelect) | (typeof s.activityLogs.$inferSelect) | (typeof s.weightEntries.$inferSelect) | null;
  prevDate?: string;
}

const STREAK_LABEL = { logging: 'logging', in_range: 'in-range', activity: 'activity' } as const;

/**
 * Everything that follows a saved log (SYS-STREAK-10, SYS-CHAT-10): day facts, momentum, badges and milestone posts,
 * personal records, weekly plan progress, the team streak, and meme triggers. Failures here never fail the save.
 */
export async function afterLogSaved(c: Container, user: AuthUser, ev: SavedEvent): Promise<LogSideEffects> {
  const effects = emptyEffects();
  try {
    const { today } = memberClock(c, user.timezone);
    // Crew points before the save, for the "+10 · you're #3" toast (only for this week's logs).
    const thisWeek = weekStartOf(ev.date) === weekStartOf(today) || (!!ev.prevDate && weekStartOf(ev.prevDate) === weekStartOf(today));
    const before = thisWeek ? await currentStanding(c, user).catch(() => null) : null;
    await computeDayFacts(c, user.id, ev.date);
    if (ev.prevDate && ev.prevDate !== ev.date) await computeDayFacts(c, user.id, ev.prevDate);
    await refreshWeeksFor(c, user.id, [ev.date, ev.prevDate]);
    if (thisWeek) {
      const after = await currentStanding(c, user).catch(() => null);
      if (after) effects.points = { gained: after.points - (before?.points ?? 0), total: after.points, rank: after.rank, rankBefore: before?.rank ?? null };
    }
    const changes = await recomputeMemberStreaks(c, user.id, today);
    const logging = changes.find((ch) => ch.kind === 'logging');
    if (logging) effects.streak = { current: logging.after, status: logging.statusAfter };

    const records: PersonalRecord[] = [];
    for (const ch of changes) {
      for (const m of ch.milestones) {
        const b = badgeFor(m);
        effects.milestones.push({ kind: ch.kind, days: m, badge: b.name, emoji: b.emoji });
        await notifyUser(c, user.id, { type: 'milestone', title: `${b.emoji} ${b.name}`, body: `${m}-day ${STREAK_LABEL[ch.kind]} momentum. That’s a badge!`, url: '/momentum', dedupeKey: `milestone:${user.id}:${ch.kind}:${m}` });
        await postSystemMessage(c, user.teamId, { systemKind: 'milestone', body: `${user.displayName} reached ${m} days of ${STREAK_LABEL[ch.kind]} momentum ${b.emoji} ${b.name}`, mentions: [user.id], meta: { userId: user.id, kind: ch.kind, days: m, badge: b.name } });
      }
    }
    const bestLogging = logging ? Math.max(logging.after, 0) : 0;
    if (logging && logging.after > logging.before) {
      const st = await c.db.query.streakStates.findFirst({ where: eq(s.streakStates.userId, user.id) });
      records.push(...(await checkStreakRecord(c, user.id, Math.max(bestLogging, st?.best ?? 0), ev.date)));
    }

    let planItemCompleted: { planItemId: string } | null = null;
    if (ev.kind === 'activity' && ev.row && !ev.deleted) {
      const row = ev.row as typeof s.activityLogs.$inferSelect;
      const type = await c.db.query.activityTypes.findFirst({ where: eq(s.activityTypes.id, row.typeId) });
      records.push(...(await checkActivityRecords(c, user.id, row, type?.key ?? 'other')));
      const progress = await weekPlanProgress(c, user.id, weekStartOf(ev.date));
      const item = progress.items.find((i) => i.itemId === row.planItemId);
      if (item) {
        effects.planProgress = { itemId: item.itemId, typeName: item.typeName, done: item.done, target: item.target };
        if (ev.isNew && item.done === item.target) planItemCompleted = { planItemId: item.itemId };
      }
    }
    effects.personalRecords = records;
    for (const r of records) {
      const label = { longest_run: 'longest run', longest_swim: 'longest swim', longest_ride: 'longest ride', longest_streak: 'longest streak', most_sessions_week: 'most sessions in a week' }[r];
      await postSystemMessage(c, user.teamId, { systemKind: 'record', body: `${user.displayName} set a new personal best: ${label} 🏅`, mentions: [user.id], meta: { userId: user.id, record: r } });
    }

    if (ev.date === today && !ev.deleted && (await teamAllLogged(c, user.teamId, today))) {
      const team = await recomputeTeamStreak(c, user.teamId, today);
      for (const m of team?.milestones ?? []) {
        await postSystemMessage(c, user.teamId, { systemKind: 'team_streak', body: `Team streak: ${m} days in a row with everyone logging 🎉`, meta: { days: m } });
      }
    }

    if (!ev.deleted && ev.kind !== 'batch' && ev.row) {
      const ctx: LogEventContext = {
        kind: ev.kind,
        id: ev.id,
        date: ev.date,
        row: ev.row,
        streakChanges: changes,
        personalRecords: records,
        planItemCompleted,
      };
      effects.memeMoments = await runTriggers(c, user, ctx);
    }
    await signalTeam(c, user.teamId, 'pulse', { userId: user.id });
  } catch (e) {
    log.error('effects.failed', { userId: user.id, kind: ev.kind, id: ev.id, error: (e as Error).message, stack: (e as Error).stack?.split('\n').slice(0, 5).join(' | ') });
  }
  return effects;
}
