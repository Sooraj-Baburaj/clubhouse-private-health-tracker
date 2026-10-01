import type { Hono } from 'hono';
import type { AppEnv } from '../types';
import { adminRoutes } from './admin';
import { aiRoutes } from './ai';
import { chatRoutes } from './chat';
import { dietRoutes } from './diet';
import { exportRoutes } from './export';
import { foodRoutes } from './foods';
import { habitRoutes } from './habits';
import { jobRoutes } from './jobs';
import { logRoutes } from './logs';
import { mediaRoutes } from './media';
import { momentumRoutes } from './momentum';
import { notificationRoutes } from './notifications';
import { planRoutes } from './plan';
import { progressRoutes } from './progress';
import { teamRoutes } from './team';
import { todayRoutes } from './today';

/** Feature modules. Each file owns one area of the API; paths match packages/client exactly. */
export function registerFeatureRoutes(app: Hono<AppEnv, Record<string, never>, '/api'>) {
  app.route('/', foodRoutes);
  app.route('/', logRoutes);
  app.route('/', todayRoutes);
  app.route('/', mediaRoutes);
  app.route('/', aiRoutes);
  app.route('/', dietRoutes);
  app.route('/', planRoutes);
  app.route('/', habitRoutes);
  app.route('/', progressRoutes);
  app.route('/', momentumRoutes);
  app.route('/', teamRoutes);
  app.route('/', chatRoutes);
  app.route('/', notificationRoutes);
  app.route('/', exportRoutes);
  app.route('/jobs', jobRoutes);
  app.route('/admin', adminRoutes);
}
