import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { HABIT_GROUPS, type HabitCheckinDto, type HabitCheckinUpsert, type HabitDayItem, type HabitDayResponse, type HabitDetailResponse, type HabitDto, type HabitGroup, type HabitKind, type HabitPrefUpdate, type HabitWeekResponse, type UpsertResult } from '@clubhouse/contracts';
import {
  addDays,
  adherencePct,
  dateRange,
  habitAdherence,
  habitCells,
  habitKeptThisWeek,
  habitScheduleLabel,
  habitsStreak,
  habitStreak,
  isHabitComplete,
  isHabitShownOn,
  isOnVacation,
  weekStartOf,
  weeklyDoneCount,
  type HabitRule,
  type HabitValues,
} from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { badRequest, notFound } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { emptyEffects } from './effects';
import { rescheduleUser } from './scheduler';
import { getTeam } from './team';

export type HabitRow = typeof s.habits.$inferSelect;
type PrefRow = typeof s.habitMemberPrefs.$inferSelect;
type CheckinRow = typeof s.habitCheckins.$inferSelect;

export const habitRule = (h: HabitRow): HabitRule => ({ id: h.id, kind: h.kind as HabitKind, target: h.target, schedule: h.schedule, required: h.required, startsOn: h.startsOn, endsOn: h.endsOn });

const GROUP_ORDER = new Map<string, number>(HABIT_GROUPS.map((g, i) => [g, i]));
export const byListOrder = (a: HabitRow, b: HabitRow) => (GROUP_ORDER.get(a.group) ?? 9) - (GROUP_ORDER.get(b.group) ?? 9) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** The member's own reminder for a habit: their override, else the admin default; null when off. */
export function effectiveReminder(h: Pick<HabitRow, 'reminderTime'>, pref: Pick<PrefRow, 'reminderTime' | 'reminderOff'> | undefined): string | null {
  if (pref?.reminderOff) return null;
  return pref?.reminderTime ?? h.reminderTime;
}

/** Live (not archived, switched on) habits assigned to a member: everyone's plus the ones picked for them. */
export async function memberHabits(c: Container, userId: string, teamId: string): Promise<HabitRow[]> {
  const rows = await c.db
    .select({ h: s.habits })
    .from(s.habits)
    .leftJoin(s.habitAssignments, and(eq(s.habitAssignments.habitId, s.habits.id), eq(s.habitAssignments.userId, userId)))
    .where(and(eq(s.habits.teamId, teamId), isNull(s.habits.archivedAt), eq(s.habits.enabled, true), or(eq(s.habits.assignAll, true), sql`${s.habitAssignments.userId} is not null`)));
  return rows.map((r) => r.h).sort(byListOrder);
}

export async function memberPrefs(c: Container, userId: string): Promise<Map<string, PrefRow>> {
  const rows = await c.db.query.habitMemberPrefs.findMany({ where: eq(s.habitMemberPrefs.userId, userId) });
  return new Map(rows.map((r) => [r.habitId, r]));
}

/** Check-in values for some members and habits over [from, to], keyed by user → habit → date. */
export async function loadValues(c: Container, userIds: string[], habitIds: string[], from: string, to: string): Promise<{ byUser: Map<string, HabitValues>; rows: CheckinRow[] }> {
  const byUser = new Map<string, HabitValues>();
  if (!userIds.length || !habitIds.length) return { byUser, rows: [] };
  const rows = await c.db.query.habitCheckins.findMany({
    where: and(inArray(s.habitCheckins.userId, userIds), inArray(s.habitCheckins.habitId, habitIds), gte(s.habitCheckins.date, from), lte(s.habitCheckins.date, to)),
  });
  for (const r of rows) {
    let u = byUser.get(r.userId);
    if (!u) byUser.set(r.userId, (u = new Map()));
    let h = u.get(r.habitId);
    if (!h) u.set(r.habitId, (h = new Map()));
    h.set(r.date, r.value);
  }
  return { byUser, rows };
}

async function namesOf(c: Container, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = await c.db.select({ id: s.users.id, name: s.users.displayName }).from(s.users).where(inArray(s.users.id, unique));
  return new Map(rows.map((r) => [r.id, r.name.split(' ')[0] ?? r.name]));
}

