import { Hono } from 'hono';
import { adminIdleMiddleware, requireRole } from '../../middleware/session';
import type { AppEnv } from '../../types';
import { aiRoutes } from './ai';
import { auditRoutes } from './audit';
import { chatRoutes } from './chat';
import { dashboardRoutes } from './dashboard';
import { dietRoutes } from './diets';
import { foodRoutes } from './foods';
import { goalRoutes } from './goals';
import { habitRoutes } from './habits';
import { memberRoutes } from './members';
import { memeRoutes } from './memes';
import { notificationRoutes } from './notifications';
import { planRoutes } from './plans';
import { retentionRoutes } from './retention';
import { settingsRoutes } from './settings';

/**
 * Admin API, mounted at /api/admin. Every route needs an admin role and admin activity within the last 12 hours
 * (NFR-SEC-06); Super-Admin-only operations are enforced in the use cases with a clear 403. All queries are
 * scoped to the admin's team.
 */
export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireRole('admin'));
adminRoutes.use('*', adminIdleMiddleware);
adminRoutes.route('/', dashboardRoutes);
adminRoutes.route('/', memberRoutes);
adminRoutes.route('/', goalRoutes);
adminRoutes.route('/', dietRoutes);
adminRoutes.route('/', foodRoutes);
adminRoutes.route('/', planRoutes);
adminRoutes.route('/', habitRoutes);
adminRoutes.route('/', chatRoutes);
adminRoutes.route('/', memeRoutes);
adminRoutes.route('/', aiRoutes);
adminRoutes.route('/', notificationRoutes);
adminRoutes.route('/', settingsRoutes);
adminRoutes.route('/', retentionRoutes);
adminRoutes.route('/', auditRoutes);
