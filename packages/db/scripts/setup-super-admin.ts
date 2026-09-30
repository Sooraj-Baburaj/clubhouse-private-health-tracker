/**
 * First-run setup (SYS-ROLE-01): creates the team and the first Super Admin, then installs static seeds.
 * Usage: pnpm setup:super-admin --username aditi --name "Aditi Rao" [--email a@b.c] [--team Clubhouse] [--timezone Asia/Kolkata]
 * Prints a 12-character temporary password once; it must be changed at first sign-in.
 */
import { hash } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { createDb } from '../src/client';
import * as s from '../src/schema';
import { ensureTeam, provisionMember, seedActivityTypes, seedPricing, seedTriggers } from '../src/seed';
import { migrateUrl } from './env';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const username = arg('username');
const displayName = arg('name');
if (!username || !displayName) {
  console.error('Usage: pnpm setup:super-admin --username <username> --name "<Display name>" [--email <email>] [--team <name>] [--timezone <IANA>]');
  process.exit(1);
}
const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let pw = '';
for (let i = 0; i < 12; i++) pw += alphabet[randomInt(alphabet.length)];
const temp = `${pw.slice(0, 4)}-${pw.slice(4, 8)}-${pw.slice(8)}`;

const { db, close } = createDb(migrateUrl(), { max: 1 });
try {
  const team = await ensureTeam(db, { name: arg('team', 'Clubhouse')!, timezone: arg('timezone', 'Asia/Kolkata')! });
  await seedActivityTypes(db);
  await seedPricing(db);
  await seedTriggers(db, team.id);
  const [supers] = await db.select({ n: count() }).from(s.users).where(eq(s.users.role, 'super_admin'));
  if ((supers?.n ?? 0) > 0 && !process.argv.includes('--force-new')) {
    console.error('A Super Admin already exists. Pass --force-new to add another.');
    process.exit(1);
  }
  const user = await provisionMember(db, {
    teamId: team.id,
    username,
    displayName,
    email: arg('email') ?? null,
    role: 'super_admin',
    passwordHash: await hash(temp, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
    mustChangePassword: true,
    tempPasswordExpiresAt: new Date(Date.now() + 7 * 86400_000),
  });
  console.log(`\nSuper Admin created: ${user.username} (team "${team.name}")`);
  console.log(`Temporary password (shown once, expires in 7 days): ${temp}\n`);
} finally {
  await close();
}
