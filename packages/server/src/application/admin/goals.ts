import { eq, inArray } from 'drizzle-orm';
import type { ActivityLevel, AdminGoalRow, AdminGoalUpdate, GoalType, MemberTargetSettingsRequest, OverrideTargetsRequest, Sex } from '@clubhouse/contracts';
import { CALORIE_FLOOR, checkTargetSafety, computeTargets, localDateOf, MAX_PACE_KG_PER_WEEK } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { z } from 'zod';
import type { Container } from '../../container';
import { notFound, unprocessable } from '../../lib/errors';
import { profileComplete, recomputeTargets, targetsDto } from '../targets';
import { getTeam } from '../team';
import { assertCanManage, getMember, isSuper, logAudit, personMap, personOf, teamUsers, type Actor, type UserRow } from './shared';

type ProfileRow = typeof s.profiles.$inferSelect;

async function goalRow(c: Container, u: UserRow, p: ProfileRow | undefined, person: AdminGoalRow['person'], teamTz: string): Promise<AdminGoalRow> {
  const today = localDateOf(c.clock.now(), u.timezone || teamTz);
  return {
    person,
    userId: u.id,
    goalType: p?.goalType ?? null,
    paceKgWeek: p?.paceKgWeek ?? null,
    weightKg: p?.weightKg ?? null,
    targetWeightKg: p?.targetWeightKg ?? null,
    targetDate: p?.targetDate ?? null,
    targets: p ? await targetsDto(c, p, today) : null,
    eatBackExercise: p?.eatBackExercise ?? false,
  };
}

export async function listGoals(c: Container, a: Actor): Promise<AdminGoalRow[]> {
  const team = await getTeam(c, a.user.teamId);
  const users = await teamUsers(c, a.user.teamId, { activeOnly: true });
  if (!users.length) return [];
  const [profiles, people] = await Promise.all([c.db.query.profiles.findMany({ where: inArray(s.profiles.userId, users.map((u) => u.id)) }), personMap(c, users.map((u) => u.id))]);
  return Promise.all(users.map((u) => goalRow(c, u, profiles.find((p) => p.userId === u.id), personOf(people, u.id)!, team.timezone)));
}

async function one(c: Container, a: Actor, userId: string): Promise<AdminGoalRow> {
  const u = await getMember(c, a.user.teamId, userId);
  const team = await getTeam(c, a.user.teamId);
  const p = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  const people = await personMap(c, [u.id]);
  return goalRow(c, u, p, personOf(people, u.id)!, team.timezone);
}

async function loadProfile(c: Container, userId: string) {
  const p = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  if (!p) throw notFound('This member has no profile yet.');
  return p;
}

/**
 * Safety refusals (ADM-PLAN-11, SRS §12): pace above 1 kg/week or calories below the floor are refused with a
 * friendly 422 unless a Super Admin passes an override reason (which is audited).
 */
function enforceSafety(a: Actor, reasons: string[], overrideReason: string | undefined) {
  if (!reasons.length) return null;
  if (isSuper(a) && overrideReason) return overrideReason;
  const hint = isSuper(a) ? ' Add a safety override reason to go ahead anyway.' : ' Only a Super Admin can override this, with a reason.';
  throw unprocessable(`${reasons.join(' ')}${hint}`, 'unsafe_target', { safety: reasons.join(' ') });
}

