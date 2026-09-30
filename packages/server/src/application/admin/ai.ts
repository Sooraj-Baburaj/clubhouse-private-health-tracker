import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import { AI_FEATURE_KEYS, type AdminAiResponse, type AiBudgetUpdate, type AiCallRow, type AiFeatureKey, type AiFeatureUpdate, type AiPricingRow, type AiUsageRow } from '@clubhouse/contracts';
import { FEATURES, isRegistered, monthKey, registryEntries } from '@clubhouse/ai-gateway';
import { addDays, localDateOf, startOfLocalDay } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { z } from 'zod';
import type { Container } from '../../container';
import { badRequest, notFound } from '../../lib/errors';
import { getTeam } from '../team';
import { logAudit, monthStartUtc, nextMonthStartUtc, personMap, personOf, requireSuper, round6, toCsv, type Actor } from './shared';

const NOT_BLOCKED = sql`${s.aiCalls.outcome} not in ('budget_blocked','cap_blocked')`;
/** Calls where the member did not get an AI answer and saw the logic fallback. */
const FALLBACK_OUTCOMES = sql`${s.aiCalls.outcome} not in ('ok','fallback','pending')`;
/** Appendix B output-token budgets per feature (drift flagged at 1.5×). */
const OUTPUT_TARGETS: Record<AiFeatureKey, number> = { 'food.photo': 450, 'food.text': 350, 'home.summary': 160, 'progress.narrative': 110, 'diet.draft': 4500 };

async function settingsRow(c: Container, teamId: string) {
  const row = await c.db.query.aiSettings.findFirst({ where: eq(s.aiSettings.teamId, teamId) });
  if (row) return row;
  const { seed } = await import('@clubhouse/db');
  const [created] = await c.db.insert(s.aiSettings).values({ teamId, globalOn: false, features: seed.DEFAULT_AI_FEATURES, budget: seed.DEFAULT_AI_BUDGET, promptRetentionDays: 0 }).onConflictDoNothing().returning();
  return created ?? (await c.db.query.aiSettings.findFirst({ where: eq(s.aiSettings.teamId, teamId) }))!;
}

function featureSetting(row: Awaited<ReturnType<typeof settingsRow>>, key: AiFeatureKey) {
  return row.features[key] ?? { on: false, model: FEATURES[key].defaultModel, dailyCap: 20 };
}

