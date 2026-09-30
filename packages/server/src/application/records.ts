import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { PersonalRecord } from '@clubhouse/contracts';
import { addDays, weekStartOf } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';

const DISTANCE_RECORDS: Record<string, PersonalRecord> = { running: 'longest_run', swimming: 'longest_swim', cycling: 'longest_ride' };

async function upsertRecord(c: Container, userId: string, record: PersonalRecord, value: number, unit: string, date: string, refId: string | null): Promise<boolean> {
  const cur = await c.db.query.personalRecords.findFirst({ where: and(eq(s.personalRecords.userId, userId), eq(s.personalRecords.record, record)) });
  if (cur && cur.value >= value) return false;
  await c.db
    .insert(s.personalRecords)
    .values({ userId, record, value, unit, achievedOn: date, refId })
    .onConflictDoUpdate({ target: [s.personalRecords.userId, s.personalRecords.record], set: { value, unit, achievedOn: date, refId, updatedAt: c.clock.now() } });
  // The very first value is a baseline, not a "new best" worth celebrating.
  return !!cur;
}

/** APP-PROG-05 personal records: longest run/swim/ride, most sessions in a week, longest streak. */
export async function checkActivityRecords(c: Container, userId: string, log: typeof s.activityLogs.$inferSelect, typeKey: string): Promise<PersonalRecord[]> {
  const out: PersonalRecord[] = [];
  const rec = DISTANCE_RECORDS[typeKey];
  if (rec && log.distanceKm && log.distanceKm > 0 && (await upsertRecord(c, userId, rec, log.distanceKm, 'km', log.date, log.id))) out.push(rec);
  const ws = weekStartOf(log.date);
  const [r] = await c.db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.activityLogs)
    .where(and(eq(s.activityLogs.userId, userId), gte(s.activityLogs.date, ws), lte(s.activityLogs.date, addDays(ws, 6)), isNull(s.activityLogs.deletedAt)));
  if ((r?.n ?? 0) > 0 && (await upsertRecord(c, userId, 'most_sessions_week', r!.n, 'sessions', log.date, null))) out.push('most_sessions_week');
  return out;
}

export async function checkStreakRecord(c: Container, userId: string, best: number, date: string): Promise<PersonalRecord[]> {
  if (best < 3) return [];
  return (await upsertRecord(c, userId, 'longest_streak', best, 'days', date, null)) ? ['longest_streak'] : [];
}
