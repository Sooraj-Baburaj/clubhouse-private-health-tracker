import { Hono } from 'hono';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { FoodTextRequest, LocalDateStr, MealSlot } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import { fileFromForm } from '../../../application/media';
import { recognisePhoto, recogniseText } from '../../../application/recognition';
import { getSummary } from '../../../application/summary';
import { badRequest } from '../../../lib/errors';
import { currentAuth } from '../middleware/session';
import { writeLimit } from '../middleware/writeLimit';
import type { AppEnv } from '../types';
import { body, query } from '../validate';

export const aiRoutes = new Hono<AppEnv>()
  .use('/ai/*', writeLimit)
  .post('/ai/food-photo', async (ctx) => {
    const a = currentAuth(ctx);
    let form: FormData;
    try {
      form = await ctx.req.formData();
    } catch {
      throw badRequest('Send the photo as multipart form data.', 'invalid_form');
    }
    const slot = MealSlot.safeParse(form.get('slot'));
    if (!slot.success) throw badRequest('Pick a meal slot.', 'invalid_slot');
    const hintRaw = form.get('hint');
    const hint = typeof hintRaw === 'string' && hintRaw.trim() ? hintRaw.trim().slice(0, 120) : undefined;
    const clientId = z.string().uuid().safeParse(form.get('clientId'));
    const file = await fileFromForm(form);
    return ctx.json(await recognisePhoto(ctx.get('c'), a.user, file, slot.data, hint, clientId.success ? clientId.data : null));
  })
  .post('/ai/food-text', async (ctx) => {
    const a = currentAuth(ctx);
    const { text, slot } = await body(ctx, FoodTextRequest);
    return ctx.json(await recogniseText(ctx.get('c'), a.user, text, slot));
  })
  .get('/ai/summary', async (ctx) => {
    const a = currentAuth(ctx);
    const { date } = query(ctx, z.object({ date: LocalDateStr.optional() }));
    return ctx.json(await getSummary(ctx.get('c'), a.user, date));
  })
  .post('/ai/notice-seen', async (ctx) => {
    const a = currentAuth(ctx);
    const c = ctx.get('c');
    await c.db
      .update(s.profiles)
      .set({ aiOptOuts: sql`${s.profiles.aiOptOuts} || '{"noticeSeen": true}'::jsonb`, updatedAt: c.clock.now() })
      .where(eq(s.profiles.userId, a.user.id));
    return ctx.json({ ok: true });
  });
