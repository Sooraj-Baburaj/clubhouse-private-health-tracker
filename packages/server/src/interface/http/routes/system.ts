import { Hono } from 'hono';
import { z } from 'zod';
import { schema as s } from '@clubhouse/db';
import { count } from 'drizzle-orm';
import { NewPassword } from '@clubhouse/contracts';
import { seed } from '@clubhouse/db';
const { ensureTeam, provisionMember, seedActivityTypes, seedPricing, seedTriggers } = seed;
import { safeEqual } from '../../../lib/crypto';
import { AppError, forbidden, notFound } from '../../../lib/errors';
import type { AppEnv } from '../types';
import { body } from '../validate';

export const systemRoutes = new Hono<AppEnv>()
  .get('/health', async (ctx) => {
    const c = ctx.get('c');
    const t0 = performance.now();
    await c.sql`select 1`;
    return ctx.json({ ok: true, dbRttMs: Math.round(performance.now() - t0), version: c.env.APP_VERSION, time: c.clock.now().toISOString() });
  })
  .get('/version', (ctx) => ctx.json({ version: ctx.get('c').env.APP_VERSION }))
  /** Dev storage: serves files written by the local-disk adapter behind an HMAC signature. */
  .get('/media/local/*', async (ctx) => {
    const c = ctx.get('c');
    if (!c.localStorage) throw notFound();
    const key = decodeURIComponent(ctx.req.path.replace(/^\/api\/media\/local\//, ''));
    const exp = Number(ctx.req.query('exp'));
    const sig = ctx.req.query('sig') ?? '';
    if (!c.localStorage.verify(key, exp, sig)) throw forbidden('Link expired.');
    const data = await c.localStorage.get(key);
    if (!data) throw notFound();
    return new Response(new Uint8Array(data), { headers: { 'content-type': await c.localStorage.contentType(key), 'cache-control': 'private, max-age=86400' } });
  })
  /**
   * One-time bootstrap for deployments without shell access: creates the team and the first Super Admin
   * (SYS-ROLE-01). Only works while the database has no users and with the SETUP_TOKEN.
   */
  .post('/setup', async (ctx) => {
    const c = ctx.get('c');
    const token = ctx.req.header('x-setup-token') ?? '';
    if (!c.env.SETUP_TOKEN || !safeEqual(token, c.env.SETUP_TOKEN)) throw forbidden('Invalid setup token.');
    const [n] = await c.db.select({ n: count() }).from(s.users);
    if ((n?.n ?? 0) > 0) throw new AppError(409, 'already_setup', 'Setup has already been completed.');
    const input = await body(
      ctx,
      z.object({
        teamName: z.string().min(1).max(60),
        timezone: z.string().default('Asia/Kolkata'),
        username: z.string().regex(/^[a-z0-9._-]{3,30}$/),
        displayName: z.string().min(1).max(60),
        email: z.string().email().nullable().optional(),
        password: NewPassword,
      }),
    );
    const team = await ensureTeam(c.db, { name: input.teamName, timezone: input.timezone });
    await seedActivityTypes(c.db);
    await seedPricing(c.db);
    await seedTriggers(c.db, team.id);
    const user = await provisionMember(c.db, {
      teamId: team.id,
      username: input.username,
      displayName: input.displayName,
      email: input.email ?? null,
      role: 'super_admin',
      passwordHash: await c.hasher.hash(input.password),
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
    });
    return ctx.json({ ok: true, teamId: team.id, userId: user.id });
  });
