import { Hono } from 'hono';
import { z } from 'zod';
import { fileFromForm, IMAGE_KINDS, storeImage, uploadResponse } from '../../../application/media';
import { forbidden } from '../../../lib/errors';
import { ROLE_RANK } from '@clubhouse/contracts';
import { currentAuth } from '../middleware/session';
import type { AppEnv } from '../types';
import { badRequest } from '../../../lib/errors';

export const mediaRoutes = new Hono<AppEnv>().post('/media', async (ctx) => {
  const a = currentAuth(ctx);
  const c = ctx.get('c');
  let form: FormData;
  try {
    form = await ctx.req.formData();
  } catch {
    throw badRequest('Send the image as multipart form data.', 'invalid_form');
  }
  const kind = z.enum(IMAGE_KINDS).safeParse(form.get('kind') ?? 'food');
  if (!kind.success) throw badRequest('Unknown image kind.', 'invalid_kind');
  if ((kind.data === 'logo' || kind.data === 'diet') && ROLE_RANK[a.user.role] < ROLE_RANK.admin) throw forbidden();
  const clientId = z.string().uuid().safeParse(form.get('clientId'));
  const file = await fileFromForm(form);
  const { row } = await storeImage(c, a.user, file, kind.data, clientId.success ? clientId.data : null);
  return ctx.json(await uploadResponse(c, row), 201);
});
