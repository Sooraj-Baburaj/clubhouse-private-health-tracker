import { eq } from 'drizzle-orm';
import type { ActivityLevel, GoalType, Sex, TargetsDto } from '@clubhouse/contracts';
import { ageFromDob, applyOverrides, CALORIE_FLOOR, computeTargets, type MacroTargets } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { initials } from '../lib/crypto';

type ProfileRow = typeof s.profiles.$inferSelect;

export function profileComplete(p: ProfileRow): boolean {
  return !!(p.heightCm && p.weightKg && p.dob && p.sex && p.activityLevel && p.goalType);
}

/** Recompute and persist the logic-engine targets (SYS-CALC-01…04). Overrides are kept separately and win on read. */
export async function recomputeTargets(c: Container, userId: string, today: string): Promise<void> {
  const p = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  if (!p || !profileComplete(p)) return;
  const r = computeTargets({
    sex: p.sex as Sex,
    dob: p.dob!,
    heightCm: p.heightCm!,
    weightKg: p.weightKg!,
    activityLevel: p.activityLevel as ActivityLevel,
    goal: p.goalType as GoalType,
    paceKgPerWeek: p.paceKgWeek,
    targetWeightKg: p.targetWeightKg,
    targetDate: p.targetDate,
    today,
  });
  await c.db
    .update(s.profiles)
    .set({ calorieTarget: r.kcal, proteinG: r.protein, carbsG: r.carbs, fatG: r.fat, fibreG: r.fibre, tdee: r.tdee, targetsWeightKg: p.weightKg, targetsComputedAt: c.clock.now(), updatedAt: c.clock.now() })
    .where(eq(s.profiles.userId, userId));
}

export function effectiveTargets(p: ProfileRow): (MacroTargets & { overridden: (keyof MacroTargets)[] }) | null {
  if (p.calorieTarget == null) return null;
  const base: MacroTargets = { kcal: p.calorieTarget, protein: p.proteinG ?? 0, carbs: p.carbsG ?? 0, fat: p.fatG ?? 0, fibre: p.fibreG ?? 0 };
  return applyOverrides(base, p.targetOverrides);
}

export async function targetsDto(c: Container, p: ProfileRow, today: string): Promise<TargetsDto | null> {
  const eff = effectiveTargets(p);
  if (!eff || !profileComplete(p)) return null;
  const r = computeTargets({
    sex: p.sex as Sex,
    dob: p.dob!,
    heightCm: p.heightCm!,
    weightKg: p.targetsWeightKg ?? p.weightKg!,
    activityLevel: p.activityLevel as ActivityLevel,
    goal: p.goalType as GoalType,
    paceKgPerWeek: p.paceKgWeek,
    targetWeightKg: p.targetWeightKg,
    targetDate: p.targetDate,
    today,
  });
  let overriddenBy = null;
  if (p.targetsOverriddenBy && eff.overridden.length) {
    const admin = await c.db.query.users.findFirst({ where: eq(s.users.id, p.targetsOverriddenBy) });
    if (admin) overriddenBy = { id: admin.id, name: admin.displayName, initials: initials(admin.displayName), avatarUrl: null };
  }
  const explanation = eff.overridden.includes('kcal') ? `${eff.kcal.toLocaleString('en-IN')} kcal a day, set by ${overriddenBy?.name ?? 'your admin'}` : r.explanation;
  return {
    kcal: eff.kcal,
    protein: eff.protein,
    carbs: eff.carbs,
    fat: eff.fat,
    fibre: eff.fibre,
    tdee: p.tdee,
    bmr: r.bmr,
    floorHit: r.floorHit,
    floor: CALORIE_FLOOR[(p.sex as Sex) ?? 'unspecified'],
    paceCapped: r.paceCapped,
    effectivePaceKgPerWeek: r.effectivePaceKgPerWeek,
    explanation,
    overridden: eff.overridden,
    overriddenBy,
    overrideReason: p.overrideReason,
    computedFromWeightKg: p.targetsWeightKg,
    inputs: { sex: p.sex, ageYears: p.dob ? ageFromDob(p.dob, today) : null, heightCm: p.heightCm, weightKg: p.targetsWeightKg ?? p.weightKg, activityLevel: p.activityLevel, goalType: p.goalType },
  };
}