export async function overview(c: Container, a: Actor): Promise<AdminAiResponse> {
  const teamId = a.user.teamId;
  const team = await getTeam(c, teamId);
  const tz = team.timezone;
  const now = c.clock.now();
  const month = monthKey(now);
  const mStart = monthStartUtc(now);
  const today = localDateOf(now, tz);
  const dayStart = startOfLocalDay(today, tz);
  const settings = await settingsRow(c, teamId);
  const base = and(eq(s.aiCalls.teamId, teamId), eq(s.aiCalls.test, false));
  const [budgetRow, byFeature, [todayRow], pricing, byDay, byHour, outcomes, [eff], perFeatureOut, [imageIn]] = await Promise.all([
    c.db.query.aiBudgets.findFirst({ where: and(eq(s.aiBudgets.teamId, teamId), eq(s.aiBudgets.month, month)) }),
    c.db
      .select({ feature: s.aiCalls.feature, calls: sql<number>`count(*)::int`, cost: sql<number>`coalesce(sum(${s.aiCalls.costUsd}), 0)::float8`, fallbacks: sql<number>`count(*) filter (where ${FALLBACK_OUTCOMES})::int` })
      .from(s.aiCalls)
      .where(and(base, gte(s.aiCalls.startedAt, mStart), NOT_BLOCKED))
      .groupBy(s.aiCalls.feature),
    c.db.select({ n: sql<number>`count(*)::int` }).from(s.aiCalls).where(and(base, gte(s.aiCalls.startedAt, dayStart), NOT_BLOCKED)),
    c.db.select().from(s.aiPricing).orderBy(s.aiPricing.model, desc(s.aiPricing.effectiveFrom)),
    c.db
      .select({ date: sql<string>`to_char(${s.aiCalls.startedAt} at time zone ${tz}, 'YYYY-MM-DD')`, cost: sql<number>`coalesce(sum(${s.aiCalls.costUsd}), 0)::float8`, calls: sql<number>`count(*)::int` })
      .from(s.aiCalls)
      .where(and(base, gte(s.aiCalls.startedAt, startOfLocalDay(addDays(today, -29), tz)), NOT_BLOCKED))
      .groupBy(sql`1`),
    c.db
      .select({ hour: sql<number>`extract(hour from ${s.aiCalls.startedAt} at time zone ${tz})::int`, calls: sql<number>`count(*)::int` })
      .from(s.aiCalls)
      .where(and(base, gte(s.aiCalls.startedAt, startOfLocalDay(addDays(today, -6), tz))))
      .groupBy(sql`1`),
    c.db.select({ outcome: s.aiCalls.outcome, n: sql<number>`count(*)::int` }).from(s.aiCalls).where(and(base, gte(s.aiCalls.startedAt, mStart))).groupBy(s.aiCalls.outcome),
    c.db.select({ input: sql<number>`coalesce(sum(${s.aiCalls.inputTokens}), 0)::float8`, cacheRead: sql<number>`coalesce(sum(${s.aiCalls.cacheReadTokens}), 0)::float8` }).from(s.aiCalls).where(and(base, gte(s.aiCalls.startedAt, mStart))),
    c.db
      .select({ feature: s.aiCalls.feature, avg: sql<number>`coalesce(avg(${s.aiCalls.outputTokens}), 0)::float8`, n: sql<number>`count(*)::int` })
      .from(s.aiCalls)
      .where(and(base, gte(s.aiCalls.startedAt, mStart), sql`${s.aiCalls.outcome} in ('ok','fallback')`, sql`${s.aiCalls.model} <> 'mock'`))
      .groupBy(s.aiCalls.feature),
    c.db
      .select({ avg: sql<number | null>`avg(${s.aiCalls.inputTokens})::float8` })
      .from(s.aiCalls)
      .where(and(base, gte(s.aiCalls.startedAt, mStart), eq(s.aiCalls.feature, 'food.photo'), sql`${s.aiCalls.outcome} in ('ok','fallback')`, sql`${s.aiCalls.model} <> 'mock'`)),
  ]);
  const monthSpend = round6(Number(budgetRow?.spentUsd ?? byFeature.reduce((acc, f) => acc + Number(f.cost), 0)));
  const daysInMonth = Math.round((nextMonthStartUtc(now).getTime() - mStart.getTime()) / 86400_000);
  const elapsedDays = Math.max(1, (now.getTime() - mStart.getTime()) / 86400_000);
  const cacheHitRate = eff && eff.input + eff.cacheRead > 0 ? Math.round((Number(eff.cacheRead) / (Number(eff.input) + Number(eff.cacheRead))) * 100) / 100 : 0;
  const avgOutputTokens = perFeatureOut.map((r) => {
    const target = OUTPUT_TARGETS[r.feature as AiFeatureKey] ?? 500;
    const value = Math.round(Number(r.avg));
    return { feature: r.feature, value, target, drift: value > target * 1.5 };
  });
  const hints: string[] = [];
  if (!settings.globalOn) hints.push('AI is switched off for the team; every feature is using its logic fallback.');
  if (c.ai.mode !== 'live') hints.push(`The AI gateway runs in “${c.ai.mode}” mode in this environment, so no real model calls are made.`);
  for (const d of avgOutputTokens.filter((x) => x.drift)) hints.push(`${d.feature} answers average ${d.value} output tokens (target ${d.target}); check the prompt or max tokens.`);
  const photoAvg = imageIn?.avg != null ? Math.round(Number(imageIn.avg)) : null;
  if (photoAvg && photoAvg > 2500) hints.push(`Photo calls average ${photoAvg} input tokens; images may not be downscaled to 1024 px.`);
  if (cacheHitRate < 0.3 && (eff?.input ?? 0) > 50_000) hints.push('Prompt cache hit rate is low; the system prompts may not be byte-stable.');
  return {
    globalOn: settings.globalOn,
    environmentMode: c.ai.mode,
    features: AI_FEATURE_KEYS.map((key) => {
      const f = featureSetting(settings, key);
      const st = byFeature.find((x) => x.feature === key);
      return {
        key,
        name: FEATURES[key].name,
        on: f.on,
        model: f.model || FEATURES[key].defaultModel,
        dailyCap: f.dailyCap,
        callsMonth: st?.calls ?? 0,
        costMonth: round6(Number(st?.cost ?? 0)),
        fallbackRate: st?.calls ? Math.round((st.fallbacks / st.calls) * 100) / 100 : 0,
        fallback: FEATURES[key].fallback,
      };
    }),
    budget: settings.budget,
    month,
    monthSpend,
    projectedSpend: round6((monthSpend / elapsedDays) * daysInMonth),
    callsToday: todayRow?.n ?? 0,
    pricing: pricing.map((p) => ({ model: p.model, effectiveFrom: p.effectiveFrom, inputPerMtok: p.inputPerMtok, outputPerMtok: p.outputPerMtok, cacheReadPerMtok: p.cacheReadPerMtok, cacheWritePerMtok: p.cacheWritePerMtok })),
    promptRetentionDays: settings.promptRetentionDays,
    spendByDay: Array.from({ length: 30 }, (_, i) => addDays(today, i - 29)).map((d) => {
      const r = byDay.find((x) => x.date === d);
      return { date: d, cost: round6(Number(r?.cost ?? 0)), calls: r?.calls ?? 0 };
    }),
    spendByFeature: byFeature.map((f) => ({ feature: f.feature, cost: round6(Number(f.cost)), calls: f.calls })).sort((x, y) => y.cost - x.cost),
    callsByHour: Array.from({ length: 24 }, (_, h) => ({ hour: h, calls: byHour.find((x) => x.hour === h)?.calls ?? 0 })),
    outcomes: Object.fromEntries(outcomes.map((o) => [o.outcome, o.n])),
    efficiency: { cacheHitRate, avgImageInputTokens: photoAvg, avgOutputTokens, hints },
  };
}

