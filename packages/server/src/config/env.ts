import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: z.string().default(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  EXTRA_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:4173,http://localhost:4174'),
  SESSION_PEPPER: z.string().min(16),
  TOTP_ENC_KEY: z.string().min(16),
  CRON_SECRET: z.string().min(16),
  SETUP_TOKEN: z.string().optional(),
  PASSWORD_HASHER: z.enum(['argon2', 'bcrypt']).default('argon2'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('.data/storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('clubhouse-media'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  REALTIME_ENABLED: bool.default(false),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODE: z.enum(['live', 'mock', 'off']).default('mock'),
  AI_FALLBACKS: bool.default(true),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Clubhouse <clubhouse@example.com>'),
  ADMIN_ALERT_EMAILS: z.string().default(''),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
export type Env = z.infer<typeof Env> & { isProd: boolean; allowedOrigins: string[]; cookieName: string; secureCookies: boolean };

let cached: Env | null = null;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';
  const allowedOrigins = [e.APP_ORIGIN, ...(isProd ? [] : e.EXTRA_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean))];
  return { ...e, isProd, allowedOrigins, secureCookies: isProd, cookieName: isProd ? '__Host-ch_session' : 'ch_session' };
}

export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

export function setEnvForTests(e: Env) {
  cached = e;
}
