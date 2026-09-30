import { createDb } from '../src/client';
import { seedActivityTypes, seedPricing } from '../src/seed';
import { migrateUrl } from './env';

const { db, close } = createDb(migrateUrl(), { max: 1 });
try {
  const n = await seedActivityTypes(db);
  await seedPricing(db);
  console.log(`static seeds applied (${n} new activity types, pricing rows ensured)`);
} finally {
  await close();
}
