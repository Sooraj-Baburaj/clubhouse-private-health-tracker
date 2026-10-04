import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { AWARD_META, type AdminDashboardResponse, type AwardDto, type BoardDayState, type BoardResponse, type BoardRowDto, type BoardStatus, type MealSlot, type MemberPointsResponse, type MyWeekDto, type NextActionDto, type PersonRef, type SolidRowDto, type WeekResultsDto } from '@clubhouse/contracts';
import {
  addDays,
  BOARD_RULES,
  crownHolder,
  dateRange,
  dayItems,
  isOnVacation,
  isoWeekNumber,
  lastSettledDate,
  localDateOf,
  localTimeOf,
  nextActions,
  rankByPoints,
  slotForTime,
  SLOT_ORDER,
  solidDayRate,
  weekdayOf,
  weeklyAwards,
  weekStanding,
  weekStartOf,
  zonedToUtc,
  compareRate,
  type Award,
  type AwardCandidate,
  type BoardDayFacts,
  type WeekStanding,
} from '@clubhouse/domain';
import { schema as s, type BoardAwardJson, type BoardDayJson } from '@clubhouse/db';
import type { Container } from '../container';
import { initials } from '../lib/crypto';
import { notFound } from '../lib/errors';
import { log } from '../lib/log';
import type { AuthUser } from '../interface/http/types';
import { postSystemMessage } from './chat';
import { imageUrlMap, pick, type ImageUrls } from './images';
import { notifyUser } from './notify';
import { computeDayFacts } from './momentum';
import { activePlanItems, attributeLogs } from './plans';
import { getTeam } from './team';

/*
 * Crew points (Team tab leaderboard). day_facts hold each day's inputs; board_weeks hold each member's week, refreshed
 * when a log is saved, a day settles, a vacation or plan changes, or the rules change. The team's morning rollover
 * takes standings (for movement arrows), passes the 👑 and closes the week on Monday morning.
 */

type UserRow = typeof s.users.$inferSelect;
type ProfileRow = typeof s.profiles.$inferSelect;
type FactRow = typeof s.dayFacts.$inferSelect;
type WeekRow = typeof s.boardWeeks.$inferSelect;
type TeamRow = Awaited<ReturnType<typeof getTeam>>;

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'breakfast', morning_snack: 'morning snack', lunch: 'lunch', evening_snack: 'evening snack', dinner: 'dinner' };
const MAIN_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

const tzOf = (u: Pick<UserRow, 'timezone'>, team: Pick<TeamRow, 'timezone'>) => u.timezone || team.timezone;
const showsOnBoard = (p: Pick<ProfileRow, 'privacy'>) => p.privacy.showOnBoard !== false;

function personRef(u: UserRow, avatars: Map<string, ImageUrls>): PersonRef {
  const img = pick(avatars, u.avatarImageId);
  return { id: u.id, name: u.displayName, initials: initials(u.displayName), avatarUrl: img.thumbUrl ?? img.url };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
/** "Asha", "Asha & Ravi", "Asha, Ravi & Meera". */
const joinNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : (names[0] ?? ''));

export function toBoardFacts(f: Pick<FactRow, 'mealsOnTime' | 'snapOnly' | 'kcalClass' | 'proteinClass' | 'workouts' | 'weighedIn' | 'settled'>): BoardDayFacts {
  const cls = (v: string | null) => (v === 'on' || v === 'near' || v === 'off' ? v : null);
  return { mealsOnTime: f.mealsOnTime, snapOnly: f.snapOnly, kcal: cls(f.kcalClass), protein: cls(f.proteinClass), workouts: f.workouts, weighedIn: f.weighedIn, settled: f.settled };
}

/** Monday 03:00 after the week, member-local: when the last of the week's days settles. */
const closesAt = (weekStart: string, tz: string) => zonedToUtc(addDays(weekStart, 7), '03:00', tz).toISOString();

/* ───────── Refreshing a member's week ───────── */

/**
 * Recompute one member's week from day facts, activity logs (workouts and plan) and vacations, and store it. A closed
 * week is final and never changes again. Returns null for a week that hasn't started for the member.
 */
export async function refreshBoardWeek(c: Container, userId: string, weekStart: string): Promise<WeekRow | null> {
  const [user, profile] = await Promise.all([c.db.query.users.findFirst({ where: eq(s.users.id, userId) }), c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) })]);
  if (!user || !profile) return null;
  const team = await getTeam(c, user.teamId);
  const tz = tzOf(user, team);
  const now = c.clock.now();
  const today = localDateOf(now, tz);
  if (weekStart > today) return null;
  const existing = await c.db.query.boardWeeks.findFirst({ where: and(eq(s.boardWeeks.teamId, user.teamId), eq(s.boardWeeks.weekStart, weekStart), eq(s.boardWeeks.userId, userId)) });
  if (existing?.final) return existing;
  const standing = await computeStanding(c, user, profile, team, weekStart, today, lastSettledDate(now, tz));
  const values = {
    teamId: user.teamId,
    weekStart,
    userId,
    points: standing.points,
    parts: standing.parts,
    days: standing.days.map((d) => ({ date: d.date, state: d.state, points: d.points, parts: d.parts, settled: d.settled })) satisfies BoardDayJson[],
    status: standing.status,
    workouts: standing.workouts,
    solidDays: standing.solidDays,
    proteinDays: standing.proteinDays,
    fullDays: standing.fullDays,
    awayDays: standing.awayDays,
    planDone: standing.planDone,
    hasPlan: standing.hasPlan,
    rulesVersion: BOARD_RULES.version,
    updatedAt: now,
  };
  const [row] = await c.db
    .insert(s.boardWeeks)
    .values(values)
    .onConflictDoUpdate({ target: [s.boardWeeks.teamId, s.boardWeeks.weekStart, s.boardWeeks.userId], set: values, setWhere: sql`${s.boardWeeks.final} = false` })
    .returning();
  return row ?? existing ?? null;
}

