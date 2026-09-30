import { serve } from '@hono/node-server';
import { getApp } from './app';
import { log } from './lib/log';

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: getApp().fetch, port }, (info) => log.info('dev.listening', { url: `http://localhost:${info.port}/api/health` }));
