import { and, asc, eq, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import { monthKey } from '@clubhouse/ai-gateway';
import { addDays, localDateOf } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../../container';
import { log } from '../../lib/log';
import { cleanupExpiredSessions } from '../auth';
import { notifyAdmins } from '../notify';
import { getJobState, hasTime, setJobState, type Stats, type StepCtx } from './shared';

const DAY = 86400_000;

/**
 * Step 6 (§14): expired food/activity/chat images (≤ 100 per tick): mark purge requested, delete the object and its
 * thumbnail (a missing object counts as deleted), then mark purged. The API reports purged images as expired.
 */
export async function retentionCleanup(c: Container, ctx: StepCtx): Promise<Stats> {
  const now = c.clock.now();
  const rows = await c.db
    .select()
    .from(s.images)
    .where(and(lte(s.images.expiresAt, now), isNull(s.images.purgedAt)))
    .orderBy(asc(s.images.expiresAt))
    .limit(100);
  const byTeam = new Map<string, { n: number; bytes: number }>();
  let failed = 0;
  for (const img of rows) {
    if (!hasTime(ctx, 1000)) break;
    if (!img.purgeRequestedAt) await c.db.update(s.images).set({ purgeRequestedAt: now }).where(eq(s.images.id, img.id));
    try {
      await c.storage.delete(img.storageKey);
      if (img.thumbKey) await c.storage.delete(img.thumbKey);
      await c.db.update(s.images).set({ purgedAt: c.clock.now() }).where(eq(s.images.id, img.id));
      const t = byTeam.get(img.teamId) ?? { n: 0, bytes: 0 };
      t.n++;
      t.bytes += img.bytes + img.thumbBytes;
      byTeam.set(img.teamId, t);
    } catch (e) {
      failed++;
      log.warn('jobs.retention_delete_failed', { imageId: img.id, error: (e as Error).message });
    }
  }
  for (const [teamId, t] of byTeam) {
    await c.db.insert(s.retentionRuns).values({ teamId, dryRun: false, trigger: ctx.source.startsWith('admin') ? 'admin' : 'tick', imagesDeleted: t.n, bytesReclaimed: t.bytes, status: 'done', finishedAt: c.clock.now() });
  }
  const purged = [...byTeam.values()].reduce((a, t) => a + t.n, 0);
  return { expired: rows.length, purged, failed, bytes: [...byTeam.values()].reduce((a, t) => a + t.bytes, 0) };
}

/**
 * Step 7 (§14): bounded deletes and state repairs. Runs at most hourly from the tick (every call when run by an admin).
 */
export async function housekeeping(c: Container, ctx: StepCtx): Promise<Stats> {
  const now = c.clock.now();
  if (!ctx.force) {
    const last = await getJobState<{ at: string }>(c, 'housekeeping');
    if (last && now.getTime() - Date.parse(last.at) < 3600_000) return { skipped: 'ran_recently' };
  }
  const stats: Stats = {};
  await cleanupExpiredSessions(c);
  stats.sessions = true;

  stats.jobRuns = (await c.db.delete(s.jobRuns).where(lt(s.jobRuns.startedAt, new Date(now.getTime() - 7 * DAY))).returning({ id: s.jobRuns.id })).length;

  const expiredExports = await c.db
    .select()
    .from(s.exportsTable)
    .where(and(lte(s.exportsTable.expiresAt, now), isNull(s.exportsTable.purgedAt)))
    .limit(50);
  let exportsPurged = 0;
  for (const x of expiredExports) {
    try {
      if (x.storageKey) await c.storage.delete(x.storageKey);
      await c.db.update(s.exportsTable).set({ purgedAt: now, status: 'expired' }).where(eq(s.exportsTable.id, x.id));
      exportsPurged++;
    } catch (e) {
      log.warn('jobs.export_purge_failed', { id: x.id, error: (e as Error).message });
    }
  }
  stats.exports = exportsPurged;

  stats.aiLost = (
    await c.db
      .update(s.aiCalls)
      .set({ outcome: 'lost', finishedAt: now, errorCategory: 'lost', errorMessage: 'No result recorded within 5 minutes' })
      .where(and(eq(s.aiCalls.outcome, 'pending'), lt(s.aiCalls.startedAt, new Date(now.getTime() - 5 * 60_000))))
      .returning({ id: s.aiCalls.id })
  ).length;

  // Prompt snapshots are kept only for the team's retention window (0 = not kept at all).
  let snapshots = 0;
  for (const st of await c.db.query.aiSettings.findMany()) {
    const cutoff = new Date(now.getTime() - Math.max(0, st.promptRetentionDays) * DAY);
    snapshots += (
      await c.db
        .update(s.aiCalls)
        .set({ promptSnapshot: null })
        .where(and(eq(s.aiCalls.teamId, st.teamId), isNotNull(s.aiCalls.promptSnapshot), lt(s.aiCalls.startedAt, cutoff)))
        .returning({ id: s.aiCalls.id })
    ).length;
  }
  stats.promptSnapshots = snapshots;

  const old = new Date(now.getTime() - 180 * DAY);
  stats.triggerEvaluations = (await c.db.delete(s.triggerEvaluations).where(lt(s.triggerEvaluations.createdAt, old)).returning({ id: s.triggerEvaluations.id })).length;
  stats.memeFires = (await c.db.delete(s.memeFires).where(lt(s.memeFires.localDate, addDays(localDateOf(now, 'UTC'), -180))).returning({ id: s.memeFires.id })).length;
  stats.notifications = (
    await c.db
      .delete(s.notifications)
      .where(and(isNotNull(s.notifications.readAt), lt(s.notifications.readAt, new Date(now.getTime() - 90 * DAY))))
      .returning({ id: s.notifications.id })
  ).length;
  await setJobState(c, 'housekeeping', { at: now.toISOString(), ...stats });
  return stats;
}

/** Step 8 (§14): 50 / 80 / 100 % (and the team's own alert percent) of the monthly cap, each alerted once per month. */
export async function budgetAlerts(c: Container, _ctx: StepCtx): Promise<Stats> {
  const now = c.clock.now();
  const month = monthKey(now);
  let alerts = 0;
  const settings = await c.db.query.aiSettings.findMany();
  for (const st of settings) {
    const budget = await c.db.query.aiBudgets.findFirst({ where: and(eq(s.aiBudgets.teamId, st.teamId), eq(s.aiBudgets.month, month)) });
    if (!budget) continue;
    const cap = budget.capUsd > 0 ? budget.capUsd : st.budget.monthlyCapUsd;
    if (!cap || cap <= 0) continue;
    const pct = (budget.spentUsd / cap) * 100;
    const thresholds = [...new Set([50, 80, 100, Math.round(st.budget.alertAtPercent)])].filter((t) => t > 0 && t <= 100).sort((a, b) => a - b);
    const crossed = thresholds.filter((t) => pct >= t && !budget.alertsSent.includes(t));
    if (!crossed.length) continue;
    const merged = [...new Set([...budget.alertsSent, ...crossed])].sort((a, b) => a - b);
    const updated = await c.db
      .update(s.aiBudgets)
      .set({ alertsSent: merged, updatedAt: now })
      .where(and(eq(s.aiBudgets.teamId, st.teamId), eq(s.aiBudgets.month, month), sql`not (${s.aiBudgets.alertsSent} @> ${sql.raw(`ARRAY[${crossed.join(',')}]::int[]`)})`))
      .returning({ teamId: s.aiBudgets.teamId });
    if (!updated.length) continue;
    const top = crossed.at(-1)!;
    const atCap = top >= 100;
    const tail = atCap ? (st.budget.atCapBehaviour === 'disable' ? ' AI features are paused until next month or a higher cap.' : ' AI keeps running (warn mode).') : '';
    await notifyAdmins(
      c,
      st.teamId,
      {
        type: 'ai_budget_alert',
        title: `AI budget at ${top}%`,
        body: `The team has used $${budget.spentUsd.toFixed(2)} of its $${cap.toFixed(2)} AI budget for ${month} (${Math.round(pct)}%).${tail}`,
        url: '/admin/ai',
        tag: 'ai-budget',
        dedupeKey: `budget:${st.teamId}:${month}:${top}`,
      },
      { email: true },
    );
    alerts++;
  }
  return { teams: settings.length, alerts };
}
