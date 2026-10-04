import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { GoalUpdateRequest, OnboardingRequest, PreferencesUpdateRequest, ProfileDto, ProfileUpdateRequest, VacationRequest, TargetsDto, ActivityLevel, GoalType, Sex } from '@clubhouse/contracts';
import { addDays, computeTargets, isValidTimeZone, vacationDaysInQuarter } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { refreshCurrentWeek } from './board';
import { badRequest, notFound } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { rescheduleUser } from './scheduler';
import { getTeam } from './team';
import { profileComplete, recomputeTargets, targetsDto } from './targets';

type ProfileRow = typeof s.profiles.$inferSelect;

export async function loadProfile(c: Container, userId: string): Promise<ProfileRow> {
  const p = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  if (!p) throw notFound('Profile not found.');
  return p;
}

export function profileToDto(p: ProfileRow, tz: string, today: string, vacationQuota: number): ProfileDto {
  return {
    units: p.units as 'metric' | 'imperial',
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    dob: p.dob,
    sex: p.sex as ProfileDto['sex'],
    activityLevel: p.activityLevel,
    goalType: p.goalType as ProfileDto['goalType'],
    targetWeightKg: p.targetWeightKg,
    targetDate: p.targetDate,
    paceKgWeek: p.paceKgWeek,
    eatBackExercise: p.eatBackExercise,
    dietPrefs: p.dietPrefs,
    privacy: { ...p.privacy, showOnBoard: p.privacy.showOnBoard !== false },
    aiOptOuts: p.aiOptOuts,
    momentumPrefs: { showOnToday: p.momentumPrefs.showOnToday },
    habitPrefs: { bundle: p.habitPrefs?.bundle ?? true, share: p.habitPrefs?.share ?? false },
    appPrefs: p.appPrefs,
    quietHours: p.quietHours,
    notificationsMaster: p.notificationsMaster,
    chatMutedUntil: p.chatMutedUntil?.toISOString() ?? null,
    vacationRanges: p.vacationRanges.map((r) => ({ from: r.from, to: r.to })),
    vacationDaysLeftThisQuarter: Math.max(0, vacationQuota - vacationDaysInQuarter(p.vacationRanges, today)),
    timezone: tz,
  };
}

export async function getProfileDto(c: Container, user: AuthUser): Promise<{ profile: ProfileDto; targets: TargetsDto | null }> {
  const p = await loadProfile(c, user.id);
  const team = await getTeam(c, user.teamId);
  const { today } = memberClock(c, user.timezone);
  return { profile: profileToDto(p, user.timezone, today, team.settings.streaks.vacationDaysPerQuarter), targets: await targetsDto(c, p, today) };
}

async function upsertWeight(c: Container, user: AuthUser, date: string, kg: number) {
  const existing = await c.db.query.weightEntries.findFirst({ where: and(eq(s.weightEntries.userId, user.id), eq(s.weightEntries.date, date)) });
  const now = c.clock.now();
  if (existing) await c.db.update(s.weightEntries).set({ weightKg: kg, deletedAt: null, clientUpdatedAt: now, serverUpdatedAt: now }).where(eq(s.weightEntries.id, existing.id));
  else await c.db.insert(s.weightEntries).values({ id: randomUUID(), userId: user.id, teamId: user.teamId, date, weightKg: kg, clientUpdatedAt: now });
}

