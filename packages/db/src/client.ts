import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Sql = postgres.Sql;

export interface DbHandle {
  db: Db;
  sql: Sql;
  close: () => Promise<void>;
}

/**
 * One small pool per process/function instance. `prepare: false` is required behind the Supabase
 * transaction pooler (Supavisor, port 6543), which cannot hold prepared statements.
 */
export function createDb(url: string, opts: { max?: number; prepare?: boolean } = {}): DbHandle {
  const sql = postgres(url, {
    max: opts.max ?? 4,
    prepare: opts.prepare ?? false,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: /sslmode=require|supabase\.(co|com)/.test(url) ? 'require' : undefined,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema, casing: undefined });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}
