import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname, quiet: true });
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL ?? 'postgres://clubhouse:clubhouse@localhost:54329/clubhouse' },
  strict: true,
  verbose: false,
});
