import { sql } from 'drizzle-orm';
import { monthKey } from '@clubhouse/ai-gateway';
import { localDateOf } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../../container';
import { notifyAdmins } from '../notify';
import { getJobState, setJobState, type Stats } from './shared';

const DEADMAN_MS = 15 * 60_000;

/** Month rollover: make sure every team has this month's budget row with the configured cap. */
async function rolloverBudgets(c: Container, month: string): Promise<number> {
  let created = 0;
  for (const st of await c.db.query.aiSettings.findMany()) {
    const r = await c.db
      .insert(s.aiBudgets)
      .values({ teamId: st.teamId, month, capUsd: st.budget.monthlyCapUsd })
      .onConflictDoNothing()
      .returning({ teamId: s.aiBudgets.teamId });
    created += r.length;
  }
  return created;
}

/** Storage rollup into job_state 'storage' (live images by team and kind) plus the soft-cap alert. */
async function storageRollup(c: Container, now: Date, month: string): Promise<{ teams: number; alerts: number }> {
  const rows = await c.db.execute<{ team_id: string; kind: string; n: number; bytes: string | number }>(sql`
    select team_id, kind, count(*)::int as n, coalesce(sum(bytes + thumb_bytes), 0)::bigint as bytes
      from images where purged_at is null group by team_id, kind`);
  const teams: Record<string, { bytes: number; count: number; byKind: Record<string, { bytes: number; count: number }> }> = {};
  for (const r of rows) {
    const t = (teams[r.team_id] ??= { bytes: 0, count: 0, byKind: {} });
    const bytes = Number(r.bytes);
    t.bytes += bytes;
    t.count += Number(r.n);
    t.byKind[r.kind] = { bytes, count: Number(r.n) };
  }
  await setJobState(c, 'storage', { at: now.toISOString(), teams });
  let alerts = 0;
  for (const team of await c.db.query.teams.findMany()) {
    const used = teams[team.id]?.bytes ?? 0;
    const capMb = team.settings.media.softCapMb;
    if (used / 1024 / 1024 < capMb) continue;
    await notifyAdmins(
      c,
      team.id,
      { type: 'system', title: 'Storage nearing its limit', body: `Media storage is at ${Math.round(used / 1024 / 1024)} MB of the ${capMb} MB soft cap. Consider a shorter retention period.`, url: '/admin/storage', dedupeKey: `storage:${team.id}:${month}` },
      { email: true },
    );
    alerts++;
  }
  return { teams: Object.keys(teams).length, alerts };
}

/** Dead-man's switch: no tick for 15 minutes means the external pinger stopped; tell the super admins (push + email). */
async function deadMansSwitch(c: Container, now: Date): Promise<{ lastTick: string | null; alerted: boolean }> {
  const [r] = await c.db.execute<{ last: string | Date | null }>(sql`
    select greatest((select max(started_at) from job_runs where job = 'tick'), (select acquired_at from job_locks where name = 'tick')) as last`);
  const last = r?.last ? new Date(r.last) : null;
  if (last && now.getTime() - last.getTime() < DEADMAN_MS) return { lastTick: last.toISOString(), alerted: false };
  const today = localDateOf(now, 'UTC');
  const state = await getJobState<{ date: string }>(c, 'deadman');
  if (state?.date === today) return { lastTick: last?.toISOString() ?? null, alerted: false };
  await setJobState(c, 'deadman', { date: today, lastTick: last?.toISOString() ?? null });
  const since = last ? `since ${last.toISOString().replace('T', ' ').slice(0, 16)} UTC` : 'yet';
  for (const team of await c.db.query.teams.findMany({ columns: { id: true } })) {
    await notifyAdmins(
      c,
      team.id,
      { type: 'system', title: 'Reminders are stalled', body: `The every-minute job hasn’t run ${since}. Check the cron pinger; reminders and rollovers are paused until it runs.`, url: '/admin/jobs', dedupeKey: `deadman:${team.id}:${today}` },
      { superOnly: true, email: true },
    );
  }
  return { lastTick: last?.toISOString() ?? null, alerted: true };
}

/** `POST|GET /api/jobs/daily` body (Vercel Cron, 00:30 UTC). Safe to run twice. */
export async function dailyWork(c: Container): Promise<Stats> {
  const now = c.clock.now();
  const month = monthKey(now);
  const budgets = await rolloverBudgets(c, month);
  const storage = await storageRollup(c, now, month);
  const dead = await deadMansSwitch(c, now);
  return { budgetRowsCreated: budgets, storageTeams: storage.teams, storageAlerts: storage.alerts, lastTick: dead.lastTick ?? 'never', deadmanAlerted: dead.alerted };
}

