import { createAiGateway, type AiGateway } from '@clubhouse/ai-gateway';
import { createDb, type Db, type Sql } from '@clubhouse/db';
import type { Broadcaster, Clock, EmailSender, ImageProcessor, PasswordHasher, PushSender, Storage } from './application/ports';
import { env as loadEnv, type Env } from './config/env';
import { SystemClock } from './infrastructure/clock';
import { ResendEmailSender } from './infrastructure/email/resend';
import { Passwords } from './infrastructure/auth/passwords';
import { SharpImageProcessor } from './infrastructure/media/sharpProcessor';
import { WebPushSender } from './infrastructure/push/webPush';
import { SupabaseBroadcaster } from './infrastructure/realtime/broadcast';
import { DrizzleAiStore } from './infrastructure/repos/aiStore';
import { LocalDiskStorage } from './infrastructure/storage/local';
import { S3Storage } from './infrastructure/storage/s3';

export interface Container {
  env: Env;
  db: Db;
  sql: Sql;
  storage: Storage;
  localStorage: LocalDiskStorage | null;
  push: PushSender;
  email: EmailSender;
  broadcast: Broadcaster;
  hasher: PasswordHasher;
  clock: Clock;
  images: ImageProcessor;
  ai: AiGateway;
  trgmSchema: () => Promise<string>;
}

let container: Container | null = null;

export function buildContainer(e: Env, overrides: Partial<Container> = {}): Container {
  const { db, sql } = overrides.db && overrides.sql ? { db: overrides.db, sql: overrides.sql } : createDb(e.DATABASE_URL, { max: e.isProd ? 4 : 8 });
  let localStorage: LocalDiskStorage | null = null;
  let storage: Storage;
  if (overrides.storage) storage = overrides.storage;
  else if (e.STORAGE_DRIVER === 's3') {
    if (!e.S3_ENDPOINT || !e.S3_ACCESS_KEY || !e.S3_SECRET_KEY) throw new Error('STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY');
    storage = new S3Storage(e.S3_ENDPOINT, e.S3_REGION, e.S3_BUCKET, e.S3_ACCESS_KEY, e.S3_SECRET_KEY);
  } else {
    localStorage = new LocalDiskStorage(e.LOCAL_STORAGE_DIR, e.SESSION_PEPPER);
    storage = localStorage;
  }
  const clock = overrides.clock ?? new SystemClock();
  let trgm: Promise<string> | null = null;
  const c: Container = {
    env: e,
    db,
    sql,
    storage,
    localStorage: overrides.localStorage ?? localStorage,
    push: overrides.push ?? new WebPushSender(e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY, e.VAPID_SUBJECT),
    email: overrides.email ?? new ResendEmailSender(e.RESEND_API_KEY, e.EMAIL_FROM),
    broadcast: overrides.broadcast ?? new SupabaseBroadcaster(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, e.REALTIME_ENABLED),
    hasher: overrides.hasher ?? new Passwords(e.PASSWORD_HASHER),
    clock,
    images: overrides.images ?? new SharpImageProcessor(),
    ai:
      overrides.ai ??
      createAiGateway({ store: new DrizzleAiStore(db), mode: e.AI_MODE, apiKey: e.ANTHROPIC_API_KEY, fallbacks: e.AI_FALLBACKS, now: () => clock.now() }),
    trgmSchema: () => {
      trgm ??= sql<{ nspname: string }[]>`select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm'`.then(
        (r) => r[0]?.nspname ?? 'public',
      );
      return trgm;
    },
  };
  return c;
}

export function getContainer(): Container {
  if (!container) container = buildContainer(loadEnv());
  return container;
}

export function setContainer(c: Container | null) {
  container = c;
}