/** APP-NAV-04/05: profile, goal and timezone in one step; returns the computed targets with their explanation. */
export async function completeOnboarding(c: Container, user: AuthUser, input: OnboardingRequest) {
  if (!isValidTimeZone(input.timezone)) throw badRequest('Unknown timezone.', 'invalid_timezone', { timezone: 'Unknown timezone' });
  const now = c.clock.now();
  await c.db
    .update(s.profiles)
    .set({
      units: input.units,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      dob: input.dob,
      sex: input.sex,
      activityLevel: input.activityLevel,
      goalType: input.goalType,
      paceKgWeek: input.goalType === 'maintain' ? null : (input.paceKgWeek ?? null),
      targetWeightKg: input.targetWeightKg ?? null,
      targetDate: input.targetDate ?? null,
      updatedAt: now,
    })
    .where(eq(s.profiles.userId, user.id));
  const team = await getTeam(c, user.teamId);
  await c.db.update(s.users).set({ timezone: input.timezone === team.timezone ? null : input.timezone, onboardedAt: now, updatedAt: now }).where(eq(s.users.id, user.id));
  const { today } = memberClock(c, input.timezone);
  await upsertWeight(c, user, today, input.weightKg);
  await recomputeTargets(c, user.id, today);
  await rescheduleUser(c, user.id);
  const p = await loadProfile(c, user.id);
  return targetsDto(c, p, today);
}

export async function updateProfile(c: Container, user: AuthUser, patch: ProfileUpdateRequest) {
  const now = c.clock.now();
  if (patch.timezone && !isValidTimeZone(patch.timezone)) throw badRequest('Unknown timezone.', 'invalid_timezone', { timezone: 'Unknown timezone' });
  const team = await getTeam(c, user.teamId);
  const userPatch: Partial<typeof s.users.$inferInsert> = { updatedAt: now };
  if (patch.displayName) userPatch.displayName = patch.displayName;
  if (patch.timezone) userPatch.timezone = patch.timezone === team.timezone ? null : patch.timezone;
  if (patch.avatarImageId !== undefined) userPatch.avatarImageId = patch.avatarImageId;
  await c.db.update(s.users).set(userPatch).where(eq(s.users.id, user.id));
  const profilePatch: Partial<typeof s.profiles.$inferInsert> = { updatedAt: now };
  for (const k of ['units', 'heightCm', 'dob', 'sex', 'activityLevel'] as const) if (patch[k] !== undefined) (profilePatch as Record<string, unknown>)[k] = patch[k];
  await c.db.update(s.profiles).set(profilePatch).where(eq(s.profiles.userId, user.id));
  const tz = patch.timezone ?? user.timezone;
  const { today } = memberClock(c, tz);
  if (patch.heightCm || patch.dob || patch.sex || patch.activityLevel) await recomputeTargets(c, user.id, today);
  if (patch.timezone) await rescheduleUser(c, user.id);
}

/** APP-SET-01/02: show the new targets before saving. */
export async function previewTargets(c: Container, user: AuthUser, patch: Partial<{ weightKg: number; activityLevel: ActivityLevel; goalType: GoalType; paceKgWeek: number | null; targetWeightKg: number | null; targetDate: string | null; heightCm: number; sex: Sex; dob: string }>) {
  const p = await loadProfile(c, user.id);
  const merged = { ...p, ...patch };
  if (!profileComplete(merged as ProfileRow)) return null;
  const { today } = memberClock(c, user.timezone);
  return computeTargets({
    sex: merged.sex as Sex,
    dob: merged.dob!,
    heightCm: merged.heightCm!,
    weightKg: merged.weightKg!,
    activityLevel: merged.activityLevel as ActivityLevel,
    goal: merged.goalType as GoalType,
    paceKgPerWeek: merged.paceKgWeek,
    targetWeightKg: merged.targetWeightKg,
    targetDate: merged.targetDate,
    today,
  });
}

export async function updateGoal(c: Container, user: AuthUser, input: GoalUpdateRequest) {
  await c.db
    .update(s.profiles)
    .set({
      goalType: input.goalType,
      paceKgWeek: input.goalType === 'maintain' ? null : (input.paceKgWeek ?? null),
      targetWeightKg: input.targetWeightKg ?? null,
      targetDate: input.targetDate ?? null,
      updatedAt: c.clock.now(),
    })
    .where(eq(s.profiles.userId, user.id));
  const { today } = memberClock(c, user.timezone);
  await recomputeTargets(c, user.id, today);
  return targetsDto(c, await loadProfile(c, user.id), today);
}

