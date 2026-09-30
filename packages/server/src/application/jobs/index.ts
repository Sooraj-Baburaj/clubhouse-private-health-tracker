import { eq } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../../container';
import { log } from '../../lib/log';
import { dailyWork } from './daily';
import { deliverNotifications, repairChatDigests } from './deliver';
import { acquireLease, releaseLease } from './lease';
import { budgetAlerts, housekeeping, retentionCleanup } from './maintenance';
import { weeklyRecaps } from './recap';
import { rolloverMembers, rolloverTeams } from './rollover';
import { hasTime, type Stats, type StepCtx } from './shared';

/** Job steps that can be run by the tick, the daily cron, or an admin ("Run step now"). Implemented by the jobs module. */
export const JOB_STEPS = ['deliver_notifications', 'chat_digests', 'rollover', 'team_rollover', 'recap', 'retention', 'housekeeping', 'budget_alerts'] as const;
export type JobStep = (typeof JOB_STEPS)[number];

export interface JobStepResult {
  ok: boolean;
  stats: Record<string, number | string | boolean>;
  error?: string;
}

const STEP_FNS: Record<JobStep, (c: Container, ctx: StepCtx) => Promise<Stats>> = {
  deliver_notifications: deliverNotifications,
  chat_digests: repairChatDigests,
  rollover: rolloverMembers,
  team_rollover: rolloverTeams,
  recap: weeklyRecaps,
  retention: retentionCleanup,
  housekeeping,
  budget_alerts: budgetAlerts,
};

/** Tick budget (§14): 50 s, tightened to the platform's invocation deadline when Vercel exposes one. */
export const TICK_BUDGET_MS = 50_000;
export const TICK_LEASE_SEC = 55;

async function startRun(c: Container, job: string, source: string): Promise<number | null> {
  try {
    const [row] = await c.db.insert(s.jobRuns).values({ job, source }).returning({ id: s.jobRuns.id });
    return row?.id ?? null;
  } catch (e) {
    log.warn('jobs.run_record_failed', { job, error: (e as Error).message });
    return null;
  }
}

async function finishRun(c: Container, id: number | null, ok: boolean, stats: Record<string, unknown>, error?: string) {
  if (id == null) return;
  await c.db
    .update(s.jobRuns)
    .set({ finishedAt: c.clock.now(), ok, stats, error: error?.slice(0, 1000) ?? null })
    .where(eq(s.jobRuns.id, id))
    .catch((e: Error) => log.warn('jobs.run_finish_failed', { id, error: e.message }));
}

async function execute(c: Container, step: JobStep, ctx: StepCtx): Promise<JobStepResult> {
  const started = Date.now();
  try {
    const stats = await STEP_FNS[step](c, ctx);
    return { ok: true, stats: { ...stats, ms: Date.now() - started } };
  } catch (e) {
    const err = e as Error;
    log.error('jobs.step_failed', { step, source: ctx.source, error: err.message, stack: err.stack?.split('\n').slice(0, 5).join(' | ') });
    return { ok: false, stats: { ms: Date.now() - started }, error: err.message };
  }
}

/** Run one step now and record it in job_runs (used by the admin "Run step now" and tests). Never throws. */
export async function runJobStep(c: Container, step: JobStep, source: string): Promise<JobStepResult> {
  const runId = await startRun(c, step, source);
  const r = await execute(c, step, { source, deadline: Date.now() + TICK_BUDGET_MS, force: true });
  await finishRun(c, runId, r.ok, r.stats, r.error);
  return r;
}

export interface TickResult {
  ok: boolean;
  steps: Partial<Record<JobStep, JobStepResult | { skipped: 'budget' }>>;
  ms: number;
}

/**
 * The every-minute tick body: the eight steps in order within the budget, one job_runs row ('tick') with per-step
 * stats, and the lease released at the end (the caller acquired it). Never throws.
 */
export async function runTick(c: Container, source: string, owner: string, deadline: number): Promise<TickResult> {
  const started = Date.now();
  const runId = await startRun(c, 'tick', source);
  const ctx: StepCtx = { source, deadline };
  const steps: TickResult['steps'] = {};
  let ok = true;
  try {
    for (const step of JOB_STEPS) {
      if (!hasTime(ctx, 1000)) {
        steps[step] = { skipped: 'budget' };
        continue;
      }
      const r = await execute(c, step, ctx);
      steps[step] = r;
      if (!r.ok) ok = false;
    }
  } finally {
    await releaseLease(c, 'tick', owner).catch((e: Error) => log.warn('jobs.lease_release_failed', { error: e.message }));
  }
  const ms = Date.now() - started;
  const errors = Object.entries(steps)
    .filter(([, r]) => r && 'ok' in r && !r.ok)
    .map(([k, r]) => `${k}: ${(r as JobStepResult).error}`)
    .join('; ');
  await finishRun(c, runId, ok, { steps, ms }, errors || undefined);
  return { ok, steps, ms };
}

/** The daily cron body (month rollover, storage rollup, dead-man's switch) with its own lease and job_runs row. */
export async function runDaily(c: Container, source: string, owner: string): Promise<JobStepResult> {
  const runId = await startRun(c, 'daily', source);
  let r: JobStepResult;
  try {
    r = { ok: true, stats: await dailyWork(c) };
  } catch (e) {
    const err = e as Error;
    log.error('jobs.daily_failed', { error: err.message });
    r = { ok: false, stats: {}, error: err.message };
  } finally {
    await releaseLease(c, 'daily', owner).catch(() => undefined);
  }
  await finishRun(c, runId, r.ok, r.stats, r.error);
  return r;
}

export { acquireLease, releaseLease };
