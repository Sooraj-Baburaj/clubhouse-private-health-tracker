import { Hono } from 'hono';
import { z } from 'zod';
import { NotificationPrefUpdate, PushSubscribeRequest, SnoozeRequest } from '@clubhouse/contracts';
import * as inbox from '../../../application/inbox';
import * as push from '../../../application/pushDevices';
import { badRequest } from '../../../lib/errors';
import { currentAuth } from '../middleware/session';
import type { AppEnv } from '../types';
import { body, param, query } from '../validate';

const ReadRequest = z.object({ ids: z.union([z.literal('all'), z.array(z.string().uuid()).max(200)]) });

/** Inbox, notification preferences, service-worker actions and push devices (SYS-NOTIF, APP-SET-06). */
export const notificationRoutes = new Hono<AppEnv>()
  .get('/inbox', async (ctx) => {
    const a = currentAuth(ctx);
    const { cursor } = query(ctx, z.object({ cursor: z.string().max(200).optional() }));
    return ctx.json(await inbox.listInbox(ctx.get('c'), a.user, cursor));
  })
  .post('/inbox/read', async (ctx) => {
    const a = currentAuth(ctx);
    const { ids } = await body(ctx, ReadRequest);
    await inbox.markRead(ctx.get('c'), a.user, ids);
    return ctx.json({ ok: true as const });
  })
  .get('/notifications/preferences', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await inbox.getPreferences(ctx.get('c'), a.user));
  })
  .put('/notifications/preferences', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await inbox.updatePreferences(ctx.get('c'), a.user, await body(ctx, NotificationPrefUpdate)));
  })
  .post('/notifications/:id/snooze', async (ctx) => {
    const a = currentAuth(ctx);
    const raw = await ctx.req.text();
    let input: unknown;
    try {
      input = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      throw badRequest('Send a JSON body.', 'invalid_json');
    }
    const parsed = SnoozeRequest.safeParse(input);
    if (!parsed.success) throw badRequest('Snooze for 10 minutes to 24 hours.', 'validation', { minutes: '10–1440' });
    await inbox.snooze(ctx.get('c'), a.user, param(ctx, 'id'), parsed.data.minutes);
    return ctx.json({ ok: true as const });
  })
  .post('/notifications/:id/done', async (ctx) => {
    const a = currentAuth(ctx);
    await inbox.done(ctx.get('c'), a.user, param(ctx, 'id'));
    return ctx.json({ ok: true as const });
  })
  .post('/push/subscriptions', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await push.subscribe(ctx.get('c'), a, await body(ctx, PushSubscribeRequest), ctx.get('userAgent')));
  })
  .delete('/push/subscriptions', async (ctx) => {
    const a = currentAuth(ctx);
    const { endpoint } = query(ctx, z.object({ endpoint: z.string().url().max(1000) }));
    await push.unsubscribe(ctx.get('c'), a.user.id, endpoint);
    return ctx.json({ ok: true as const });
  })
  .get('/push/devices', async (ctx) => {
    const a = currentAuth(ctx);
    const { endpoint } = query(ctx, z.object({ endpoint: z.string().max(1000).optional() }));
    return ctx.json(await push.listDevices(ctx.get('c'), a, endpoint || undefined));
  })
  .delete('/push/devices/:id', async (ctx) => {
    const a = currentAuth(ctx);
    await push.removeDevice(ctx.get('c'), a.user.id, param(ctx, 'id'));
    return ctx.json({ ok: true as const });
  })
  .post('/push/test', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await push.sendTest(ctx.get('c'), a.user.id));
  });
