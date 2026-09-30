import { and, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm';
import type { MealSlot, Nutrient, Nutrients, TodayResponse } from '@clubhouse/contracts';
import { addDays, allBands, isDayClosed, nextOpenSlot, remainingOf, roundTotals, slotForTime, weekStartOf, ZERO_TOTALS } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { initials } from '../lib/crypto';
import type { AuthUser } from '../interface/http/types';
import { unreadChatCount } from './chat';
import { memberClock } from './clockCtx';
import { feedbackFor, optionDto, optionsFor, publishedPlanFor, rankPlan, timesLoggedByOption } from './dietView';
import { imageUrlMap, pick } from './images';
import { logsForDate } from './logs';
import { momentsForLogs } from './memeEngine';
import { unreadCount } from './notify';
import { weekPlanProgress } from './plans';
import { loadProfile } from './profile';
import { effectiveTargets } from './targets';
import { getTeam } from './team';

export const GOAL_WORDS: Record<string, string> = { lose: 'lean out', maintain: 'hold steady', gain: 'bulk up' };
const NUTRIENT_WORDS: Record<Nutrient, string> = { kcal: 'calories', protein: 'protein', carbs: 'carbs', fat: 'fat', fibre: 'fibre' };

/** The logic engine's view of a member-day: every number the Today screen and the AI summary use. */
export async function computeDay(c: Container, user: AuthUser, dateIn?: string) {
  const clock = memberClock(c, user.timezone);
  const date = dateIn && dateIn <= clock.today ? dateIn : clock.today;
  const isToday = date === clock.today;
  const [team, profile, logs] = await Promise.all([getTeam(c, user.teamId), loadProfile(c, user.id), logsForDate(c, user, user.id, date)]);
  const eff = effectiveTargets(profile);
  const targets: Nutrients = eff ? { kcal: eff.kcal, protein: eff.protein, carbs: eff.carbs, fat: eff.fat, fibre: eff.fibre } : { ...ZERO_TOTALS };
  const eaten = roundTotals(logs.raw.foods.reduce((a, f) => ({ kcal: a.kcal + f.totals.kcal, protein: a.protein + f.totals.protein, carbs: a.carbs + f.totals.carbs, fat: a.fat + f.totals.fat, fibre: a.fibre + f.totals.fibre }), { ...ZERO_TOTALS }));
  const burned = Math.round(logs.raw.acts.reduce((a, x) => a + x.kcalBurned, 0));
  const budgetKcal = Math.round(targets.kcal + (profile.eatBackExercise ? burned : 0));
  const loggedSlots = [...new Set(logs.raw.foods.map((f) => f.mealSlot as MealSlot))];
  const localTime = isToday ? clock.localTime : '23:59';
  const dayClosed = isDayClosed({ isToday, localTime, loggedSlots });
  const thresholds = { ...team.settings.thresholds, ...(profile.thresholdsOverride ?? {}) } as typeof team.settings.thresholds;
  const bands = allBands(eaten, { ...targets, kcal: budgetKcal }, thresholds, dayClosed);
  const currentSlot = isToday ? slotForTime(clock.localTime, team.settings.mealSlots) : 'dinner';
  const remaining = remainingOf({ ...targets, kcal: budgetKcal }, eaten);

  // Lowest of the nutrients people aim to reach (protein, fibre), as % of target.
  const lowest = (['protein', 'fibre'] as const)
    .filter((n) => targets[n] > 0)
    .map((n) => ({ nutrient: n as Nutrient, pct: Math.round((eaten[n] / targets[n]) * 100) }))
    .sort((a, b) => a.pct - b.pct)[0] ?? null;

  // Week context: completed days in the last 7 with food logged.
  const facts = await c.db.query.dayFacts.findMany({ where: and(eq(s.dayFacts.userId, user.id), gte(s.dayFacts.date, addDays(date, -7)), lt(s.dayFacts.date, date)) });
  const withFood = facts.filter((f) => f.foodLogged);
  const weekAvgKcal = withFood.length ? Math.round(withFood.reduce((a, f) => a + f.kcalEaten, 0) / withFood.length) : null;

  return { clock, date, isToday, team, profile, logs, eff, targets, eaten, burned, budgetKcal, loggedSlots, localTime, dayClosed, bands, currentSlot, remaining, lowest, weekAvgKcal, daysLogged: facts.filter((f) => f.logged).length, daysInRange: facts.filter((f) => f.inRange).length };
}
export type DayComputation = Awaited<ReturnType<typeof computeDay>>;

/** Best-fitting planned option for the next open slot today (APP-HOME-06), plus the member's usual choice for swaps. */
export async function nextUpFor(c: Container, user: AuthUser, d: DayComputation) {
  if (!d.isToday || !d.eff) return { nextUp: null, swapCandidate: null };
  const slot = nextOpenSlot(d.currentSlot, d.loggedSlots);
  if (!slot) return { nextUp: null, swapCandidate: null };
  const slotLabel = d.team.settings.mealSlots[slot].label;
  const plan = await publishedPlanFor(c, user.id);
  if (!plan) return { nextUp: { slot, slotLabel, option: null, afterKcal: null }, swapCandidate: null };
  const options = await optionsFor(c, plan.id);
  const training = d.logs.raw.acts.length > 0;
  const ranked = rankPlan(options, training ? 'training' : 'rest', d.remaining, d.currentSlot, d.loggedSlots).get(slot) ?? [];
  const [images, logged, feedback] = await Promise.all([imageUrlMap(c, ranked.map((r) => r.option.imageId)), timesLoggedByOption(c, user.id), feedbackFor(c, user.id)]);
  const usable = ranked.filter((r) => feedback.get(r.option.name.toLowerCase()) !== 'dislike');
  const best = usable[0] ?? ranked[0];
  if (!best) return { nextUp: { slot, slotLabel, option: null, afterKcal: null }, swapCandidate: null };
  const option = optionDto(best.option, images, { fits: best.fits, bestFit: best.bestFit, reaction: feedback.get(best.option.name.toLowerCase()), timesLogged: logged.get(best.option.id) ?? 0 });
  const usual = [...usable].sort((a, b) => (logged.get(b.option.id) ?? 0) - (logged.get(a.option.id) ?? 0))[0];
  const swapCandidate =
    usual && usual.option.id !== best.option.id && !usual.fits && (logged.get(usual.option.id) ?? 0) > 0
      ? { slot: slotLabel, from: usual.option.name, to: best.option.name, toKcal: Math.round(best.option.nutrition.kcal) }
      : null;
  return { nextUp: { slot, slotLabel, option, afterKcal: Math.round(d.remaining.kcal - best.option.nutrition.kcal) }, swapCandidate };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

/** The templated coach text used whenever AI is off, opted out, over budget or failing (APP-HOME-03). */
export function logicSummary(d: DayComputation, nextUp: Awaited<ReturnType<typeof nextUpFor>>['nextUp']): string[] {
  if (!d.eff) return ['Finish setting up your profile to see your daily targets.'];
  const out: string[] = [];
  const rem = Math.round(d.remaining.kcal);
  if (!d.logs.raw.foods.length) out.push(d.isToday ? `A fresh day: ${fmt(d.budgetKcal)} kcal to fuel.` : 'Nothing was logged on this day.');
  else if (rem >= 0) out.push(`${fmt(rem)} kcal left of ${fmt(d.budgetKcal)}${d.burned && d.profile.eatBackExercise ? `, including ${fmt(d.burned)} burned` : ''}.`);
  else out.push(`About ${fmt(-rem)} kcal over today's ${fmt(d.budgetKcal)}. Tomorrow is a clean slate.`);
  if (d.lowest && d.lowest.pct < 80 && d.logs.raw.foods.length) out.push(`${NUTRIENT_WORDS[d.lowest.nutrient][0]!.toUpperCase()}${NUTRIENT_WORDS[d.lowest.nutrient].slice(1)} is at ${d.lowest.pct}% so far — worth a boost.`);
  if (nextUp?.option) out.push(`Next up: ${nextUp.option.name} for ${nextUp.slotLabel.toLowerCase()}, about ${fmt(nextUp.option.nutrition.kcal)} kcal.`);
  else if (nextUp) out.push(`Next up: ${nextUp.slotLabel.toLowerCase()}.`);
  return out.slice(0, 3);
}

export async function crewFor(c: Container, teamId: string, date: string) {
  const members = await c.db.query.users.findMany({ where: and(eq(s.users.teamId, teamId), eq(s.users.status, 'active')), orderBy: (t, { asc }) => [asc(t.displayName)] });
  const loggedRows = await c.db.execute<{ user_id: string }>(
    sql`select user_id from ${s.foodLogs} where team_id = ${teamId} and date = ${date} and deleted_at is null
        union select a.user_id from ${s.activityLogs} a join ${s.users} u on u.id = a.user_id where u.team_id = ${teamId} and a.date = ${date} and a.deleted_at is null`,
  );
  const logged = new Set(loggedRows.map((r) => r.user_id));
  const images = await imageUrlMap(c, members.map((m) => m.avatarImageId));
  const crew = members.map((m) => ({ id: m.id, name: m.displayName, initials: initials(m.displayName), avatarUrl: pick(images, m.avatarImageId).thumbUrl, logged: logged.has(m.id) }));
  crew.sort((a, b) => Number(b.logged) - Number(a.logged));
  return crew;
}

export async function getToday(c: Container, user: AuthUser, dateIn?: string): Promise<TodayResponse> {
  const d = await computeDay(c, user, dateIn);
  const { nextUp } = await nextUpFor(c, user, d);
  const [crew, streakRow, moments, inbox, chat, plan, latestWeight, cached] = await Promise.all([
    crewFor(c, user.teamId, d.date),
    c.db.query.streakStates.findFirst({ where: and(eq(s.streakStates.userId, user.id), eq(s.streakStates.kind, 'logging')) }),
    momentsForLogs(c, user.id, [...d.logs.raw.foods.map((f) => f.id), ...d.logs.raw.acts.map((a) => a.id)]),
    unreadCount(c, user.id),
    unreadChatCount(c, user),
    weekPlanProgress(c, user.id, weekStartOf(d.date)),
    c.db.query.weightEntries.findFirst({ where: and(eq(s.weightEntries.userId, user.id), lte(s.weightEntries.date, d.date), isNull(s.weightEntries.deletedAt)), orderBy: [desc(s.weightEntries.date)] }),
    c.db.query.aiSummaries.findFirst({ where: and(eq(s.aiSummaries.userId, user.id), eq(s.aiSummaries.feature, 'home.summary'), eq(s.aiSummaries.localDate, d.date)) }),
  ]);

  const logicText = logicSummary(d, nextUp);
  const ai = await c.db.query.aiSettings.findFirst({ where: eq(s.aiSettings.teamId, user.teamId) });
  const summaryOn = !!ai?.globalOn && !!ai.features['home.summary']?.on && c.ai.mode !== 'off' && !d.profile.aiOptOuts.summary;
  const cachedOut = cached?.output as { sentences?: string[]; swapIdea?: string } | undefined;
  const useAi = summaryOn && !!cachedOut?.sentences?.length;

  const labels = d.team.settings.mealSlots;
  return {
    date: d.date,
    isToday: d.isToday,
    localTime: d.clock.localTime,
    dayClosed: d.dayClosed,
    goalWord: GOAL_WORDS[d.profile.goalType ?? 'maintain'] ?? 'hold steady',
    targets: d.targets,
    budgetKcal: d.budgetKcal,
    eaten: d.eaten,
    burned: d.burned,
    net: Math.round(d.eaten.kcal - d.burned),
    remainingKcal: Math.round(d.remaining.kcal),
    bands: d.bands,
    slots: (Object.keys(labels) as MealSlot[]).map((slot) => ({
      slot,
      label: labels[slot].label,
      logged: d.loggedSlots.includes(slot),
      kcal: Math.round(d.logs.raw.foods.filter((f) => f.mealSlot === slot).reduce((a, f) => a + f.totals.kcal, 0)),
    })),
    currentSlot: d.currentSlot,
    foodLogs: d.logs.foodLogs,
    activityLogs: d.logs.activityLogs,
    weight: d.logs.weight,
    latestWeightKg: latestWeight?.weightKg ?? d.profile.weightKg ?? null,
    nextUp,
    summary: {
      mode: useAi ? 'ai' : 'logic',
      text: useAi ? cachedOut!.sentences!.join(' ') : logicText.join(' '),
      updatedAt: useAi ? cached!.createdAt.toISOString() : null,
      aiCallId: useAi ? cached!.aiCallId : null,
      swapIdea: useAi && cachedOut?.swapIdea ? cachedOut.swapIdea : null,
      why: { remainingKcal: Math.round(d.remaining.kcal), lowestNutrient: d.lowest, nextSlot: nextUp?.slot ?? null, weekAvgKcal: d.weekAvgKcal },
    },
    crew,
    crewLogged: crew.filter((m) => m.logged).length,
    crewTotal: crew.length,
    streak: { current: streakRow?.current ?? 0, best: streakRow?.best ?? 0, status: streakRow?.status ?? 'active', graceLeft: streakRow?.graceLeft ?? 0, atRisk: streakRow?.atRisk ?? false },
    memeMoments: moments,
    unread: { inbox, chat },
    planProgress: plan.items.map((i) => ({ itemId: i.itemId, typeName: i.typeName, done: i.done, target: i.target })),
  };
}
