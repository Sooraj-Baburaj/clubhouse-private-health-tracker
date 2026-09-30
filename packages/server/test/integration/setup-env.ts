// Runs in every integration test file before imports: point the app at the test database with deterministic adapters.
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { testDatabaseUrl } from './global-setup';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.AI_MODE = 'mock';
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_STORAGE_DIR = resolve(import.meta.dirname, '../../../../.data/test-storage');
process.env.REALTIME_ENABLED = 'false';
process.env.SESSION_PEPPER ??= 'test-pepper-0123456789abcdef';
process.env.TOTP_ENC_KEY ??= 'test-totp-key-0123456789abcdef';
process.env.CRON_SECRET = 'test-cron-secret-0123456789';
process.env.PASSWORD_HASHER = 'argon2';