export function habitDto(h: HabitRow, pref: PrefRow | undefined, names: Map<string, string>): HabitDto {
  return {
    id: h.id,
    name: h.name,
    icon: h.icon,
    hue: h.hue,
    group: h.group as HabitGroup,
    kind: h.kind as HabitKind,
    target: h.target,
    unit: h.unit,
    schedule: h.schedule,
    scheduleLabel: habitScheduleLabel(h.schedule),
    required: h.required,
    note: h.note,
    reminderTime: effectiveReminder(h, pref),
    defaultReminderTime: h.reminderTime,
    reminderOff: !!pref?.reminderOff,
    setBy: names.get(h.updatedBy ?? h.createdBy ?? '') ?? null,
  };
}

const isHidden = (h: HabitRow, pref: PrefRow | undefined) => !h.required && !!pref?.hidden;

/** Everything the habit screens need for one member: habits, prefs, values far enough back for streaks. */
type MemberRef = Pick<AuthUser, 'id' | 'teamId' | 'timezone'>;

async function memberContext(c: Container, user: MemberRef) {
  const clock = memberClock(c, user.timezone);
  const [habits, prefs, team, profile] = await Promise.all([
    memberHabits(c, user.id, user.teamId),
    memberPrefs(c, user.id),
    getTeam(c, user.teamId),
    c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, user.id) }),
  ]);
  const visible = habits.filter((h) => !isHidden(h, prefs.get(h.id)));
  const earliest = visible.reduce((m, h) => (h.startsOn < m ? h.startsOn : m), clock.today);
  const floor = addDays(clock.today, -400);
  const from = earliest > floor ? earliest : floor;
  const { byUser } = await loadValues(c, [user.id], habits.map((h) => h.id), weekStartOf(from), clock.today);
  const values = byUser.get(user.id) ?? new Map();
  const vacations = profile?.vacationRanges ?? [];
  return { clock, habits, visible, prefs, team, values, isVacation: (d: string) => isOnVacation(vacations, d) };
}

/** Checklist for one day (today by default): due habits with their value, done count and the habits streak. */
export async function getHabitDay(c: Container, user: MemberRef, date?: string): Promise<HabitDayResponse> {
  const ctx = await memberContext(c, user);
  const { today } = ctx.clock;
  const day = date ?? today;
  if (day > today) throw badRequest('That day hasn’t happened yet.', 'future_date');
  if (day < addDays(today, -400)) throw badRequest('That day is too far back.', 'too_old');
  const [names, rows] = await Promise.all([
    namesOf(c, ctx.habits.flatMap((h) => [h.updatedBy, h.createdBy])),
    c.db.query.habitCheckins.findMany({ where: and(eq(s.habitCheckins.userId, user.id), eq(s.habitCheckins.date, day)) }),
  ]);
  const byHabit = new Map(rows.map((r) => [r.habitId, r]));
  const items: HabitDayItem[] = ctx.visible
    .filter((h) => isHabitShownOn(habitRule(h), ctx.values, day))
    .map((h) => {
      const r = byHabit.get(h.id);
      const value = r?.value ?? 0;
      return {
        ...habitDto(h, ctx.prefs.get(h.id), names),
        value,
        done: isHabitComplete(h.kind as HabitKind, value, h.target),
        checkinId: r?.id ?? null,
        addedLate: r?.addedLate ?? false,
        week: h.schedule.type === 'weekly' ? { done: weeklyDoneCount(habitRule(h), ctx.values, day, day), target: h.schedule.perWeek } : null,
      };
    });
  const streak = habitsStreak(ctx.visible.map(habitRule), ctx.values, today, { isVacation: ctx.isVacation, settings: ctx.team.settings.streaks });
  return {
    date: day,
    today,
    editable: day === today || day === addDays(today, -1),
    items,
    done: items.filter((i) => i.done).length,
    total: items.length,
    streak,
    hidden: ctx.habits.filter((h) => isHidden(h, ctx.prefs.get(h.id))).map((h) => ({ id: h.id, name: h.name, icon: h.icon })),
  };
}

function checkinDto(r: CheckinRow): HabitCheckinDto {
  return { id: r.id, habitId: r.habitId, date: r.date, value: r.value, done: r.done, addedLate: r.addedLate, clientUpdatedAt: r.clientUpdatedAt.toISOString() };
}

