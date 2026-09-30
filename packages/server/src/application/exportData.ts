import { asc, eq } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { hitRateLimit } from './rateLimit';
import { getProfileDto } from './profile';
import { getTeam } from './team';

export interface ExportFile {
  body: Uint8Array;
  contentType: string;
  filename: string;
}

/** Everything the member owns, excluding secrets and other people's data (APP-SET-12). */
async function collect(c: Container, user: AuthUser) {
  const uid = user.id;
  const [foods, acts, weights, streaks, badges, records, prefs, recaps, types] = await Promise.all([
    c.db.query.foodLogs.findMany({ where: eq(s.foodLogs.userId, uid), orderBy: [asc(s.foodLogs.date), asc(s.foodLogs.loggedAt)] }),
    c.db.query.activityLogs.findMany({ where: eq(s.activityLogs.userId, uid), orderBy: [asc(s.activityLogs.date), asc(s.activityLogs.loggedAt)] }),
    c.db.query.weightEntries.findMany({ where: eq(s.weightEntries.userId, uid), orderBy: [asc(s.weightEntries.date)] }),
    c.db.query.streakStates.findMany({ where: eq(s.streakStates.userId, uid) }),
    c.db.query.userBadges.findMany({ where: eq(s.userBadges.userId, uid) }),
    c.db.query.personalRecords.findMany({ where: eq(s.personalRecords.userId, uid) }),
    c.db.query.notificationPreferences.findMany({ where: eq(s.notificationPreferences.userId, uid) }),
    c.db.query.weeklyRecaps.findMany({ where: eq(s.weeklyRecaps.userId, uid), orderBy: [asc(s.weeklyRecaps.weekStart)] }),
    c.db.query.activityTypes.findMany(),
  ]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  return { foods: foods.filter((f) => !f.deletedAt), acts: acts.filter((a) => !a.deletedAt), weights: weights.filter((w) => !w.deletedAt), streaks, badges, records, prefs, recaps, typeName };
}

function csvCell(v: unknown): string {
  if (v == null) return '';
  const str = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
  // Neutralise spreadsheet formulas and quote anything with separators.
  const safe = /^[=+\-@\t\r]/.test(str) && typeof v !== 'number' ? `'${str}` : str;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
function csv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export async function exportMemberData(c: Container, user: AuthUser, format: 'csv' | 'json'): Promise<ExportFile> {
  await hitRateLimit(c, `export:${user.id}`, 10, 3600, 'That’s a lot of exports. Try again in a bit.');
  const { today, now } = memberClock(c, user.timezone);
  const d = await collect(c, user);
  const stamp = `clubhouse-${user.username}-${today}`;

  if (format === 'json') {
    const team = await getTeam(c, user.teamId);
    const { profile, targets } = await getProfileDto(c, user);
    const payload = {
      exportedAt: now.toISOString(),
      account: { username: user.username, displayName: user.displayName, email: user.email, timezone: user.timezone, team: team.name },
      profile,
      targets,
      notificationPreferences: d.prefs.map((p) => ({ type: p.type, enabled: p.enabled, time: p.time, days: p.days, smartTime: p.smartTime })),
      foodLogs: d.foods.map((f) => ({ id: f.id, date: f.date, mealSlot: f.mealSlot, loggedAt: f.loggedAt.toISOString(), items: f.items, totals: f.totals, aiGenerated: f.aiGenerated, note: f.note, addedLate: f.addedLate })),
      activityLogs: d.acts.map((a) => ({ id: a.id, date: a.date, loggedAt: a.loggedAt.toISOString(), type: d.typeName.get(a.typeId) ?? a.typeId, durationMin: a.durationMin, distanceKm: a.distanceKm, intensity: a.intensity, focus: a.focus, kcalBurned: Math.round(a.kcalBurned), kcalOverridden: a.kcalOverridden, note: a.note, addedLate: a.addedLate })),
      weights: d.weights.map((w) => ({ id: w.id, date: w.date, weightKg: w.weightKg, note: w.note })),
      streaks: d.streaks.map((st) => ({ kind: st.kind, current: st.current, best: st.best, status: st.status, graceLeft: st.graceLeft, history: st.history })),
      badges: d.badges.map((b) => ({ kind: b.kind, milestone: b.milestone, earnedAt: b.earnedAt.toISOString() })),
      personalRecords: d.records.map((r) => ({ record: r.record, value: r.value, unit: r.unit, achievedOn: r.achievedOn })),
      weeklyRecaps: d.recaps.map((r) => ({ weekStart: r.weekStart, highlight: r.highlight, tryNext: r.tryNext, teamFact: r.teamFact, stats: r.stats })),
    };
    return { body: strToU8(JSON.stringify(payload, null, 2)), contentType: 'application/json; charset=utf-8', filename: `${stamp}.json` };
  }

  // CSV: one file per entity, zipped (food items one row each so spreadsheets can pivot them).
  const food = csv(
    ['date', 'meal_slot', 'logged_at', 'item', 'grams', 'servings', 'serving_label', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'source', 'ai_estimate', 'note', 'log_id'],
    d.foods.flatMap((f) =>
      f.items.map((i) => [f.date, f.mealSlot, f.loggedAt.toISOString(), i.name, i.grams, i.servings, i.servingLabel, i.nutrition.kcal, i.nutrition.protein, i.nutrition.carbs, i.nutrition.fat, i.nutrition.fibre, i.source, i.aiEstimate ? 'yes' : 'no', f.note, f.id]),
    ),
  );
  const activity = csv(
    ['date', 'logged_at', 'activity', 'duration_min', 'distance_km', 'intensity', 'focus', 'kcal_burned', 'kcal_overridden', 'note', 'log_id'],
    d.acts.map((a) => [a.date, a.loggedAt.toISOString(), d.typeName.get(a.typeId) ?? '', a.durationMin, a.distanceKm, a.intensity, a.focus, a.kcalBurned, a.kcalOverridden ? 'yes' : 'no', a.note, a.id]),
  );
  const weight = csv(['date', 'weight_kg', 'note'], d.weights.map((w) => [w.date, w.weightKg, w.note]));
  const zip = zipSync({ [`${stamp}/food.csv`]: strToU8(food), [`${stamp}/activity.csv`]: strToU8(activity), [`${stamp}/weight.csv`]: strToU8(weight) }, { level: 6, mtime: now });
  return { body: zip, contentType: 'application/zip', filename: `${stamp}-csv.zip` };
}
