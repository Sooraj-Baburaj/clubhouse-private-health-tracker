import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { SESSION_DAYS } from '../../application/sessions';
import type { AppEnv } from './types';

export function setSessionCookie(ctx: Context<AppEnv>, token: string) {
  const c = ctx.get('c');
  setCookie(ctx, c.env.cookieName, token, {
    httpOnly: true,
    secure: c.env.secureCookies,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSessionCookie(ctx: Context<AppEnv>) {
  const c = ctx.get('c');
  deleteCookie(ctx, c.env.cookieName, { path: '/', secure: c.env.secureCookies });
}

export const meta = (ctx: Context<AppEnv>) => ({ ip: ctx.get('ip'), userAgent: ctx.get('userAgent') });