async function computeStanding(c: Container, user: UserRow, profile: ProfileRow, team: TeamRow, weekStart: string, today: string, settledThrough: string): Promise<WeekStanding & { hasPlan: boolean }> {
  const weekEnd = addDays(weekStart, 6);
  const rules = team.settings.board;
  const [facts, acts, plan, rest] = await Promise.all([
    c.db.query.dayFacts.findMany({ where: and(eq(s.dayFacts.userId, user.id), gte(s.dayFacts.date, weekStart), lte(s.dayFacts.date, weekEnd)) }),
    c.db
      .select({ id: s.activityLogs.id, typeId: s.activityLogs.typeId, planItemId: s.activityLogs.planItemId, date: s.activityLogs.date, minutes: s.activityLogs.durationMin, loggedAt: s.activityLogs.loggedAt })
      .from(s.activityLogs)
      .where(and(eq(s.activityLogs.userId, user.id), gte(s.activityLogs.date, weekStart), lte(s.activityLogs.date, weekEnd), isNull(s.activityLogs.deletedAt), eq(s.activityLogs.addedLate, false))),
    activePlanItems(c, user.id),
    c.db.query.restWeeks.findFirst({ where: and(eq(s.restWeeks.userId, user.id), eq(s.restWeeks.weekStart, weekStart)) }),
  ]);
  const byDate = new Map(facts.map((f) => [f.date, f]));
  const joined = localDateOf(user.createdAt, tzOf(user, team));
  const vacations = profile.vacationRanges;
  const days = dateRange(weekStart, weekEnd).map((date) => {
    const f = byDate.get(date);
    return { date, facts: f ? toBoardFacts(f) : null, vacation: isOnVacation(vacations, date), beforeJoin: date < joined };
  });
  // Workouts are judged with today's team settings (a rule change applies to the whole current week).
  const qualifying = acts.filter((a) => !!a.planItemId || a.minutes >= rules.workoutMinMinutes);
  for (const d of days) {
    if (d.facts) d.facts = { ...d.facts, workouts: qualifying.filter((a) => a.date === d.date).length };
  }
  const weekly = plan.items.filter((i) => (i.perWeek ?? 0) > 0);
  const vacationDays = days.filter((d) => d.vacation).length;
  const restWeek = !!rest && (rest.status === 'approved' || rest.status === 'admin');
  let planInput: { kind: 'plan' | 'rest' | 'none'; doneOn: string | null } = { kind: 'none', doneOn: null };
  if (restWeek || (weekly.length > 0 && vacationDays >= 3)) planInput = { kind: 'rest', doneOn: null };
  else if (weekly.length) {
    // The day the last needed session landed, attributing logs in order as the plan does.
    const sorted = [...acts].sort((a, b) => (a.date === b.date ? a.loggedAt.getTime() - b.loggedAt.getTime() : a.date < b.date ? -1 : 1));
    let doneOn: string | null = null;
    for (let i = 0; i < sorted.length && !doneOn; i++) {
      const counts = attributeLogs(weekly, sorted.slice(0, i + 1));
      if (weekly.every((it) => (counts.get(it.id) ?? 0) >= (it.perWeek ?? 0))) doneOn = sorted[i]!.date;
    }
    planInput = { kind: 'plan', doneOn };
  }
  const standing = weekStanding({
    weekStart,
    today,
    days,
    workoutDates: qualifying.map((a) => a.date),
    plan: planInput,
    rules,
    closed: weekEnd <= settledThrough,
  });
  return { ...standing, hasPlan: weekly.length > 0 };
}

/** Refresh the weeks that contain these dates (best effort: the board must never fail a save). */
export async function refreshWeeksFor(c: Container, userId: string, dates: (string | null | undefined)[]) {
  const weeks = [...new Set(dates.filter((d): d is string => !!d).map(weekStartOf))];
  for (const w of weeks) {
    try {
      await refreshBoardWeek(c, userId, w);
    } catch (e) {
      log.warn('board.refresh_failed', { userId, weekStart: w, error: (e as Error).message });
    }
  }
}

/** Refresh the member's current week (after a vacation, plan or rest-week change). */
export async function refreshCurrentWeek(c: Container, userId: string) {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user) return;
  const team = await getTeam(c, user.teamId);
  await refreshWeeksFor(c, userId, [localDateOf(c.clock.now(), tzOf(user, team))]);
}

/* ───────── Shared reads ───────── */

interface Member {
  user: UserRow;
  profile: ProfileRow;
  person: PersonRef;
  tz: string;
  visible: boolean;
}

async function teamMembers(c: Container, team: TeamRow): Promise<Member[]> {
  const rows = await c.db
    .select({ user: s.users, profile: s.profiles })
    .from(s.users)
    .innerJoin(s.profiles, eq(s.profiles.userId, s.users.id))
    .where(and(eq(s.users.teamId, team.id), eq(s.users.status, 'active')));
  const live = rows.filter((r) => !!r.user.onboardedAt);
  const avatars = await imageUrlMap(c, live.map((r) => r.user.avatarImageId));
  return live.map((r) => ({ user: r.user, profile: r.profile, person: personRef(r.user, avatars), tz: tzOf(r.user, team), visible: showsOnBoard(r.profile) }));
}

async function loggingStreaks(c: Container, ids: string[]): Promise<Map<string, { current: number; best: number }>> {
  if (!ids.length) return new Map();
  const rows = await c.db
    .select({ userId: s.streakStates.userId, current: s.streakStates.current, best: s.streakStates.best })
    .from(s.streakStates)
    .where(and(inArray(s.streakStates.userId, ids), eq(s.streakStates.kind, 'logging')));
  return new Map(rows.map((r) => [r.userId, { current: r.current, best: r.best }]));
}