/** ADM-AI-01: the global switch. The gateway reads ai_settings on every call, so it takes effect immediately. */
export async function setGlobal(c: Container, a: Actor, on: boolean, reason: string | undefined) {
  const row = await settingsRow(c, a.user.teamId);
  await c.db.update(s.aiSettings).set({ globalOn: on, updatedBy: a.user.id, updatedAt: c.clock.now() }).where(eq(s.aiSettings.teamId, a.user.teamId));
  await logAudit(c, a, { action: 'ai.global_toggle', targetType: 'ai_settings', targetId: a.user.teamId, before: { globalOn: row.globalOn }, after: { globalOn: on }, reason: reason ?? null });
}

export async function updateFeature(c: Container, a: Actor, key: string, input: z.infer<typeof AiFeatureUpdate>) {
  if (!isRegistered(key)) throw notFound('Unknown AI feature.');
  if (input.model !== undefined) requireSuper(a, 'change AI models');
  const row = await settingsRow(c, a.user.teamId);
  const prev = featureSetting(row, key);
  const next = { on: input.on ?? prev.on, model: input.model ?? prev.model, dailyCap: input.dailyCap ?? prev.dailyCap };
  await c.db.update(s.aiSettings).set({ features: { ...row.features, [key]: next }, updatedBy: a.user.id, updatedAt: c.clock.now() }).where(eq(s.aiSettings.teamId, a.user.teamId));
  await logAudit(c, a, { action: 'ai.feature_update', targetType: 'ai_feature', targetId: key, before: prev, after: next });
}

