import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env'), quiet: true });

export function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const migrateUrl = () => process.env.DATABASE_URL_MIGRATE ?? requireEnv('DATABASE_URL');
export const appUrl = () => requireEnv('DATABASE_URL');
export const migrationsFolder = resolve(here, '../drizzle');
