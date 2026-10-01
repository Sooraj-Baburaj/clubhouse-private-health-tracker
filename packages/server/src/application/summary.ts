import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { SummaryResponse } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import type { AuthUser } from '../interface/http/types';
import { computeDay, logicSummary, nextUpFor } from './today';

/** Inputs changed: regenerate at most every 10 minutes (and never within 30 s of a log); logic text fills the gap. */
const REGENERATE_AFTER_MS = 10 * 60_000;
const DEBOUNCE_AFTER_LOG_MS = 30_000;

/**
 * APP-HOME-02/03 + plan §13: the Coach card. Returns the cached AI summary for the member's day when the inputs have
 * not changed, regenerates at most every 10 minutes (never within 30 s of a log), and otherwise returns the logic text
 * flagged `stale` so the client polls again shortly.
 */
export async function getSummary(c: Container, user: AuthUser, dateIn?: string): Promise<SummaryResponse> {
  const d = await computeDay(c, user, dateIn);
  const { nextUp, swapCandidate } = await nextUpFor(c, user, d);
  const logic: SummaryResponse = { mode: 'logic', sentences: logicSummary(d, nextUp), swapIdea: null, updatedAt: null, callId: null, stale: false };
  if (!d.eff) return logic;

  const streak = await c.db.query.streakStates.findFirst({ where: and(eq(s.streakStates.userId, user.id), eq(s.streakStates.kind, 'logging')) });
  const input = {
    firstName: user.displayName.split(' ')[0] ?? user.displayName,
    localTime: d.localTime,
    goal: (d.profile.goalType ?? 'maintain') as 'lose' | 'maintain' | 'gain',
    targets: { ...d.targets, kcal: d.budgetKcal },
    eaten: d.eaten,
    burnedKcal: d.burned,
    remainingKcal: Math.round(d.remaining.kcal),
    bandLabels: Object.fromEntries(Object.entries(d.bands).map(([k, b]) => [k, b.label])),
    lowestNutrient: d.lowest,
    loggedSlots: d.loggedSlots,
    week: { daysLogged: d.daysLogged, daysInRange: d.daysInRange, avgKcal: d.weekAvgKcal },
    streakDays: streak?.current ?? 0,
    nextMeal: nextUp?.option ? { slot: nextUp.slotLabel, optionName: nextUp.option.name, kcal: Math.round(nextUp.option.nutrition.kcal), proteinG: Math.round(nextUp.option.nutrition.protein) } : null,
    swapCandidate,
  };
  // Hash rounded inputs only, so tiny changes (a minute of local time) do not invalidate the cache.
  const hash = createHash('sha256')
    .update(JSON.stringify({ ...input, localTime: input.localTime.slice(0, 2) }))
    .digest('hex')
    .slice(0, 32);

  const cached = await c.db.query.aiSummaries.findFirst({ where: and(eq(s.aiSummaries.userId, user.id), eq(s.aiSummaries.feature, 'home.summary'), eq(s.aiSummaries.localDate, d.date)) });
  const fromCache = (stale: boolean): SummaryResponse | null => {
    const out = cached?.output as { sentences?: string[]; swapIdea?: string } | undefined;
    if (!cached || !out?.sentences?.length) return null;
    return { mode: 'ai', sentences: out.sentences, swapIdea: out.swapIdea || null, updatedAt: cached.createdAt.toISOString(), callId: cached.aiCallId, stale };
  };
  if (d.profile.aiOptOuts.summary) return logic;
  if (cached && cached.inputHash === hash) return fromCache(false) ?? logic;

  const now = c.clock.now().getTime();
  const tooSoon = cached && now - cached.createdAt.getTime() < REGENERATE_AFTER_MS;
  const lastLog = await c.db.query.foodLogs.findFirst({ where: eq(s.foodLogs.userId, user.id), orderBy: [desc(s.foodLogs.serverUpdatedAt)] });
  const justLogged = !!lastLog && now - lastLog.serverUpdatedAt.getTime() < DEBOUNCE_AFTER_LOG_MS;
  // Never show AI text whose numbers no longer match; the logic text is always current.
  if (tooSoon || justLogged) return { ...logic, stale: true };

  const r = await c.ai.callFeature('home.summary', { teamId: user.teamId, userId: user.id, dayStart: d.clock.dayStart, memberOptedOut: d.profile.aiOptOuts.summary }, input);
  if (!r.ok) return fromCache(true) ?? logic;
  const output = { sentences: r.data.sentences, swapIdea: r.data.swapIdea };
  const values = { userId: user.id, feature: 'home.summary', localDate: d.date, inputHash: hash, output, aiCallId: r.callId, createdAt: c.clock.now() };
  await c.db.insert(s.aiSummaries).values(values).onConflictDoUpdate({ target: [s.aiSummaries.userId, s.aiSummaries.feature, s.aiSummaries.localDate], set: values });
  return { mode: 'ai', sentences: output.sentences, swapIdea: output.swapIdea || null, updatedAt: values.createdAt.toISOString(), callId: r.callId, stale: false };
}