export async function updateBudget(c: Container, a: Actor, input: z.infer<typeof AiBudgetUpdate>) {
  requireSuper(a, 'change the AI budget');
  const row = await settingsRow(c, a.user.teamId);
  const month = monthKey(c.clock.now());
  await c.db.transaction(async (tx) => {
    await tx.update(s.aiSettings).set({ budget: input, updatedBy: a.user.id, updatedAt: c.clock.now() }).where(eq(s.aiSettings.teamId, a.user.teamId));
    await tx
      .insert(s.aiBudgets)
      .values({ teamId: a.user.teamId, month, capUsd: input.monthlyCapUsd })
      .onConflictDoUpdate({ target: [s.aiBudgets.teamId, s.aiBudgets.month], set: { capUsd: input.monthlyCapUsd, updatedAt: c.clock.now() } });
  });
  await logAudit(c, a, { action: 'ai.budget_update', targetType: 'ai_settings', targetId: a.user.teamId, before: row.budget, after: input });
}

export async function addPricing(c: Container, a: Actor, input: z.infer<typeof AiPricingRow>) {
  requireSuper(a, 'change AI pricing');
  const existing = await c.db.query.aiPricing.findFirst({ where: and(eq(s.aiPricing.model, input.model), eq(s.aiPricing.effectiveFrom, input.effectiveFrom)) });
  await c.db
    .insert(s.aiPricing)
    .values({ ...input, createdBy: a.user.id })
    .onConflictDoUpdate({ target: [s.aiPricing.model, s.aiPricing.effectiveFrom], set: { inputPerMtok: input.inputPerMtok, outputPerMtok: input.outputPerMtok, cacheReadPerMtok: input.cacheReadPerMtok, cacheWritePerMtok: input.cacheWritePerMtok, createdBy: a.user.id } });
  await logAudit(c, a, { action: 'ai.pricing_update', targetType: 'ai_pricing', targetId: `${input.model}@${input.effectiveFrom}`, before: existing ?? null, after: input });
}

export async function updateRetention(c: Container, a: Actor, days: number) {
  requireSuper(a, 'change prompt retention');
  const row = await settingsRow(c, a.user.teamId);
  await c.db.update(s.aiSettings).set({ promptRetentionDays: days, updatedBy: a.user.id, updatedAt: c.clock.now() }).where(eq(s.aiSettings.teamId, a.user.teamId));
  if (days === 0) await c.db.update(s.aiCalls).set({ promptSnapshot: null }).where(and(eq(s.aiCalls.teamId, a.user.teamId), sql`${s.aiCalls.promptSnapshot} is not null`));
  await logAudit(c, a, { action: 'ai.retention_update', targetType: 'ai_settings', targetId: a.user.teamId, before: { promptRetentionDays: row.promptRetentionDays }, after: { promptRetentionDays: days } });
}

async function rangeBounds(c: Container, teamId: string, from: string, to: string) {
  if (from > to) throw badRequest('The start date must be before the end date.', 'bad_range');
  const team = await getTeam(c, teamId);
  return { start: startOfLocalDay(from, team.timezone), end: startOfLocalDay(addDays(to, 1), team.timezone) };
}