interface SolidStat {
  solid: number;
  eligible: number;
  strip: SolidRowDto['strip'];
  ranked: boolean;
}

/** Each member's last 28 settled days (their own timezone), from day facts. */
async function solidStats(c: Container, members: Member[]): Promise<Map<string, SolidStat>> {
  const out = new Map<string, SolidStat>();
  if (!members.length) return out;
  const now = c.clock.now();
  const through = new Map(members.map((m) => [m.user.id, lastSettledDate(now, m.tz)]));
  const maxThrough = [...through.values()].sort().at(-1)!;
  const from = addDays([...through.values()].sort()[0]!, -(BOARD_RULES.solidWindow - 1));
  const facts = await c.db
    .select({ userId: s.dayFacts.userId, date: s.dayFacts.date, solid: s.dayFacts.solid, logged: s.dayFacts.logged })
    .from(s.dayFacts)
    .where(and(inArray(s.dayFacts.userId, members.map((m) => m.user.id)), gte(s.dayFacts.date, from), lte(s.dayFacts.date, maxThrough)));
  const byUser = new Map<string, typeof facts>();
  for (const f of facts) {
    const list = byUser.get(f.userId) ?? [];
    list.push(f);
    byUser.set(f.userId, list);
  }
  for (const m of members) {
    const end = through.get(m.user.id)!;
    const joined = localDateOf(m.user.createdAt, m.tz);
    const own = new Map((byUser.get(m.user.id) ?? []).map((f) => [f.date, f]));
    const days = dateRange(addDays(end, -(BOARD_RULES.solidWindow - 1)), end).map((date) => {
      const f = own.get(date);
      return { date, solid: !!f?.solid, logged: !!f?.logged, vacation: isOnVacation(m.profile.vacationRanges, date), beforeJoin: date < joined };
    });
    const r = solidDayRate(days, end);
    out.set(m.user.id, { solid: r.solid, eligible: r.eligible, strip: r.strip, ranked: r.ranked });
  }
  return out;
}

/** Board order: points, then solid days, the logging streak and the name (ties keep their shared rank). */
function rankWeek<T extends { userId: string; points: number; name: string }>(rows: T[], solid: Map<string, SolidStat>, streaks: Map<string, { current: number }>) {
  const rate = (id: string) => solid.get(id) ?? { solid: 0, eligible: 0 };
  return rankByPoints(rows, (a, b) => -compareRate(rate(a.userId), rate(b.userId)) || (streaks.get(b.userId)?.current ?? 0) - (streaks.get(a.userId)?.current ?? 0) || a.name.localeCompare(b.name));
}

async function weekRows(c: Container, teamId: string, weekStart: string): Promise<WeekRow[]> {
  return c.db.query.boardWeeks.findMany({ where: and(eq(s.boardWeeks.teamId, teamId), eq(s.boardWeeks.weekStart, weekStart)) });
}

/* ───────── The board (GET /team/board) ───────── */

/** Who last switched the board off (from the audit log), for "Meera turned off points". */
async function switchedOffBy(c: Container, teamId: string): Promise<string | null> {
  const [row] = await c.db
    .select({ name: s.users.displayName })
    .from(s.auditLogs)
    .innerJoin(s.users, eq(s.users.id, s.auditLogs.actorId))
    .where(and(eq(s.auditLogs.teamId, teamId), eq(s.auditLogs.action, 'team.settings_update'), sql`${s.auditLogs.after}->'featureFlags'->>'leaderboard' = 'false'`))
    .orderBy(desc(s.auditLogs.createdAt))
    .limit(1);
  return row ? firstName(row.name) : null;
}

