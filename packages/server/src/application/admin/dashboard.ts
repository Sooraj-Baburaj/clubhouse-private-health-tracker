import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { AdminDashboardResponse } from '@clubhouse/contracts';
import { monthKey } from '@clubhouse/ai-gateway';
import { bandFor, dayCalorieClass, isDayClosed, localDateOf, localTimeOf, weekStartOf, weekdayOf } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../../container';
import { teamChannel } from '../chat';
import { weekPlanProgress } from '../plans';
import { effectiveTargets } from '../targets';
import { getTeam } from '../team';
import { nextDailyRun, storageStats } from './retention';
import { monthStartUtc, nextMonthStartUtc, personMap, personOf, round6, teamClock, teamUsers, type Actor } from './shared';

export async function dashboard(c: Container, a: Actor): Promise<AdminDashboardResponse> {
  const teamId = a.user.teamId;
  const team = await getTeam(c, teamId);
  const { now, today, dayStart } = teamClock(c, team);
  const allUsers = await teamUsers(c, teamId);
  const users = allUsers.filter((u) => u.status === 'active');
  const ids = users.map((u) => u.id);
  const people = await personMap(c, ids);
  const memberDay = new Map(users.map((u) => [u.id, localDateOf(now, u.timezone || team.timezone)]));
  const dates = [...new Set(memberDay.values())];
  const month = monthKey(now);
  const mStart = monthStartUtc(now);
  const ch = await teamChannel(c, teamId);

  const [profiles, foods, acts, weights, streakRows, teamStreak, aiSettings, budget, aiToday, aiMonth, photoFails, reportsPending, deletionOpen, messagesToday, memesToday, lastRetention, lastTick, publishedPlans] = await Promise.all([
    ids.length ? c.db.query.profiles.findMany({ where: inArray(s.profiles.userId, ids) }) : [],
    ids.length ? c.db.select({ userId: s.foodLogs.userId, date: s.foodLogs.date, totals: s.foodLogs.totals, mealSlot: s.foodLogs.mealSlot }).from(s.foodLogs).where(and(inArray(s.foodLogs.userId, ids), inArray(s.foodLogs.date, dates), isNull(s.foodLogs.deletedAt))) : [],
    ids.length ? c.db.select({ userId: s.activityLogs.userId, date: s.activityLogs.date }).from(s.activityLogs).where(and(inArray(s.activityLogs.userId, ids), inArray(s.activityLogs.date, dates), isNull(s.activityLogs.deletedAt))) : [],
    ids.length ? c.db.select({ userId: s.weightEntries.userId, date: s.weightEntries.date }).from(s.weightEntries).where(and(inArray(s.weightEntries.userId, ids), inArray(s.weightEntries.date, dates), isNull(s.weightEntries.deletedAt))) : [],
    ids.length ? c.db.query.streakStates.findMany({ where: and(inArray(s.streakStates.userId, ids), eq(s.streakStates.kind, 'logging')) }) : [],
    c.db.query.teamStreaks.findFirst({ where: eq(s.teamStreaks.teamId, teamId) }),
    c.db.query.aiSettings.findFirst({ where: eq(s.aiSettings.teamId, teamId) }),
    c.db.query.aiBudgets.findFirst({ where: and(eq(s.aiBudgets.teamId, teamId), eq(s.aiBudgets.month, month)) }),
    c.db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.aiCalls)
      .where(and(eq(s.aiCalls.teamId, teamId), eq(s.aiCalls.test, false), gte(s.aiCalls.startedAt, dayStart), sql`${s.aiCalls.outcome} not in ('budget_blocked','cap_blocked')`)),
    c.db
      .select({ n: sql<number>`count(*)::int`, fallbacks: sql<number>`count(*) filter (where ${s.aiCalls.outcome} not in ('ok','fallback','pending'))::int`, cost: sql<number>`coalesce(sum(${s.aiCalls.costUsd}), 0)::float8` })
      .from(s.aiCalls)
      .where(and(eq(s.aiCalls.teamId, teamId), eq(s.aiCalls.test, false), gte(s.aiCalls.startedAt, mStart), sql`${s.aiCalls.outcome} not in ('budget_blocked','cap_blocked')`)),
    c.db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.aiCalls)
      .where(and(eq(s.aiCalls.teamId, teamId), eq(s.aiCalls.feature, 'food.photo'), eq(s.aiCalls.test, false), gte(s.aiCalls.startedAt, dayStart), sql`${s.aiCalls.outcome} in ('error','timeout','invalid_output','refused','lost')`)),
    c.db.select({ n: sql<number>`count(*)::int` }).from(s.messageReports).innerJoin(s.messages, eq(s.messages.id, s.messageReports.messageId)).where(and(eq(s.messages.channelId, ch.id), eq(s.messageReports.status, 'open'))),
    c.db.select({ n: sql<number>`count(*)::int` }).from(s.deletionRequests).where(and(eq(s.deletionRequests.teamId, teamId), eq(s.deletionRequests.status, 'open'))),
    c.db.select({ n: sql<number>`count(*)::int` }).from(s.messages).where(and(eq(s.messages.channelId, ch.id), eq(s.messages.kind, 'user'), gte(s.messages.createdAt, dayStart), isNull(s.messages.deletedAt))),
    c.db.select({ n: sql<number>`count(*)::int` }).from(s.memeFires).where(and(eq(s.memeFires.teamId, teamId), eq(s.memeFires.localDate, today), eq(s.memeFires.test, false))),
    c.db.query.retentionRuns.findFirst({ where: and(eq(s.retentionRuns.teamId, teamId), eq(s.retentionRuns.dryRun, false)), orderBy: [desc(s.retentionRuns.startedAt)] }),
    c.db.query.jobRuns.findFirst({ where: eq(s.jobRuns.job, 'tick'), orderBy: [desc(s.jobRuns.startedAt)] }),
    ids.length ? c.db.select({ userId: s.dietPlans.userId }).from(s.dietPlans).where(and(inArray(s.dietPlans.userId, ids), eq(s.dietPlans.status, 'published'))) : [],
  ]);

  const loggedSet = new Set([...foods, ...acts, ...weights].filter((r) => memberDay.get(r.userId) === r.date).map((r) => r.userId));
  const todayRows: AdminDashboardResponse['todayRows'] = users.map((u) => {
    const d = memberDay.get(u.id)!;
    const mine = foods.filter((f) => f.userId === u.id && f.date === d);
    const eaten = mine.reduce((acc, f) => acc + f.totals.kcal, 0);
    const prof = profiles.find((p) => p.userId === u.id);
    const eff = prof ? effectiveTargets(prof) : null;
    const thresholds = { ...team.settings.thresholds, ...(prof?.thresholdsOverride ?? {}) } as typeof team.settings.thresholds;
    const closed = isDayClosed({ isToday: true, localTime: localTimeOf(now, u.timezone || team.timezone), loggedSlots: mine.map((f) => f.mealSlot as never) });
    const band = eff && mine.length ? dayCalorieClass(eaten, eff.kcal, thresholds) : 'none';
    const label = eff && mine.length ? bandFor('kcal', eaten, eff.kcal, thresholds, closed).label : loggedSet.has(u.id) ? 'logged' : 'not logged yet';
    return { person: personOf(people, u.id)!, eaten: Math.round(eaten), target: eff?.kcal ?? null, band, bandLabel: label, logged: loggedSet.has(u.id) };
  });

  // Activity plans on track: done so far keeps pace with the week (planned × elapsed days / 7).
  let onTrack = 0;
  let planTotal = 0;
  for (const u of users) {
    const d = memberDay.get(u.id)!;
    const p = await weekPlanProgress(c, u.id, weekStartOf(d));
    const weekly = p.items.filter((i) => i.target > 0);
    if (!weekly.length) continue;
    planTotal++;
    const elapsed = weekdayOf(d) + 1;
    if (weekly.every((i) => i.done >= Math.floor((i.target * elapsed) / 7))) onTrack++;
  }

  const cap = aiSettings?.budget.monthlyCapUsd ?? Number(budget?.capUsd ?? 0);
  const spent = round6(Number(budget?.spentUsd ?? aiMonth[0]?.cost ?? 0));
  const daysInMonth = Math.round((nextMonthStartUtc(now).getTime() - mStart.getTime()) / 86400_000);
  const elapsedDays = Math.max(1, (now.getTime() - mStart.getTime()) / 86400_000);
  const monthCalls = aiMonth[0]?.n ?? 0;
  const atRisk = streakRows.filter((r) => r.atRisk && r.current > 0).map((r) => personOf(people, r.userId)!).filter(Boolean);

  const needs: AdminDashboardResponse['needsAttention'] = [];
  const soon = now.getTime() + 48 * 3600_000;
  for (const u of users) {
    if (u.mustChangePassword && u.tempPasswordExpiresAt) {
      const exp = u.tempPasswordExpiresAt.getTime();
      if (exp < now.getTime()) needs.push({ kind: 'temp_password_expired', text: `${u.displayName}’s temporary password has expired. Reset it to send a new one.`, url: `/admin/members/${u.id}` });
      else if (exp < soon) needs.push({ kind: 'temp_password_expiring', text: `${u.displayName} hasn’t signed in yet; the temporary password expires soon.`, url: `/admin/members/${u.id}` });
    }
  }
  if (atRisk.length) needs.push({ kind: 'streaks_at_risk', text: `${atRisk.length} streak${atRisk.length === 1 ? '' : 's'} at risk tonight: ${atRisk.map((p) => p.name).join(', ')}.`, url: '/admin/members' });
  if ((photoFails[0]?.n ?? 0) > 0) needs.push({ kind: 'photo_failures', text: `${photoFails[0]!.n} photo recognition call${photoFails[0]!.n === 1 ? '' : 's'} failed today.`, url: '/admin/ai' });
  const withPlan = new Set(publishedPlans.map((p) => p.userId));
  const members = users.filter((u) => u.role === 'member' && u.onboardedAt);
  const noPlan = members.filter((u) => !withPlan.has(u.id));
  if (noPlan.length) needs.push({ kind: 'no_diet_plan', text: `${noPlan.length} member${noPlan.length === 1 ? ' has' : 's have'} no published diet plan.`, url: '/admin/diets' });
  const stale = profiles.filter((p) => p.targetsComputedAt && now.getTime() - p.targetsComputedAt.getTime() > 90 * 86400_000 && !p.targetOverrides);
  if (stale.length) needs.push({ kind: 'stale_targets', text: `${stale.length} member${stale.length === 1 ? '’s targets are' : 's’ targets are'} older than 90 days.`, url: '/admin/goals' });
  if ((reportsPending[0]?.n ?? 0) > 0) needs.push({ kind: 'reports', text: `${reportsPending[0]!.n} chat report${reportsPending[0]!.n === 1 ? '' : 's'} waiting.`, url: '/admin/chat' });
  if ((deletionOpen[0]?.n ?? 0) > 0) needs.push({ kind: 'deletion_requests', text: `${deletionOpen[0]!.n} data deletion request${deletionOpen[0]!.n === 1 ? '' : 's'} to handle.`, url: '/admin/retention' });
  if (!lastTick || now.getTime() - lastTick.startedAt.getTime() > 15 * 60_000) needs.push({ kind: 'pinger_down', text: lastTick ? `The minute pinger last ran ${Math.round((now.getTime() - lastTick.startedAt.getTime()) / 60_000)} minutes ago; reminders are paused.` : 'The minute pinger has never run; reminders will not go out.', url: '/admin/jobs' });

  const storage = await storageStats(c, teamId);
  const byKind: Record<string, number> = {};
  for (const [k, v] of Object.entries(storage.byKind)) byKind[k] = v.bytes;

  return {
    date: today,
    kpis: {
      activeMembers: users.filter((u) => !u.mustChangePassword).length,
      invited: users.filter((u) => u.mustChangePassword).length,
      deactivated: allUsers.filter((u) => u.status === 'deactivated').length,
      loggedToday: loggedSet.size,
      teamStreak: teamStreak?.current ?? 0,
      aiSpendUsd: spent,
      aiCapUsd: cap,
      aiPct: cap > 0 ? Math.round((spent / cap) * 100) : 0,
    },
    todayRows: todayRows.sort((x, y) => Number(x.logged) - Number(y.logged) || x.person.name.localeCompare(y.person.name)),
    plan: { onTrack, total: planTotal },
    streaksAtRisk: atRisk,
    ai: {
      monthToDate: spent,
      cap,
      pct: cap > 0 ? Math.round((spent / cap) * 100) : 0,
      callsToday: aiToday[0]?.n ?? 0,
      fallbackRate: monthCalls ? Math.round(((aiMonth[0]?.fallbacks ?? 0) / monthCalls) * 100) / 100 : 0,
      alertAt: aiSettings?.budget.alertAtPercent ?? 80,
      resetsOn: nextMonthStartUtc(now).toISOString().slice(0, 10),
      projected: round6((spent / elapsedDays) * daysInMonth),
      on: !!aiSettings?.globalOn && c.ai.mode !== 'off',
    },
    needsAttention: needs,
    chat: { messagesToday: messagesToday[0]?.n ?? 0, memesToday: memesToday[0]?.n ?? 0, reportsPending: reportsPending[0]?.n ?? 0 },
    storage: {
      totalBytes: storage.totalBytes,
      byKind,
      nextRunAt: nextDailyRun(now).toISOString(),
      lastRun: lastRetention ? { at: (lastRetention.finishedAt ?? lastRetention.startedAt).toISOString(), imagesDeleted: lastRetention.imagesDeleted, bytesReclaimed: Number(lastRetention.bytesReclaimed) } : null,
    },
  };
}

