import { createDb } from '../src/client';
import * as s from '../src/schema';
import { seedTriggers } from '../src/seed';
import { migrateUrl } from './env';

const { db, close } = createDb(migrateUrl(), { max: 1 });
try {
  const teams = await db.select().from(s.teams);
  for (const t of teams) await seedTriggers(db, t.id);
  console.log(`starter meme triggers installed (disabled) for ${teams.length} team(s)`);
} finally {
  await close();
}