export async function boardView(c: Container, viewer: AuthUser, weekParam?: string): Promise<BoardResponse> {
  const team = await getTeam(c, viewer.teamId);
  const rules = { workoutMinMinutes: team.settings.board.workoutMinMinutes, workoutCap: team.settings.board.workoutCap, noPlanTarget: team.settings.board.noPlanTarget };
  const now = c.clock.now();
  const today = localDateOf(now, viewer.timezone);
  const current = weekStartOf(today);
  const week = weekParam && weekStartOf(weekParam) < current ? weekStartOf(weekParam) : current;
  const weekInfo = { start: week, end: addDays(week, 6), number: isoWeekNumber(week), isCurrent: week === current, closesAt: closesAt(week, viewer.timezone) };
  if (!team.settings.featureFlags.leaderboard) {
    return { enabled: false, offBy: await switchedOffBy(c, team.id), week: weekInfo, me: null, rows: [], solid: [], rankedCount: 0, lastWeek: null, rules, updatedAt: now.toISOString() };
  }

  const members = await teamMembers(c, team);
  const ids = members.map((m) => m.user.id);
  const [firstRows, streaks, solid, state] = await Promise.all([
    weekRows(c, team.id, week),
    loggingStreaks(c, ids),
    solidStats(c, members),
    c.db.query.teamBoardState.findFirst({ where: eq(s.teamBoardState.teamId, team.id) }),
  ]);
  let rows = firstRows;
  // New members (or a week no one has logged in yet) get their row on first sight.
  if (weekInfo.isCurrent) {
    const missing = members.filter((m) => !rows.some((r) => r.userId === m.user.id));
    if (missing.length) {
      for (const m of missing) await refreshBoardWeek(c, m.user.id, week);
      rows = await weekRows(c, team.id, week);
    }
  }
  const byUser = new Map(members.map((m) => [m.user.id, m]));
  const live = rows.filter((r) => byUser.has(r.userId));
  const crownId = state?.crownUserId && byUser.get(state.crownUserId)?.visible ? state.crownUserId : null;

  const name = (id: string) => byUser.get(id)!.user.displayName;
  const visibleRows = live.filter((r) => byUser.get(r.userId)!.visible);
  const ranked = rankWeek(
    visibleRows.filter((r) => r.status === 'ranked').map((r) => ({ userId: r.userId, points: r.points, name: name(r.userId), row: r })),
    solid,
    streaks,
  );
  // Final weeks show the ranks they closed with.
  const rankOf = new Map(ranked.map((r) => [r.userId, weekInfo.isCurrent || r.row.finalRank == null ? r.rank : r.row.finalRank]));
  const daysOf = (r: WeekRow): BoardRowDto['days'] => r.days.map((d) => ({ date: d.date, state: d.state as BoardDayState, points: d.points }));
  const boardRow = (r: WeekRow, rank: number | null): BoardRowDto => {
    const m = byUser.get(r.userId)!;
    const ref = r.prevDawnRank ?? r.dawnRank;
    return {
      person: m.person,
      isMe: m.user.id === viewer.id,
      rank,
      points: r.points,
      movement: weekInfo.isCurrent && rank != null && ref != null ? ref - rank : null,
      status: r.status as BoardStatus,
      days: daysOf(r),
      streak: streaks.get(r.userId)?.current ?? 0,
      crown: r.userId === crownId,
    };
  };
  const out: BoardRowDto[] = [
    ...ranked.map((r) => boardRow(r.row, rankOf.get(r.userId) ?? null)),
    ...visibleRows
      .filter((r) => r.status !== 'ranked')
      .sort((a, b) => b.points - a.points || name(a.userId).localeCompare(name(b.userId)))
      .map((r) => boardRow(r, null)),
  ];

  // Solid days: members with enough eligible days are ranked on their rate (ties share a rank).
  const solidRows = members
    .filter((m) => m.visible)
    .map((m) => ({ m, st: solid.get(m.user.id)! }))
    .sort((a, b) => Number(b.st.ranked) - Number(a.st.ranked) || compareRate(b.st, a.st) || (streaks.get(b.m.user.id)?.current ?? 0) - (streaks.get(a.m.user.id)?.current ?? 0) || a.m.user.displayName.localeCompare(b.m.user.displayName));
  const solidOut: SolidRowDto[] = solidRows.map(({ m, st }) => ({
    person: m.person,
    isMe: m.user.id === viewer.id,
    rank: st.ranked ? 1 + solidRows.filter((x) => x.st.ranked && compareRate(x.st, st) > 0).length : null,
    solidDays: st.solid,
    eligibleDays: st.eligible,
    status: st.ranked ? 'ranked' : 'warming_up',
    strip: st.strip,
    streak: streaks.get(m.user.id)?.current ?? 0,
    crown: m.user.id === crownId,
  }));

  const me = weekInfo.isCurrent ? await myWeek(c, viewer, team, live, ranked, byUser, streaks, solid, today) : pastMe(live, viewer.id, rankOf);
  const lastWeek = weekInfo.isCurrent ? await weekResults(c, team, addDays(week, -7), viewer.id, members) : null;
  const updated = live.reduce((a, r) => (r.updatedAt > a ? r.updatedAt : a), new Date(0));
  return { enabled: true, offBy: null, week: weekInfo, me, rows: out, solid: solidOut, rankedCount: ranked.length, lastWeek, rules, updatedAt: (live.length ? updated : now).toISOString() };
}

function pastMe(rows: WeekRow[], viewerId: string, rankOf: Map<string, number>): MyWeekDto | null {
  const r = rows.find((x) => x.userId === viewerId);
  if (!r) return null;
  return { rank: rankOf.get(viewerId) ?? null, points: r.points, status: r.status as BoardStatus, wouldBeRank: null, gap: null, pending: 0, nextActions: [] };
}

async function myWeek(
  c: Container,
  viewer: AuthUser,
  team: TeamRow,
  rows: WeekRow[],
  ranked: { userId: string; points: number; rank: number; name: string }[],
  byUser: Map<string, Member>,
  streaks: Map<string, { current: number }>,
  solid: Map<string, SolidStat>,
  today: string,
): Promise<MyWeekDto | null> {
  const mine = rows.find((r) => r.userId === viewer.id);
  const me = byUser.get(viewer.id);
  if (!mine || !me) return null;
  const hidden = !me.visible;
  let rank: number | null = ranked.find((r) => r.userId === viewer.id)?.rank ?? null;
  let wouldBeRank: number | null = null;
  if (hidden && mine.status === 'ranked') {
    const withMe = rankWeek([...ranked.map((r) => ({ userId: r.userId, points: r.points, name: r.name })), { userId: viewer.id, points: mine.points, name: me.user.displayName }], solid, streaks);
    wouldBeRank = withMe.find((r) => r.userId === viewer.id)?.rank ?? null;
    rank = null;
  }
  let gap: MyWeekDto['gap'] = null;
  if (rank != null) {
    const above = ranked.filter((r) => r.points > mine.points).sort((a, b) => a.points - b.points)[0];
    const level = ranked.find((r) => r.userId !== viewer.id && r.points === mine.points);
    const below = ranked.filter((r) => r.points < mine.points).sort((a, b) => b.points - a.points)[0];
    if (above) gap = { kind: 'behind', points: above.points - mine.points, name: firstName(above.name) };
    else if (level) gap = { kind: 'level', points: 0, name: firstName(level.name) };
    else if (below) gap = { kind: 'ahead', points: mine.points - below.points, name: firstName(below.name) };
  }
  // Today's logs: which meals are in and whether a snapped meal still needs its foods.
  const foods = await c.db
    .select({ id: s.foodLogs.id, slot: s.foodLogs.mealSlot, items: s.foodLogs.items, pending: s.foodLogs.pendingDetails, late: s.foodLogs.addedLate, loggedAt: s.foodLogs.loggedAt })
    .from(s.foodLogs)
    .where(and(eq(s.foodLogs.userId, viewer.id), eq(s.foodLogs.date, today), isNull(s.foodLogs.deletedAt)));
  const slotsLogged = [...new Set(foods.filter((f) => !f.late && f.items.length > 0).map((f) => f.slot as MealSlot))];
  const snap = foods.filter((f) => f.pending && f.items.length === 0 && !slotsLogged.includes(f.slot as MealSlot)).sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime())[0];
  const localTime = localTimeOf(c.clock.now(), viewer.timezone);
  const bySlotTime = slotForTime(localTime, team.settings.mealSlots);
  const after = SLOT_ORDER.slice(SLOT_ORDER.indexOf(bySlotTime));
  const nextSlot = !slotsLogged.includes(bySlotTime) ? bySlotTime : (after.find((sl) => MAIN_SLOTS.includes(sl) && !slotsLogged.includes(sl)) ?? null);
  const counted = mine.days.reduce((a, d) => a + d.parts.workouts / BOARD_RULES.workout, 0);
  const weighedIn = mine.days.some((d) => d.parts.weighIn > 0);
  const eligibleToday = !isOnVacation(me.profile.vacationRanges, today);
  const actions: NextActionDto[] = nextActions({ slotsLogged, snapPending: snap ? { slot: snap.slot as MealSlot, logId: snap.id } : null, nextSlot, workoutsCounted: counted, weighedIn, rules: team.settings.board, eligibleToday }).map((a) =>
    a.kind === 'finish'
      ? { kind: 'finish', slot: a.slot, logId: a.logId, label: `Finish ${SLOT_LABEL[a.slot]}`, points: a.points }
      : a.kind === 'meal'
        ? { kind: 'meal', slot: a.slot, label: `Log ${SLOT_LABEL[a.slot]}`, points: a.points }
        : a.kind === 'workout'
          ? { kind: 'workout', label: 'Log a workout', points: a.points }
          : { kind: 'weigh_in', label: 'Weigh in', points: a.points },
  );
  return { rank, points: mine.points, status: hidden ? 'hidden' : (mine.status as BoardStatus), wouldBeRank, gap, pending: pendingOf(mine), nextActions: actions };
}

