import { Hono } from 'hono';
import { ChangePasswordRequest, LoginRequest, ReauthRequest, TotpCodeRequest } from '@clubhouse/contracts';
import * as auth from '../../../application/auth';
import { revokeAllSessions } from '../../../application/sessions';
import { clearSessionCookie, meta, setSessionCookie } from '../cookies';
import { currentAuth } from '../middleware/session';
import type { AppEnv } from '../types';
import { body, param } from '../validate';

export const authRoutes = new Hono<AppEnv>()
  .post('/login', async (ctx) => {
    const input = await body(ctx, LoginRequest);
    const { token, response } = await auth.login(ctx.get('c'), input, meta(ctx));
    setSessionCookie(ctx, token);
    return ctx.json(response);
  })
  .post('/logout', async (ctx) => {
    const a = ctx.get('auth');
    if (a) await auth.logout(ctx.get('c'), a.session.id);
    clearSessionCookie(ctx);
    return ctx.json({ ok: true });
  })
  .post('/logout-all', async (ctx) => {
    const a = currentAuth(ctx, { allowMustChange: true });
    await revokeAllSessions(ctx.get('c'), a.user.id);
    clearSessionCookie(ctx);
    return ctx.json({ ok: true });
  })
  .post('/change-password', async (ctx) => {
    const a = currentAuth(ctx, { allowMustChange: true });
    const input = await body(ctx, ChangePasswordRequest);
    await auth.changePassword(ctx.get('c'), a.user.id, a.session.id, input.currentPassword, input.newPassword, meta(ctx));
    return ctx.json({ ok: true });
  })
  .post('/totp/verify', async (ctx) => {
    const a = currentAuth(ctx, { allowMfaPending: true, allowMustChange: true });
    const { code } = await body(ctx, TotpCodeRequest);
    await auth.verifyMfa(ctx.get('c'), a.user.id, a.session.id, code);
    return ctx.json({ ok: true });
  })
  .post('/totp/enrol', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await auth.enrolTotp(ctx.get('c'), a.user.id));
  })
  .post('/totp/confirm', async (ctx) => {
    const a = currentAuth(ctx);
    const { code } = await body(ctx, TotpCodeRequest);
    return ctx.json(await auth.confirmTotp(ctx.get('c'), a.user.id, a.session.id, code, meta(ctx)));
  })
  .post('/totp/disable', async (ctx) => {
    const a = currentAuth(ctx);
    const { code } = await body(ctx, TotpCodeRequest);
    await auth.disableTotp(ctx.get('c'), a.user.id, code, meta(ctx));
    return ctx.json({ ok: true });
  })
  .post('/reauth', async (ctx) => {
    const a = currentAuth(ctx, { allowMfaPending: true });
    const input = await body(ctx, ReauthRequest);
    await auth.reauth(ctx.get('c'), a.user.id, a.session.id, input.password, input.code);
    return ctx.json({ ok: true });
  })
  .get('/sessions', async (ctx) => {
    const a = currentAuth(ctx, { allowMustChange: true });
    return ctx.json(await auth.listSessions(ctx.get('c'), a.user.id, a.session.id));
  })
  .delete('/sessions/:id', async (ctx) => {
    const a = currentAuth(ctx, { allowMustChange: true });
    await auth.revokeOwnSession(ctx.get('c'), a.user.id, param(ctx, 'id'));
    return ctx.json({ ok: true });
  });
