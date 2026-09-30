import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from '../src/client';
import { migrateUrl, migrationsFolder } from './env';

const { db, close } = createDb(migrateUrl(), { max: 1, prepare: true });
try {
  await migrate(db, { migrationsFolder });
  console.log('migrations applied');
} finally {
  await close();
}