function clampValue(kind: HabitKind, value: number): number {
  if (kind === 'check') return value > 0 ? 1 : 0;
  if (kind === 'scale') return Math.max(0, Math.min(5, Math.round(value)));
  return Math.max(0, Math.round(value));
}

/**
 * Tick a habit for a day (last write wins on `clientUpdatedAt`, one row per member, habit and date). Today and
 * yesterday are open; two days back is still accepted so an offline tick from late last night can sync. Anything for
 * a past day is marked added later.
 */
export async function upsertCheckin(c: Container, user: AuthUser, id: string, input: HabitCheckinUpsert): Promise<UpsertResult<HabitCheckinDto>> {
  const { today, now } = memberClock(c, user.timezone);
  if (input.date > today) throw badRequest('You can’t tick a habit for a future day.', 'future_date', { date: 'Future date' });
  if (input.date < addDays(today, -2)) throw badRequest('That day is closed for habits now.', 'too_old', { date: 'Too far back' });
  const habit = (await memberHabits(c, user.id, user.teamId)).find((h) => h.id === input.habitId);
  if (!habit) throw notFound('That habit isn’t on your list any more.');
  const kind = habit.kind as HabitKind;
  const value = clampValue(kind, input.value);
  const clientUpdatedAt = new Date(Math.min(new Date(input.clientUpdatedAt).getTime(), now.getTime() + 5 * 60_000));
  const values = {
    id,
    userId: user.id,
    teamId: user.teamId,
    habitId: habit.id,
    date: input.date,
    value,
    done: isHabitComplete(kind, value, habit.target),
    target: habit.target,
    addedLate: input.date < today,
    clientUpdatedAt,
    serverUpdatedAt: now,
  };
  const [row] = await c.db
    .insert(s.habitCheckins)
    .values(values)
    .onConflictDoUpdate({
      target: [s.habitCheckins.userId, s.habitCheckins.habitId, s.habitCheckins.date],
      set: { value, done: values.done, target: habit.target, clientUpdatedAt, serverUpdatedAt: now },
      setWhere: sql`${s.habitCheckins.clientUpdatedAt} < ${clientUpdatedAt.toISOString()}::timestamptz`,
    })
    .returning();
  if (!row) {
    const existing = await c.db.query.habitCheckins.findFirst({ where: and(eq(s.habitCheckins.userId, user.id), eq(s.habitCheckins.habitId, habit.id), eq(s.habitCheckins.date, input.date)) });
    return { status: 'stale', entity: checkinDto(existing!), effects: emptyEffects() };
  }
  return { status: 'applied', entity: checkinDto(row), effects: emptyEffects() };
}

/** One habit: five weeks of dots, current and best streak, 14-day adherence, the how-to note and the reminder. */
export async function getHabitDetail(c: Container, user: AuthUser, habitId: string): Promise<HabitDetailResponse> {
  const ctx = await memberContext(c, user);
  const h = ctx.habits.find((x) => x.id === habitId);
  if (!h) throw notFound('That habit isn’t on your list any more.');
  const { today } = ctx.clock;
  const rule = habitRule(h);
  const names = await namesOf(c, [h.updatedBy, h.createdBy]);
  const { current, best } = habitStreak(rule, ctx.values, today);
  return {
    habit: habitDto(h, ctx.prefs.get(h.id), names),
    today,
    cells: habitCells(rule, ctx.values, today),
    current,
    best,
    adherence14: adherencePct(habitAdherence(rule, ctx.values, addDays(today, -14), addDays(today, -1))),
  };
}