/** Calories and protein still to land: up to 40 for each day with meals in that hasn't settled. */
function pendingOf(r: WeekRow): number {
  return r.days.filter((d) => d.settled === false && d.state !== 'away' && d.state !== 'future' && d.parts.meals > 0).length * (BOARD_RULES.kcal.on + BOARD_RULES.protein.on);
}

/* ───────── Weekly results ───────── */

function awardWhy(a: Award): string {
  const d = a.detail;
  switch (a.key) {
    case 'winner': {
      const notes = [d.shared && 'a shared win', d.best && 'a personal best'].filter(Boolean);
      return `${d.points} pts${notes.length ? ` — ${notes.join(', ')}` : ''}`;
    }
    case 'consistent':
      return `${d.solid} of ${d.eligible} solid days`;
    case 'streak':
      return `${d.days} days logged in a row`;
    case 'plan':
      return d.planned ? `Weekly plan done · ${d.workouts} workout${d.workouts === 1 ? '' : 's'}` : `${d.workouts} workouts this week`;
    case 'protein':
      return `Protein on track ${d.days} of 7 days`;
    case 'comeback':
      return `+${d.gain} pts on the week before`;
  }
}

async function weekResults(c: Container, team: TeamRow, weekStart: string, viewerId: string, members: Member[]): Promise<WeekResultsDto | null> {
  const [result, rows] = await Promise.all([
    c.db.query.boardWeekResults.findFirst({ where: and(eq(s.boardWeekResults.teamId, team.id), eq(s.boardWeekResults.weekStart, weekStart)) }),
    weekRows(c, team.id, weekStart),
  ]);
  if (!result) return null;
  const byUser = new Map(members.map((m) => [m.user.id, m]));
  // Departed members keep their place in a closed week, shown by name only if still on the team.
  const shown = rows.filter((r) => byUser.get(r.userId)?.visible);
  const standings = shown
    .sort((a, b) => (a.finalRank ?? 999) - (b.finalRank ?? 999) || b.points - a.points)
    .map((r) => ({ person: byUser.get(r.userId)!.person, isMe: r.userId === viewerId, rank: r.finalRank, points: r.points, status: r.status as BoardStatus }));
  const podium = standings.filter((r) => r.rank != null && r.rank <= 3).map((r) => ({ person: r.person, isMe: r.isMe, rank: r.rank!, points: r.points }));
  const awards: AwardDto[] = result.awards
    .filter((a) => byUser.get(a.userId)?.visible)
    .map((a) => ({ key: a.key, person: byUser.get(a.userId)!.person, isMe: a.userId === viewerId, why: a.why }));
  const mine = rows.find((r) => r.userId === viewerId);
  let best = false;
  if (mine && mine.finalRank != null) {
    const [prev] = await c.db
      .select({ max: sql<number | null>`max(${s.boardWeeks.points})` })
      .from(s.boardWeeks)
      .where(and(eq(s.boardWeeks.userId, viewerId), eq(s.boardWeeks.final, true), lt(s.boardWeeks.weekStart, weekStart)));
    best = prev?.max != null && mine.points > Number(prev.max);
  }
  return { weekStart, weekNumber: isoWeekNumber(weekStart), podium, standings, awards, me: mine ? { rank: mine.finalRank, points: mine.points, best } : null };
}

/* ───────── Member card (GET /team/members/:id/points) ───────── */