export async function updateGoal(c: Container, a: Actor, userId: string, input: z.infer<typeof AdminGoalUpdate>) {
  const u = await getMember(c, a.user.teamId, userId);
  assertCanManage(a, u);
  const p = await loadProfile(c, userId);
  const team = await getTeam(c, a.user.teamId);
  const today = localDateOf(c.clock.now(), u.timezone || team.timezone);
  const pace = input.goalType === 'maintain' ? null : (input.paceKgWeek !== undefined ? input.paceKgWeek : p.paceKgWeek);
  const next = {
    goalType: input.goalType,
    paceKgWeek: pace,
    targetWeightKg: input.targetWeightKg !== undefined ? input.targetWeightKg : p.targetWeightKg,
    targetDate: input.targetDate !== undefined ? input.targetDate : p.targetDate,
    activityLevel: input.activityLevel ?? p.activityLevel,
  };
  const reasons: string[] = [];
  if ((next.paceKgWeek ?? 0) > MAX_PACE_KG_PER_WEEK) reasons.push(`A pace above ${MAX_PACE_KG_PER_WEEK} kg a week isn’t allowed.`);
  const merged = { ...p, ...next };
  if (profileComplete(merged as ProfileRow)) {
    const r = computeTargets({
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
    if (r.paceCapped && !reasons.length) reasons.push(`Reaching that target by that date needs more than ${MAX_PACE_KG_PER_WEEK} kg a week.`);
  }
  const override = enforceSafety(a, reasons, input.safetyOverrideReason);
  await c.db.update(s.profiles).set({ ...next, updatedAt: c.clock.now() }).where(eq(s.profiles.userId, userId));
  await recomputeTargets(c, userId, today);
  await logAudit(c, a, {
    action: 'goal.update',
    targetType: 'profile',
    targetId: userId,
    memberId: userId,
    before: { goalType: p.goalType, paceKgWeek: p.paceKgWeek, targetWeightKg: p.targetWeightKg, targetDate: p.targetDate, activityLevel: p.activityLevel },
    after: next,
    reason: override ? `Safety override: ${override}` : null,
  });
  return one(c, a, userId);
}

export async function overrideTargets(c: Container, a: Actor, userId: string, input: z.infer<typeof OverrideTargetsRequest>) {
  const u = await getMember(c, a.user.teamId, userId);
  assertCanManage(a, u);
  const p = await loadProfile(c, userId);
  const prev = p.targetOverrides ?? {};
  const next = { ...prev };
  for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fibre'] as const) if (input[k] !== undefined) next[k] = input[k];
  if (next.kcal != null) {
    const sex = (p.sex as Sex | null) ?? 'unspecified';
    const safety = checkTargetSafety(sex, next.kcal, 0);
    const reasons = safety.ok ? [] : [`${next.kcal.toLocaleString('en-IN')} kcal is below the safe floor of ${CALORIE_FLOOR[sex].toLocaleString('en-IN')} kcal.`];
    enforceSafety(a, reasons, input.safetyOverrideReason);
  }
  const hasAny = Object.values(next).some((v) => v != null);
  await c.db
    .update(s.profiles)
    .set({ targetOverrides: hasAny ? next : null, targetsOverriddenBy: hasAny ? a.user.id : null, overrideReason: hasAny ? input.reason : null, updatedAt: c.clock.now() })
    .where(eq(s.profiles.userId, userId));
  await logAudit(c, a, {
    action: 'targets.override',
    targetType: 'profile',
    targetId: userId,
    memberId: userId,
    before: { overrides: p.targetOverrides, reason: p.overrideReason },
    after: { overrides: next },
    reason: input.safetyOverrideReason ? `${input.reason} (safety override: ${input.safetyOverrideReason})` : input.reason,
  });
  return one(c, a, userId);
}

export async function clearOverride(c: Container, a: Actor, userId: string, reason: string) {
  const u = await getMember(c, a.user.teamId, userId);
  assertCanManage(a, u);
  const p = await loadProfile(c, userId);
  await c.db.update(s.profiles).set({ targetOverrides: null, targetsOverriddenBy: null, overrideReason: null, updatedAt: c.clock.now() }).where(eq(s.profiles.userId, userId));
  await logAudit(c, a, { action: 'targets.clear_override', targetType: 'profile', targetId: userId, memberId: userId, before: { overrides: p.targetOverrides, reason: p.overrideReason }, after: { overrides: null }, reason });
  return one(c, a, userId);
}

export async function memberTargetSettings(c: Container, a: Actor, userId: string, input: z.infer<typeof MemberTargetSettingsRequest>) {
  const u = await getMember(c, a.user.teamId, userId);
  assertCanManage(a, u);
  const p = await loadProfile(c, userId);
  const patch: Partial<typeof s.profiles.$inferInsert> = { updatedAt: c.clock.now() };
  if (input.eatBackExercise !== undefined) patch.eatBackExercise = input.eatBackExercise;
  if (input.thresholdsOverride !== undefined) patch.thresholdsOverride = input.thresholdsOverride && Object.keys(input.thresholdsOverride).length ? input.thresholdsOverride : null;
  await c.db.update(s.profiles).set(patch).where(eq(s.profiles.userId, userId));
  await logAudit(c, a, {
    action: 'targets.settings_update',
    targetType: 'profile',
    targetId: userId,
    memberId: userId,
    before: { eatBackExercise: p.eatBackExercise, thresholdsOverride: p.thresholdsOverride },
    after: { eatBackExercise: patch.eatBackExercise ?? p.eatBackExercise, thresholdsOverride: patch.thresholdsOverride !== undefined ? patch.thresholdsOverride : p.thresholdsOverride },
  });
  return one(c, a, userId);
}
