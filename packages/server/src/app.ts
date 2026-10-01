import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { getContainer, type Container } from './container';
import { AppError } from './lib/errors';
import { log } from './lib/log';
import { csrfMiddleware, sessionMiddleware } from './interface/http/middleware/session';
import { authRoutes } from './interface/http/routes/auth';
import { meRoutes } from './interface/http/routes/me';
import { systemRoutes } from './interface/http/routes/system';
import type { AppEnv } from './interface/http/types';
import { registerFeatureRoutes } from './interface/http/routes';

export function createApp(getC: () => Container = getContainer) {
  const app = new Hono<AppEnv>().basePath('/api');

  app.use('*', async (ctx, next) => {
    const started = performance.now();
    const requestId = ctx.req.header('x-request-id') ?? randomUUID();
    ctx.set('requestId', requestId);
    ctx.set('c', getC());
    // Vercel sets x-forwarded-for; locally (node server, Vite proxy) fall back to the socket's peer address.
    const fwd = ctx.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    let peer: string | undefined;
    try {
      peer = (ctx.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;
    } catch {
      peer = undefined;
    }
    ctx.set('ip', fwd || ctx.req.header('x-real-ip') || peer || '0.0.0.0');
    ctx.set('userAgent', ctx.req.header('user-agent') ?? '');
    await next();
    ctx.header('x-request-id', requestId);
    ctx.header('cache-control', ctx.res.headers.get('cache-control') ?? 'no-store');
    const ms = Math.round(performance.now() - started);
    const status = ctx.res.status;
    if (!ctx.req.path.startsWith('/api/health')) log.info('http', { requestId, method: ctx.req.method, path: ctx.req.path, status, ms, user: ctx.get('auth')?.user.id });
  });

  app.onError((err, ctx) => {
    const requestId = ctx.get('requestId');
    if (err instanceof AppError) {
      for (const [k, v] of Object.entries(err.headers ?? {})) ctx.header(k, v);
      return ctx.json({ type: 'about:blank', title: err.message, status: err.status, code: err.code, fields: err.fields, requestId }, err.status);
    }
    log.error('http.unhandled', { requestId, path: ctx.req.path, error: (err as Error).message.slice(0, 300), cause: ((err as Error).cause as Error | undefined)?.message, stack: (err as Error).stack?.split('\n').slice(0, 6).join(' | ') });
    return ctx.json({ type: 'about:blank', title: 'Something went wrong on our side. Please try again.', status: 500, code: 'internal', requestId }, 500);
  });

  app.notFound((ctx) => ctx.json({ type: 'about:blank', title: 'Not found.', status: 404, code: 'not_found' }, 404));

  app.route('/', systemRoutes);
  app.use('*', sessionMiddleware);
  app.use('*', csrfMiddleware);
  app.route('/auth', authRoutes);
  app.route('/', meRoutes);
  registerFeatureRoutes(app);
  return app;
}

let appSingleton: ReturnType<typeof createApp> | null = null;
export function getApp() {
  appSingleton ??= createApp();
  return appSingleton;
}