export async function memberPoints(c: Container, viewer: AuthUser, memberId: string, weekParam?: string): Promise<MemberPointsResponse> {
  const team = await getTeam(c, viewer.teamId);
  if (!team.settings.featureFlags.leaderboard) throw notFound('The leaderboard is off.');
  const members = await teamMembers(c, team);
  const m = members.find((x) => x.user.id === memberId);
  const isMe = memberId === viewer.id;
  if (!m || (!m.visible && !isMe)) throw notFound('Member not found.');
  const today = localDateOf(c.clock.now(), viewer.timezone);
  const current = weekStartOf(today);
  const week = weekParam && weekStartOf(weekParam) < current ? weekStartOf(weekParam) : current;
  let row = await c.db.query.boardWeeks.findFirst({ where: and(eq(s.boardWeeks.teamId, team.id), eq(s.boardWeeks.weekStart, week), eq(s.boardWeeks.userId, memberId)) });
  if (!row && week === current) row = (await refreshBoardWeek(c, memberId, week)) ?? undefined;
  if (!row) throw notFound('No points for that week yet.');
  const [streaks, badges, facts, rows, solid] = await Promise.all([
    loggingStreaks(c, members.map((x) => x.user.id)),
    c.db.select({ n: sql<number>`count(*)::int` }).from(s.userBadges).where(eq(s.userBadges.userId, memberId)),
    isMe ? c.db.query.dayFacts.findMany({ where: and(eq(s.dayFacts.userId, memberId), gte(s.dayFacts.date, week), lte(s.dayFacts.date, addDays(week, 6))) }) : Promise.resolve([] as FactRow[]),
    weekRows(c, team.id, week),
    solidStats(c, members.filter((x) => x.visible || x.user.id === memberId)),
  ]);
  const byUser = new Map(members.map((x) => [x.user.id, x]));
  const ranked = rankWeek(
    rows.filter((r) => r.status === 'ranked' && byUser.get(r.userId)?.visible).map((r) => ({ userId: r.userId, points: r.points, name: byUser.get(r.userId)!.user.displayName })),
    solid,
    streaks,
  );
  const rank = row.final && row.finalRank != null ? row.finalRank : m.visible ? (ranked.find((r) => r.userId === memberId)?.rank ?? null) : null;
  const factBy = new Map(facts.map((f) => [f.date, toBoardFacts(f)]));
  return {
    person: m.person,
    isMe,
    weekStart: week,
    rank,
    points: row.points,
    status: row.status as BoardStatus,
    days: row.days.map((d) => ({ date: d.date, state: d.state as BoardDayState, points: d.points, items: isMe ? dayItems(d.parts, factBy.get(d.date) ?? null) : null })),
    parts: row.parts,
    streak: streaks.get(memberId)?.current ?? 0,
    badges: Number(badges[0]?.n ?? 0),
  };
}

/* ───────── Morning standings, the crown, the weekly close ───────── */

/**
 * Called by the team rollover once every member has settled `settled` (team-local yesterday). Refreshes everyone's
 * weeks, takes this morning's standings, passes the crown, and on Monday morning closes last week. Each step is
 * idempotent, so a repeated or late tick changes nothing.
 */
export async function teamMorning(c: Container, teamId: string, settled: string) {
  const team = await getTeam(c, teamId);
  if (!team.settings.featureFlags.leaderboard) return { closed: false };
  const members = await teamMembers(c, team);
  const today = addDays(settled, 1);
  const week = weekStartOf(today);
  const settledWeek = weekStartOf(settled);
  for (const m of members) {
    await refreshWeeksFor(c, m.user.id, settledWeek === week ? [today] : [settled, today]);
  }
  const state = await c.db.query.teamBoardState.findFirst({ where: eq(s.teamBoardState.teamId, teamId) });
  const [streaks, solid] = await Promise.all([loggingStreaks(c, members.map((m) => m.user.id)), solidStats(c, members)]);
  const visible = members.filter((m) => m.visible);

  // Standings for the movement arrows (none on Monday: everyone is at 0).
  if ((state?.dawnFor ?? '') < today && today !== week) {
    const rows = await weekRows(c, teamId, week);
    const byUser = new Map(visible.map((m) => [m.user.id, m]));
    const ranked = rankWeek(
      rows.filter((r) => r.status === 'ranked' && byUser.has(r.userId)).map((r) => ({ userId: r.userId, points: r.points, name: byUser.get(r.userId)!.user.displayName, row: r })),
      solid,
      streaks,
    );
    for (const r of rows) {
      const rank = ranked.find((x) => x.userId === r.userId)?.rank ?? null;
      await c.db.update(s.boardWeeks).set({ prevDawnRank: r.dawnRank, dawnRank: rank }).where(and(eq(s.boardWeeks.teamId, teamId), eq(s.boardWeeks.weekStart, week), eq(s.boardWeeks.userId, r.userId)));
    }
  }

  // The 👑 changes hands only when someone else's rate is strictly better.
  const crown = crownHolder(
    visible.map((m) => ({ id: m.user.id, solid: solid.get(m.user.id)?.solid ?? 0, eligible: solid.get(m.user.id)?.eligible ?? 0, streak: streaks.get(m.user.id)?.current ?? 0, best: streaks.get(m.user.id)?.best ?? 0 })),
    state?.crownUserId ?? null,
  );
  if (crown !== (state?.crownUserId ?? null) && crown) {
    const holder = visible.find((m) => m.user.id === crown)!;
    const st = solid.get(crown)!;
    if (team.settings.board.postResults) {
      await postSystemMessage(c, teamId, { systemKind: 'board_crown', body: `👑 ${holder.user.displayName} is the crew's most consistent — ${st.solid} of ${st.eligible} solid days.`, mentions: [crown], meta: { userId: crown } });
    }
  }
  const values = { teamId, crownUserId: crown, crownSince: crown === state?.crownUserId ? (state?.crownSince ?? today) : crown ? today : null, dawnFor: today, updatedAt: c.clock.now() };
  await c.db.insert(s.teamBoardState).values(values).onConflictDoUpdate({ target: s.teamBoardState.teamId, set: values });

  let closed = false;
  if (weekdayOf(settled) === 6) closed = await closeWeek(c, team, settledWeek, members, solid, streaks, crown);
  return { closed };
}

