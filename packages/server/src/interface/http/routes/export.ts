import { Hono } from 'hono';
import { z } from 'zod';
import { exportMemberData } from '../../../application/exportData';
import { currentAuth } from '../middleware/session';
import type { AppEnv } from '../types';
import { query } from '../validate';

/** APP-SET-12: "Export my data" — CSV (zip of food, activity, weight) or JSON, as a download. */
export const exportRoutes = new Hono<AppEnv>().get('/profile/export', async (ctx) => {
  const a = currentAuth(ctx);
  const { format } = query(ctx, z.object({ format: z.enum(['csv', 'json']).default('json') }));
  const file = await exportMemberData(ctx.get('c'), a.user, format);
  return new Response(file.body, {
    status: 200,
    headers: {
      'content-type': file.contentType,
      'content-disposition': `attachment; filename="${file.filename}"`,
      'content-length': String(file.body.byteLength),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});
