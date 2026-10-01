import { Hono } from 'hono';
import { z } from 'zod';
import { ChatChangesQuery, ReactRequest, ReportRequest, SendMessageRequest } from '@clubhouse/contracts';
import { compress } from 'hono/compress';
import * as chat from '../../../application/chat';
import * as moments from '../../../application/memeEngine';
import { unreadCount } from '../../../application/notify';
import { currentAuth } from '../middleware/session';
import { writeLimit } from '../middleware/writeLimit';
import type { AppEnv } from '../types';
import { body, param, query } from '../validate';

export const chatRoutes = new Hono<AppEnv>()
  .use('/chat/*', writeLimit)
  .use('/moments/*', writeLimit)
  .get('/chat/messages', async (ctx) => {
    const a = currentAuth(ctx);
    const q = query(
      ctx,
      z.object({ after: z.coerce.number().int().min(0).optional(), before: z.coerce.number().int().min(0).optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }),
    );
    return ctx.json(await chat.listMessages(ctx.get('c'), a.user, q));
  })
  .use('/chat/changes', compress())
  .get('/chat/changes', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await chat.chatChanges(ctx.get('c'), a.user, query(ctx, ChatChangesQuery)));
  })
  .put('/chat/messages/:id', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await chat.sendMessage(ctx.get('c'), a.user, param(ctx, 'id'), await body(ctx, SendMessageRequest)));
  })
  .delete('/chat/messages/:id', async (ctx) => {
    const a = currentAuth(ctx);
    await chat.deleteOwnMessage(ctx.get('c'), a.user, param(ctx, 'id'));
    return ctx.json({ ok: true });
  })
  .post('/chat/messages/:id/reactions', async (ctx) => {
    const a = currentAuth(ctx);
    const { emoji, on } = await body(ctx, ReactRequest);
    await chat.react(ctx.get('c'), a.user, param(ctx, 'id'), emoji, on);
    return ctx.json({ ok: true });
  })
  .post('/chat/messages/:id/report', async (ctx) => {
    const a = currentAuth(ctx);
    const { reason } = await body(ctx, ReportRequest);
    await chat.report(ctx.get('c'), a.user, param(ctx, 'id'), reason);
    return ctx.json({ ok: true });
  })
  .post('/chat/read', async (ctx) => {
    const a = currentAuth(ctx);
    const { seq } = await body(ctx, z.object({ seq: z.number().int().min(0) }));
    await chat.markRead(ctx.get('c'), a.user, seq);
    return ctx.json({ ok: true });
  })
  .post('/chat/presence', async (ctx) => {
    const a = currentAuth(ctx);
    await chat.presence(ctx.get('c'), a.user);
    return ctx.json({ ok: true });
  })
  .get('/chat/members', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await chat.chatMembers(ctx.get('c'), a.user));
  })
  .get('/chat/memes', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await chat.memeLibrary(ctx.get('c'), a.user.teamId));
  })
  .post('/chat/memes/suggest', async (ctx) => {
    const a = currentAuth(ctx);
    const { imageId, caption } = await body(ctx, z.object({ imageId: z.string().uuid(), caption: z.string().trim().min(1).max(140) }));
    await chat.suggestMeme(ctx.get('c'), a.user, imageId, caption);
    return ctx.json({ ok: true });
  })
  .get('/chat/unread', async (ctx) => {
    const a = currentAuth(ctx);
    const c = ctx.get('c');
    const [chatN, inbox] = await Promise.all([chat.unreadChatCount(c, a.user), unreadCount(c, a.user.id)]);
    return ctx.json({ chat: chatN, inbox });
  })
  .post('/moments/:fireId/dismiss', async (ctx) => {
    const a = currentAuth(ctx);
    await moments.dismissMoment(ctx.get('c'), a.user, param(ctx, 'fireId'));
    return ctx.json({ ok: true });
  })
  .post('/moments/:fireId/react', async (ctx) => {
    const a = currentAuth(ctx);
    await moments.reactToMoment(ctx.get('c'), a.user, param(ctx, 'fireId'));
    return ctx.json({ ok: true });
  })
  .post('/moments/:fireId/share', async (ctx) => {
    const a = currentAuth(ctx);
    const r = await moments.shareMoment(ctx.get('c'), a.user, param(ctx, 'fireId'));
    return ctx.json(r);
  });