/** Final ranks, awards, the chat post and a push per member (not when `quiet`). Runs once per team and week. */
async function closeWeek(c: Container, team: TeamRow, weekStart: string, members: Member[], solid: Map<string, SolidStat>, streaks: Map<string, { current: number; best: number }>, crownId: string | null, quiet = false): Promise<boolean> {
  const done = await c.db.query.boardWeekResults.findFirst({ where: and(eq(s.boardWeekResults.teamId, team.id), eq(s.boardWeekResults.weekStart, weekStart)) });
  if (done) return false;
  const rows = await weekRows(c, team.id, weekStart);
  const byUser = new Map(members.map((m) => [m.user.id, m]));
  const visible = rows.filter((r) => byUser.get(r.userId)?.visible);
  const ranked = rankWeek(
    visible.filter((r) => r.status === 'ranked').map((r) => ({ userId: r.userId, points: r.points, name: byUser.get(r.userId)!.user.displayName, row: r })),
    solid,
    streaks,
  );
  const prevWeek = addDays(weekStart, -7);
  const [prevRows, bests] = await Promise.all([
    weekRows(c, team.id, prevWeek),
    ranked.length
      ? c.db
          .select({ userId: s.boardWeeks.userId, max: sql<number | null>`max(${s.boardWeeks.points})` })
          .from(s.boardWeeks)
          .where(and(inArray(s.boardWeeks.userId, ranked.map((r) => r.userId)), eq(s.boardWeeks.final, true), lt(s.boardWeeks.weekStart, weekStart)))
          .groupBy(s.boardWeeks.userId)
      : Promise.resolve([] as { userId: string; max: number | null }[]),
  ]);
  const prevPoints = new Map(prevRows.filter((r) => r.status === 'ranked').map((r) => [r.userId, r.points]));
  const bestBefore = new Map(bests.map((b) => [b.userId, b.max == null ? null : Number(b.max)]));
  const candidates: AwardCandidate[] = ranked.map((r) => ({
    id: r.userId,
    points: r.points,
    prevPoints: prevPoints.get(r.userId) ?? null,
    streak: streaks.get(r.userId)?.current ?? 0,
    workouts: r.row.workouts,
    planDone: r.row.planDone,
    hasPlan: r.row.hasPlan,
    proteinDays: r.row.proteinDays,
    bestBefore: bestBefore.get(r.userId) ?? null,
  }));
  const crownStat = crownId && solid.get(crownId) ? { id: crownId, solid: solid.get(crownId)!.solid, eligible: solid.get(crownId)!.eligible } : null;
  const awards: BoardAwardJson[] = weeklyAwards(candidates, crownStat).map((a) => ({ key: a.key, userId: a.id, why: awardWhy(a) }));

  await c.db.transaction(async (tx) => {
    for (const r of rows) {
      const rank = ranked.find((x) => x.userId === r.userId)?.rank ?? null;
      await tx.update(s.boardWeeks).set({ finalRank: rank, final: true }).where(and(eq(s.boardWeeks.teamId, team.id), eq(s.boardWeeks.weekStart, weekStart), eq(s.boardWeeks.userId, r.userId)));
    }
    await tx.insert(s.boardWeekResults).values({ teamId: team.id, weekStart, rankedCount: ranked.length, awards }).onConflictDoNothing();
  });

  if (quiet) return true;
  const n = isoWeekNumber(weekStart);
  const nameOf = (id: string) => byUser.get(id)?.user.displayName ?? 'Someone';
  if (team.settings.board.postResults && ranked.length >= BOARD_RULES.minRanked) {
    // Ties share a place: "Asha & Ravi 540 · Meera 500".
    const places = [...new Set(ranked.filter((r) => r.rank <= 3).map((r) => r.rank))];
    const podium = places
      .map((rank) => ranked.filter((r) => r.rank === rank))
      .map((at) => `${joinNames(at.map((r) => firstName(r.name)))} ${at[0]!.points}`)
      .join(' · ');
    const awardLine = awards.filter((a) => a.key !== 'winner').map((a) => `${AWARD_META[a.key].emoji} ${AWARD_META[a.key].title}: ${firstName(nameOf(a.userId))}`).join(' · ');
    const body = [`🏆 Week ${n}: ${podium}`, awardLine, 'New week — everyone’s back to 0.'].filter(Boolean).join('\n');
    const msg = await postSystemMessage(c, team.id, { systemKind: 'board_results', body, mentions: ranked.slice(0, 3).map((r) => r.userId), meta: { weekStart } });
    await c.db.update(s.boardWeekResults).set({ messageId: msg.id }).where(and(eq(s.boardWeekResults.teamId, team.id), eq(s.boardWeekResults.weekStart, weekStart)));
  }
  if (ranked.length >= 2) {
    const winners = ranked.filter((r) => r.rank === 1).map((r) => firstName(r.name));
    const tookIt = winners.length > 1 ? `${joinNames(winners)} shared the week.` : `${winners[0]} took the week.`;
    for (const m of members) {
      const mine = ranked.find((r) => r.userId === m.user.id);
      const joint = mine && ranked.some((r) => r.userId !== mine.userId && r.rank === mine.rank) ? 'joint ' : '';
      const body = mine ? `You finished ${joint}#${mine.rank} with ${mine.points} pts. New week — everyone’s back to 0.` : `${tookIt} New week — everyone’s back to 0.`;
      await notifyUser(c, m.user.id, { type: 'board_results', title: `Week ${n} results are in`, body, url: '/team', dedupeKey: `board:${team.id}:${weekStart}:${m.user.id}` }).catch((e: Error) =>
        log.warn('board.notify_failed', { userId: m.user.id, error: e.message }),
      );
    }
  }
  return true;
}

