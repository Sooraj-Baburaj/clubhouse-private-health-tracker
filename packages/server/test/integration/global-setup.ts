/**
 * Integration tests run against a dedicated database (`clubhouse_test` on the docker Postgres, or TEST_DATABASE_URL in
 * CI). It is rebuilt from the migrations once per run and seeded with the static data and the food catalogue.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb, seed } from '@clubhouse/db';

const root = resolve(import.meta.dirname, '../../../..');
config({ path: resolve(root, '.env'), quiet: true });

export function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = new URL(process.env.DATABASE_URL ?? 'postgres://clubhouse:clubhouse@localhost:54329/clubhouse');
  base.pathname = '/clubhouse_test';
  return base.toString();
}

export default async function setup() {
  const url = new URL(testDatabaseUrl());
  if (!/^(localhost|127\.0\.0\.1|postgres)$/.test(url.hostname) && process.env.ALLOW_REMOTE_TEST_DB !== '1') {
    throw new Error(`Refusing to run integration tests against ${url.hostname}. Use a local database.`);
  }
  const dbName = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    const exists = await sql`select 1 from pg_database where datname = ${dbName}`;
    if (!exists.length) await sql.unsafe(`create database "${dbName}"`);
  } finally {
    await sql.end({ timeout: 5 });
  }
  const { db, sql: s, close } = createDb(url.toString(), { max: 1, prepare: true });
  try {
    await s.unsafe('drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;');
    await migrate(db, { migrationsFolder: resolve(root, 'packages/db/drizzle') });
    await seed.seedActivityTypes(db);
    await seed.seedPricing(db);
    await seed.seedFoodsFromCsv(db, resolve(root, 'packages/db/seed/foods/indian_curated.csv'), 'seed');
    await seed.seedFoodsFromCsv(db, resolve(root, 'packages/db/seed/foods/usda_generic.csv'), 'usda');
  } finally {
    await close();
  }
}
