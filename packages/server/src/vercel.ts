import { getRequestListener } from '@hono/node-server';
import { getApp } from './app';

/**
 * Vercel Node.js function entry (Build Output API). Routes send /api/* here; if the platform passes the original path
 * in `__path` (see scripts/build-vercel-output.mjs) the URL is restored before Hono routes it.
 */
const listener = getRequestListener((req: Request) => {
  const url = new URL(req.url);
  const p = url.searchParams.get('__path');
  if (p !== null) {
    url.pathname = `/api/${p}`;
    url.searchParams.delete('__path');
    return getApp().fetch(new Request(url, req));
  }
  return getApp().fetch(req);
});

export default listener;