/** Hide an optional habit, or change its reminder; reminders are rescheduled straight away. */
export async function updateHabitPref(c: Container, user: AuthUser, habitId: string, patch: HabitPrefUpdate) {
  const h = (await memberHabits(c, user.id, user.teamId)).find((x) => x.id === habitId);
  if (!h) {
    // Unhiding works even for a habit that has since been archived or unassigned (it just disappears from the list).
    if (patch.hidden === false) {
      await c.db.update(s.habitMemberPrefs).set({ hidden: false, updatedAt: c.clock.now() }).where(and(eq(s.habitMemberPrefs.userId, user.id), eq(s.habitMemberPrefs.habitId, habitId)));
      return;
    }
    throw notFound('That habit isn’t on your list any more.');
  }
  if (patch.hidden && h.required) throw badRequest('This habit is required by your admin, so it stays on your list.', 'habit_required');
  const set: Partial<typeof s.habitMemberPrefs.$inferInsert> = { updatedAt: c.clock.now() };
  if (patch.hidden !== undefined) set.hidden = patch.hidden;
  if (patch.reminderTime !== undefined) set.reminderTime = patch.reminderTime;
  if (patch.reminderOff !== undefined) set.reminderOff = patch.reminderOff;
  await c.db
    .insert(s.habitMemberPrefs)
    .values({ userId: user.id, habitId, hidden: false, reminderOff: false, ...set })
    .onConflictDoUpdate({ target: [s.habitMemberPrefs.userId, s.habitMemberPrefs.habitId], set });
  await rescheduleUser(c, user.id, 'habit_reminder');
}

/** Last 7 days ending today: done vs due per day, habits kept, and the ones slipping. */
export async function getHabitWeek(c: Container, user: AuthUser): Promise<HabitWeekResponse> {
  const ctx = await memberContext(c, user);
  const { today } = ctx.clock;
  const days = dateRange(addDays(today, -6), today).map((date) => {
    const shown = ctx.visible.filter((h) => isHabitShownOn(habitRule(h), ctx.values, date));
    const done = shown.filter((h) => isHabitComplete(h.kind as HabitKind, ctx.values.get(h.id)?.get(date) ?? 0, h.target)).length;
    return { date, done, total: shown.length };
  });
  const verdicts = ctx.visible.map((h) => ({ h, kept: habitKeptThisWeek(habitRule(h), ctx.values, today) })).filter((x) => x.kept !== null);
  return { days, kept: verdicts.filter((x) => x.kept).length, total: verdicts.length, slipping: verdicts.filter((x) => !x.kept).map((x) => x.h.name) };
}

/** Habits whose reminder is at `time` on `date` and still open: what a bundled habit reminder is about. */
export async function habitsDueAt(c: Container, user: AuthUser, date: string, time: string): Promise<HabitRow[]> {
  const ctx = await memberContext(c, user);
  return ctx.visible.filter((h) => effectiveReminder(h, ctx.prefs.get(h.id)) === time && isHabitShownOn(habitRule(h), ctx.values, date) && !isHabitComplete(h.kind as HabitKind, ctx.values.get(h.id)?.get(date) ?? 0, h.target));
}

/** Weekly (weekday, time) slots for the bundled habit reminder: each habit's reminder on its scheduled days. */
export async function habitReminderSlots(c: Container, userId: string, teamId: string, days: number[]): Promise<{ weekday: number; time: string }[]> {
  const [habits, prefs] = await Promise.all([memberHabits(c, userId, teamId), memberPrefs(c, userId)]);
  const seen = new Set<string>();
  const out: { weekday: number; time: string }[] = [];
  for (const h of habits) {
    const pref = prefs.get(h.id);
    if (isHidden(h, pref)) continue;
    const time = effectiveReminder(h, pref);
    if (!time) continue;
    const weekdays = h.schedule.type === 'days' ? h.schedule.days : [0, 1, 2, 3, 4, 5, 6];
    for (const wd of weekdays) {
      const key = `${wd}@${time}`;
      if (!days.includes(wd) || seen.has(key)) continue;
      seen.add(key);
      out.push({ weekday: wd, time });
    }
  }
  return out;
}

/** Of `habitIds`, the ones still open for the member on `date` (snoozed and "Done" reminder actions). */
export async function openHabitIds(c: Container, user: AuthUser, date: string, habitIds: string[]): Promise<string[]> {
  if (!habitIds.length) return [];
  const ctx = await memberContext(c, user);
  return ctx.visible.filter((h) => habitIds.includes(h.id) && isHabitShownOn(habitRule(h), ctx.values, date) && !isHabitComplete(h.kind as HabitKind, ctx.values.get(h.id)?.get(date) ?? 0, h.target)).map((h) => h.id);
}

/** The value that completes a habit, for ticking it from a reminder ("Done"). */
export function completingValue(h: Pick<HabitRow, 'kind' | 'target'>): number {
  return h.kind === 'check' ? 1 : h.kind === 'scale' ? 3 : h.target;
}
