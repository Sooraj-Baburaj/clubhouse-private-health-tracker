import { createDb } from '../src/client';
import { migrateUrl } from './env';

const url = migrateUrl();
if (!/localhost|127\.0\.0\.1/.test(url) && process.env.ALLOW_REMOTE_RESET !== '1') {
  console.error('Refusing to reset a non-local database. Set ALLOW_REMOTE_RESET=1 if you really mean it.');
  process.exit(1);
}
const { sql, close } = createDb(url, { max: 1 });
try {
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;');
  console.log('database reset (public schema dropped); run pnpm db:migrate');
} finally {
  await close();
}
