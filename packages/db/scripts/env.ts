import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env'), quiet: true });

export function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

/** An unset GitHub secret arrives as '', which postgres.js would treat as localhost — so empty counts as missing. */
export function migrateUrl(): string {
  const url = process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;
  if (!url) throw new Error('Missing env DATABASE_URL_MIGRATE (or DATABASE_URL). In GitHub Actions, add it as a secret of the "production" environment.');
  return url;
}
export const appUrl = () => requireEnv('DATABASE_URL');
export const migrationsFolder = resolve(here, '../drizzle');
