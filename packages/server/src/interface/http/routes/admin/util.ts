import type { Context } from 'hono';
import type { Actor } from '../../../../application/admin/shared';
import { currentAuth } from '../../middleware/session';
import type { AppEnv } from '../../types';

/** The signed-in admin plus request metadata for the audit log. */
export function actor(ctx: Context<AppEnv>): Actor {
  const a = currentAuth(ctx);
  return { user: a.user, sessionId: a.session.id, ip: ctx.get('ip'), userAgent: ctx.get('userAgent') };
}

export function csvResponse(ctx: Context<AppEnv>, csv: string, filename: string) {
  return ctx.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"` });
}

export const OK = { ok: true as const };