/* ───────── Live feedback after a save, admin overview ───────── */

/** Points and live rank for the member's current week (the "+10 Crew points · you're #3" toast). */
export async function currentStanding(c: Container, user: AuthUser): Promise<{ points: number; rank: number | null } | null> {
  const team = await getTeam(c, user.teamId);
  if (!team.settings.featureFlags.leaderboard) return null;
  const week = weekStartOf(localDateOf(c.clock.now(), user.timezone));
  const rows = await c.db
    .select({ userId: s.boardWeeks.userId, points: s.boardWeeks.points, status: s.boardWeeks.status, privacy: s.profiles.privacy, name: s.users.displayName })
    .from(s.boardWeeks)
    .innerJoin(s.users, eq(s.users.id, s.boardWeeks.userId))
    .innerJoin(s.profiles, eq(s.profiles.userId, s.boardWeeks.userId))
    .where(and(eq(s.boardWeeks.teamId, team.id), eq(s.boardWeeks.weekStart, week), eq(s.users.status, 'active')));
  const mine = rows.find((r) => r.userId === user.id);
  if (!mine) return null;
  const visible = rows.filter((r) => r.status === 'ranked' && (r.privacy.showOnBoard !== false || r.userId === user.id));
  const rank = mine.status === 'ranked' && mine.privacy.showOnBoard !== false ? 1 + visible.filter((r) => r.points > mine.points).length : null;
  return { points: mine.points, rank };
}

/** Top five for the admin overview card. */
export async function adminBoardCard(c: Container, teamId: string): Promise<NonNullable<AdminDashboardResponse['board']>> {
  const team = await getTeam(c, teamId);
  const week = weekStartOf(localDateOf(c.clock.now(), team.timezone));
  const members = await teamMembers(c, team);
  const [rows, streaks, solid] = await Promise.all([weekRows(c, teamId, week), loggingStreaks(c, members.map((m) => m.user.id)), solidStats(c, members.filter((m) => m.visible))]);
  const byUser = new Map(members.filter((m) => m.visible).map((m) => [m.user.id, m]));
  const ranked = rankWeek(
    rows.filter((r) => r.status === 'ranked' && byUser.has(r.userId)).map((r) => ({ userId: r.userId, points: r.points, name: byUser.get(r.userId)!.user.displayName })),
    solid,
    streaks,
  ).slice(0, 5);
  return {
    weekNumber: isoWeekNumber(week),
    weekStart: week,
    weekEnd: addDays(week, 6),
    rows: ranked.map((r) => {
      const st = solid.get(r.userId);
      return { person: byUser.get(r.userId)!.person, rank: r.rank, points: r.points, solidPct: st && st.eligible ? Math.round((st.solid / st.eligible) * 100) : null };
    }),
  };
}

/** After an admin changes the board rules: recompute the current week for everyone (workouts may count differently). */
export async function refreshTeamCurrentWeek(c: Container, teamId: string, recomputeFacts: boolean) {
  const team = await getTeam(c, teamId);
  const members = await teamMembers(c, team);
  for (const m of members) {
    const today = localDateOf(c.clock.now(), m.tz);
    const week = weekStartOf(today);
    if (recomputeFacts) for (const d of dateRange(week, today)) await computeDayFacts(c, m.user.id, d);
    await refreshWeeksFor(c, m.user.id, [today]);
  }
}

/**
 * Rebuild the leaderboard from logs (deploy backfill, demo seed): day facts for the last `days` days, every member's
 * weeks, quiet closes for finished weeks (no chat post, no push) and this morning's standings and crown.
 */
export async function backfillBoard(c: Container, teamId: string, days = 35): Promise<{ members: number; weeks: number; closed: number }> {
  const team = await getTeam(c, teamId);
  const members = await teamMembers(c, team);
  const now = c.clock.now();
  const weeks = new Set<string>();
  for (const m of members) {
    const today = localDateOf(now, m.tz);
    const joined = localDateOf(m.user.createdAt, m.tz);
    const from = addDays(today, -days) < joined ? joined : addDays(today, -days);
    for (const d of dateRange(from, today)) await computeDayFacts(c, m.user.id, d);
    const mine = [...new Set(dateRange(from, today).map(weekStartOf))];
    for (const w of mine) {
      await refreshBoardWeek(c, m.user.id, w);
      weeks.add(w);
    }
  }
  const settled = lastSettledDate(now, team.timezone);
  const [streaks, solid] = await Promise.all([loggingStreaks(c, members.map((m) => m.user.id)), solidStats(c, members)]);
  const state = await c.db.query.teamBoardState.findFirst({ where: eq(s.teamBoardState.teamId, teamId) });
  const visible = members.filter((m) => m.visible);
  const crown = crownHolder(
    visible.map((m) => ({ id: m.user.id, solid: solid.get(m.user.id)?.solid ?? 0, eligible: solid.get(m.user.id)?.eligible ?? 0, streak: streaks.get(m.user.id)?.current ?? 0, best: streaks.get(m.user.id)?.best ?? 0 })),
    state?.crownUserId ?? null,
  );
  let closed = 0;
  for (const w of [...weeks].sort()) {
    if (addDays(w, 6) <= settled && (await closeWeek(c, team, w, members, solid, streaks, crown, true))) closed++;
  }
  // Leave the morning step to set today's standings; the crown starts with the current holder.
  const values = { teamId, crownUserId: crown, crownSince: crown ? (state?.crownUserId === crown ? (state.crownSince ?? settled) : addDays(settled, 1)) : null, dawnFor: state?.dawnFor ?? null, updatedAt: now };
  await c.db.insert(s.teamBoardState).values(values).onConflictDoUpdate({ target: s.teamBoardState.teamId, set: values });
  return { members: members.length, weeks: weeks.size, closed };
}