export async function usage(c: Container, a: Actor, from: string, to: string): Promise<AiUsageRow[]> {
  const { start, end } = await rangeBounds(c, a.user.teamId, from, to);
  const rows = await c.db
    .select({
      userId: s.aiCalls.userId,
      feature: s.aiCalls.feature,
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${s.aiCalls.inputTokens}), 0)::float8`,
      outputTokens: sql<number>`coalesce(sum(${s.aiCalls.outputTokens}), 0)::float8`,
      cachedTokens: sql<number>`coalesce(sum(${s.aiCalls.cacheReadTokens}), 0)::float8`,
      cost: sql<number>`coalesce(sum(${s.aiCalls.costUsd}), 0)::float8`,
      latency: sql<number>`coalesce(avg(${s.aiCalls.latencyMs}), 0)::float8`,
      fallbacks: sql<number>`count(*) filter (where ${FALLBACK_OUTCOMES})::int`,
    })
    .from(s.aiCalls)
    .where(and(eq(s.aiCalls.teamId, a.user.teamId), eq(s.aiCalls.test, false), gte(s.aiCalls.startedAt, start), lt(s.aiCalls.startedAt, end), NOT_BLOCKED))
    .groupBy(s.aiCalls.userId, s.aiCalls.feature);
  const people = await personMap(c, rows.map((r) => r.userId));
  return rows
    .map((r) => ({
      person: personOf(people, r.userId),
      feature: r.feature,
      calls: r.calls,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      cachedTokens: Number(r.cachedTokens),
      cost: round6(Number(r.cost)),
      avgLatencyMs: Math.round(Number(r.latency)),
      fallbackRate: r.calls ? Math.round((r.fallbacks / r.calls) * 100) / 100 : 0,
    }))
    .sort((x, y) => y.cost - x.cost || y.calls - x.calls);
}

export async function usageCsv(c: Container, a: Actor, from: string, to: string) {
  const rows = await usage(c, a, from, to);
  return toCsv(
    rows.map((r) => ({ member: r.person?.name ?? '(system)', feature: r.feature, calls: r.calls, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cached_tokens: r.cachedTokens, cost_usd: r.cost, avg_latency_ms: r.avgLatencyMs, fallback_rate: r.fallbackRate })),
    ['member', 'feature', 'calls', 'input_tokens', 'output_tokens', 'cached_tokens', 'cost_usd', 'avg_latency_ms', 'fallback_rate'],
  );
}

type CallDbRow = typeof s.aiCalls.$inferSelect;

async function callRows(c: Container, rows: CallDbRow[], withSnapshot: boolean): Promise<AiCallRow[]> {
  const people = await personMap(c, rows.map((r) => r.userId));
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    person: personOf(people, r.userId),
    feature: r.feature,
    model: r.model,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    costUsd: round6(Number(r.costUsd)),
    outcome: r.outcome,
    latencyMs: r.latencyMs,
    errorCategory: r.errorCategory,
    errorMessage: r.errorMessage,
    entity: r.entityType && r.entityId ? { type: r.entityType, id: r.entityId } : null,
    test: r.test,
    promptSnapshot: withSnapshot ? (r.promptSnapshot ?? null) : null,
  }));
}

export async function calls(c: Container, a: Actor, q: { userId?: string; feature?: string; outcome?: string; before?: string; limit: number }) {
  const conds: SQL[] = [eq(s.aiCalls.teamId, a.user.teamId)];
  if (q.userId) conds.push(eq(s.aiCalls.userId, q.userId));
  if (q.feature) conds.push(eq(s.aiCalls.feature, q.feature));
  if (q.outcome) conds.push(eq(s.aiCalls.outcome, q.outcome));
  if (q.before) {
    const d = new Date(q.before);
    if (Number.isNaN(d.getTime())) throw badRequest('Invalid cursor.', 'invalid_cursor');
    conds.push(lt(s.aiCalls.startedAt, d));
  }
  const rows = await c.db.select().from(s.aiCalls).where(and(...conds)).orderBy(desc(s.aiCalls.startedAt)).limit(q.limit + 1);
  return { calls: await callRows(c, rows.slice(0, q.limit), false), hasMore: rows.length > q.limit };
}

export async function call(c: Container, a: Actor, id: string): Promise<AiCallRow> {
  const row = await c.db.query.aiCalls.findFirst({ where: and(eq(s.aiCalls.id, id), eq(s.aiCalls.teamId, a.user.teamId)) });
  if (!row) throw notFound('AI call not found.');
  return (await callRows(c, [row], true))[0]!;
}

export function registry() {
  return registryEntries().map((e) => ({ ...e, system: e.system ?? null }));
}

/** A small plain PNG generated on demand (sharp is loaded lazily) so the food.photo test call has a real image. */
async function samplePng(): Promise<string> {
  const sharp = (await import('sharp')).default;
  const buf = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 214, g: 190, b: 150 } } }).png().toBuffer();
  return buf.toString('base64');
}

async function sampleInput(key: AiFeatureKey) {
  const N = (kcal: number, protein: number, carbs: number, fat: number, fibre: number) => ({ kcal, protein, carbs, fat, fibre });
  switch (key) {
    case 'food.photo':
      return { image: { data: await samplePng(), mediaType: 'image/png' as const }, slot: 'lunch' as const, localTime: '13:15', hint: 'test call from the admin panel' };
    case 'food.text':
      return { text: '2 rotis, dal and a bowl of curd', slot: 'lunch' as const, localTime: '13:15' };
    case 'home.summary':
      return {
        firstName: 'Test',
        localTime: '16:30',
        goal: 'lose' as const,
        targets: N(1800, 110, 200, 55, 26),
        eaten: N(1050, 52, 130, 32, 14),
        burnedKcal: 220,
        remainingKcal: 750,
        bandLabels: { kcal: 'room to fuel', protein: 'low' },
        lowestNutrient: { nutrient: 'protein', pct: 47 },
        loggedSlots: ['breakfast', 'lunch'],
        week: { daysLogged: 5, daysInRange: 3, avgKcal: 1760 },
        streakDays: 6,
        nextMeal: { slot: 'dinner', optionName: 'Paneer tikka + roti', kcal: 390, proteinG: 24 },
        swapCandidate: null,
      };
    case 'progress.narrative':
      return { firstName: 'Test', goal: 'lose' as const, trendKg: 78.4, weeklyChangeKg: -0.4, avgNetKcal: 1650, tdee: 2100, goalWeightKg: 72, etaDate: null, loggedDays: 21, highestDays: [{ date: '2026-09-20', weekday: 'Sunday', kcal: 2450 }], activeDaysPerWeek: 3 };
    case 'diet.draft':
      return {
        memberFirstName: 'Test',
        targets: N(1800, 110, 200, 55, 26),
        goal: 'lose' as const,
        perSlotKcal: { breakfast: 450, morning_snack: 180, lunch: 540, evening_snack: 180, dinner: 450 },
        optionsPerSlot: 2,
        diet: 'vegetarian' as const,
        allergies: [],
        dislikes: [],
        cuisines: ['north indian'],
        favourites: [],
        notForMe: [],
        brief: 'Test call from the admin panel.',
        knownFoods: ['Roti', 'Dal tadka', 'Poha', 'Curd'],
      };
  }
}

/** ADM-AI "test call": one call per feature with fixed sample input, marked `test` (no member caps, excluded from usage). */
export async function testCall(c: Container, a: Actor, key: string) {
  if (!isRegistered(key)) throw notFound('Unknown AI feature.');
  const today = localDateOf(c.clock.now(), a.user.timezone);
  const ctx = { teamId: a.user.teamId, userId: a.user.id, dayStart: startOfLocalDay(today, a.user.timezone), test: true, entity: null };
  // The per-key input type is enforced by sampleInput's switch; the union needs a cast to satisfy the generic.
  const r = await c.ai.callFeature(key, ctx, (await sampleInput(key)) as never);
  await logAudit(c, a, { action: 'ai.test_call', targetType: 'ai_feature', targetId: key, after: { ok: r.ok, callId: r.callId, reason: r.ok ? null : r.reason } });
  if (r.ok) return { ok: true, reason: null, message: null, output: r.data, usage: r.usage, callId: r.callId };
  return { ok: false, reason: r.reason, message: r.message, output: null, usage: null, callId: r.callId };
}