export async function updatePreferences(c: Container, user: AuthUser, patch: PreferencesUpdateRequest) {
  const p = await loadProfile(c, user.id);
  const now = c.clock.now();
  const next: Partial<typeof s.profiles.$inferInsert> = { updatedAt: now };
  if (patch.dietPrefs) next.dietPrefs = patch.dietPrefs;
  if (patch.privacy) next.privacy = { ...p.privacy, ...patch.privacy };
  if (patch.aiOptOuts) next.aiOptOuts = { ...p.aiOptOuts, ...patch.aiOptOuts };
  if (patch.momentumPrefs) next.momentumPrefs = patch.momentumPrefs;
  if (patch.habitPrefs) next.habitPrefs = { ...p.habitPrefs, ...patch.habitPrefs };
  if (patch.appPrefs) next.appPrefs = { ...p.appPrefs, ...patch.appPrefs };
  if (patch.quietHours !== undefined) next.quietHours = patch.quietHours;
  if (patch.notificationsMaster !== undefined) next.notificationsMaster = patch.notificationsMaster;
  if (patch.eatBackExercise !== undefined) next.eatBackExercise = patch.eatBackExercise;
  if (patch.chatMute) {
    const ms = { off: 0, '1h': 3600_000, '8h': 8 * 3600_000, '1w': 7 * 86400_000 }[patch.chatMute];
    next.chatMutedUntil = ms ? new Date(now.getTime() + ms) : null;
  }
  await c.db.update(s.profiles).set(next).where(eq(s.profiles.userId, user.id));
  if (patch.quietHours !== undefined || patch.notificationsMaster !== undefined) await rescheduleUser(c, user.id);
}

/** SYS-STREAK-05: vacation freezes all streaks, up to the quarterly quota. */
export async function setVacation(c: Container, user: AuthUser, input: VacationRequest, setBy?: string) {
  const p = await loadProfile(c, user.id);
  const team = await getTeam(c, user.teamId);
  const { today } = memberClock(c, user.timezone);
  if (input.to < today) throw badRequest('Pick dates from today onwards.', 'past_vacation');
  const ranges = [...p.vacationRanges.filter((r) => r.to < input.from || r.from > input.to), { from: input.from, to: input.to, ...(setBy ? { setBy } : {}) }].sort((a, b) => (a.from < b.from ? -1 : 1));
  if (!setBy) {
    const quota = team.settings.streaks.vacationDaysPerQuarter;
    for (const d of [input.from, input.to]) {
      if (vacationDaysInQuarter(ranges, d) > quota) throw badRequest(`That goes over the ${quota} vacation days you have this quarter.`, 'vacation_quota');
    }
  }
  await c.db.update(s.profiles).set({ vacationRanges: ranges, updatedAt: c.clock.now() }).where(eq(s.profiles.userId, user.id));
  // Vacation days are credited with the member's average day on the leaderboard.
  await refreshCurrentWeek(c, user.id);
  return ranges;
}

export async function endVacation(c: Container, user: AuthUser) {
  const p = await loadProfile(c, user.id);
  const { today } = memberClock(c, user.timezone);
  const yesterday = addDays(today, -1);
  const ranges = p.vacationRanges
    .map((r) => (r.from <= today && today <= r.to ? { ...r, to: yesterday } : r))
    .filter((r) => r.from <= r.to && !(r.from > today));
  await c.db.update(s.profiles).set({ vacationRanges: ranges, updatedAt: c.clock.now() }).where(eq(s.profiles.userId, user.id));
  await refreshCurrentWeek(c, user.id);
  return ranges;
}

export async function requestDeletion(c: Container, user: AuthUser, note: string | null) {
  const open = await c.db.query.deletionRequests.findFirst({ where: and(eq(s.deletionRequests.userId, user.id), eq(s.deletionRequests.status, 'open')) });
  if (open) return open;
  const [row] = await c.db.insert(s.deletionRequests).values({ userId: user.id, teamId: user.teamId, note }).returning();
  return row!;
}
