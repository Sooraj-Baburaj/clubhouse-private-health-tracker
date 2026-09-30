import { Hono } from 'hono';
import { z } from 'zod';
import { AnnouncementRequest, ClearChatRequest, IsoDateTime, KeywordsRequest, MuteRequest, ReportResolveRequest } from '@clubhouse/contracts';
import * as chat from '../../../../application/admin/chat';
import type { AppEnv } from '../../types';
import { body, param, query } from '../../validate';
import { actor, OK } from './util';

const DateOrIso = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'Use a date or date-time');
const ListQuery = z.object({
  q: z.string().max(100).optional(),
  userId: z.string().uuid().optional(),
  from: DateOrIso.optional(),
  to: DateOrIso.optional(),
  reported: z.literal('1').optional(),
  before: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const chatRoutes = new Hono<AppEnv>()
  .get('/chat/messages', async (ctx) => ctx.json(await chat.listMessages(ctx.get('c'), actor(ctx), query(ctx, ListQuery))))
  .post('/chat/messages/:id/pin', async (ctx) => {
    const { on } = await body(ctx, z.object({ on: z.boolean() }));
    await chat.pin(ctx.get('c'), actor(ctx), param(ctx, 'id'), on);
    return ctx.json(OK);
  })
  .delete('/chat/messages/:id', async (ctx) => {
    await chat.deleteMessage(ctx.get('c'), actor(ctx), param(ctx, 'id'));
    return ctx.json(OK);
  })
  .post('/chat/announcements', async (ctx) => ctx.json(await chat.announce(ctx.get('c'), actor(ctx), await body(ctx, AnnouncementRequest))))
  .get('/chat/announcements', async (ctx) => ctx.json(await chat.listAnnouncements(ctx.get('c'), actor(ctx))))
  .post('/chat/clear/preview', async (ctx) => {
    const { from, to } = await body(ctx, z.object({ from: IsoDateTime, to: IsoDateTime }));
    return ctx.json(await chat.clearPreview(ctx.get('c'), actor(ctx), from, to));
  })
  .post('/chat/clear', async (ctx) => ctx.json(await chat.clearChat(ctx.get('c'), actor(ctx), await body(ctx, ClearChatRequest))))
  .get('/chat/reports', async (ctx) => ctx.json(await chat.reports(ctx.get('c'), actor(ctx))))
  .post('/chat/reports/:id', async (ctx) => {
    await chat.resolveReport(ctx.get('c'), actor(ctx), param(ctx, 'id'), await body(ctx, ReportResolveRequest));
    return ctx.json(OK);
  })
  .get('/chat/mutes', async (ctx) => ctx.json(await chat.mutes(ctx.get('c'), actor(ctx))))
  .post('/chat/mutes', async (ctx) => {
    await chat.mute(ctx.get('c'), actor(ctx), await body(ctx, MuteRequest));
    return ctx.json(OK);
  })
  .delete('/chat/mutes/:userId', async (ctx) => {
    await chat.unmute(ctx.get('c'), actor(ctx), param(ctx, 'userId'));
    return ctx.json(OK);
  })
  .get('/chat/keywords', async (ctx) => ctx.json(await chat.keywords(ctx.get('c'), actor(ctx))))
  .put('/chat/keywords', async (ctx) => {
    const { keywords } = await body(ctx, KeywordsRequest);
    return ctx.json(await chat.setKeywords(ctx.get('c'), actor(ctx), keywords));
  });
