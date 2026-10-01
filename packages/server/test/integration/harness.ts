import { randomUUID } from 'node:crypto';
import type { Role } from '@clubhouse/contracts';
import { seed } from '@clubhouse/db';
import { createApp } from '../../src/app';
import type { EmailSender, PushOutcome, PushPayload, PushSender, PushSubscriptionRef } from '../../src/application/ports';
import { loadEnv } from '../../src/config/env';
import { buildContainer, type Container } from '../../src/container';
import { FixedClock } from '../../src/infrastructure/clock';
import { NoopBroadcaster } from '../../src/infrastructure/realtime/broadcast';

export class FakePush implements PushSender {
  readonly enabled = true;
  sent: { endpoint: string; payload: PushPayload }[] = [];
  gone = new Set<string>();
  async send(sub: PushSubscriptionRef, payload: PushPayload): Promise<PushOutcome> {
    if (this.gone.has(sub.endpoint)) return { ok: false, gone: true, status: 410, error: 'gone' };
    this.sent.push({ endpoint: sub.endpoint, payload });
    return { ok: true };
  }
}

export class FakeEmail implements EmailSender {
  readonly enabled = true;
  sent: { to: string[]; subject: string; text: string }[] = [];
  async send(to: string[], subject: string, text: string) {
    this.sent.push({ to, subject, text });
  }
}

export interface Harness {
  c: Container;
  clock: FixedClock;
  push: FakePush;
  email: FakeEmail;
  app: ReturnType<typeof createApp>;
  teamId: string;
  createUser: (opts?: { role?: Role; username?: string; password?: string; onboard?: boolean; mustChange?: boolean }) => Promise<{ id: string; username: string; password: string }>;
  login: (username: string, password: string) => Promise<Client>;
  close: () => Promise<void>;
}

export interface Client {
  cookie: string;
  req: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; json: any }>;
}

/** A fresh team, container and app for one test file (tests share the database but never a team). */
export async function createHarness(now = new Date('2026-09-30T06:30:00Z')): Promise<Harness> {
  const clock = new FixedClock(now);
  const push = new FakePush();
  const email = new FakeEmail();
  const c = buildContainer(loadEnv(), { clock, push, email, broadcast: new NoopBroadcaster() });
  const team = await seed.ensureTeam(c.db, { name: `Test ${randomUUID().slice(0, 8)}`, timezone: 'Asia/Kolkata' });
  await seed.seedTriggers(c.db, team.id);
  const app = createApp(() => c);

  const client = (cookie: string): Client => ({
    cookie,
    async req(method, path, body, headers = {}) {
      const res = await app.request(`/api${path}`, {
        method,
        headers: { 'x-clubhouse-client': 'web', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: res.status, json };
    },
  });

  let n = 0;
  const h0 = {
    c,
    clock,
    push,
    email,
    app,
    teamId: team.id,
    async createUser(opts: NonNullable<Parameters<Harness['createUser']>[0]> = {}) {
      const username = opts.username ?? `u${Date.now().toString(36)}${n++}`;
      const password = opts.password ?? 'correct-horse-battery-1';
      const user = await seed.provisionMember(c.db, {
        teamId: team.id,
        username,
        displayName: `User ${username}`,
        role: opts.role ?? 'member',
        passwordHash: await c.hasher.hash(password),
        mustChangePassword: opts.mustChange ?? false,
        tempPasswordExpiresAt: opts.mustChange ? new Date(clock.now().getTime() + 7 * 86400_000) : null,
      });
      if (opts.onboard !== false && !opts.mustChange) {
        const cl = await login(username, password);
        const r = await cl.req('POST', '/profile/onboarding', { units: 'metric', heightCm: 170, weightKg: 72, dob: '1994-03-12', sex: 'female', activityLevel: 'moderate', goalType: 'lose', paceKgWeek: 0.5, targetWeightKg: 65, timezone: 'Asia/Kolkata' });
        if (r.status !== 200) throw new Error(`onboarding failed: ${JSON.stringify(r.json)}`);
      }
      return { id: user.id, username, password };
    },
    login,
  };

  async function login(username: string, password: string): Promise<Client> {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'x-clubhouse-client': 'web', 'content-type': 'application/json' }, body: JSON.stringify({ login: username, password }) });
      const setCookie = res.headers.get('set-cookie') ?? '';
      const cookie = setCookie.split(';')[0] ?? '';
      if (res.status !== 200) throw Object.assign(new Error(`login failed ${res.status}`), { status: res.status, body: await res.json() });
      return client(cookie);
  }
  return {
    ...h0,
    async close() {
      // The test database is rebuilt on every run, so teams are left in place.
      await c.sql.end({ timeout: 5 });
    },
  };
}

export const uuid = () => randomUUID();
