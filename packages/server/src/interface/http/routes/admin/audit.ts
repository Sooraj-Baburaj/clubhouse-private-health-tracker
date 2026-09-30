import { Hono } from 'hono';
import { z } from 'zod';
import { AuditQuery } from '@clubhouse/contracts';
import * as auditLog from '../../../../application/admin/auditLog';
import type { AppEnv } from '../../types';
import { body, param, query } from '../../validate';
import { actor, csvResponse, OK } from './util';

export const auditRoutes = new Hono<AppEnv>()
  .get('/audit', async (ctx) => ctx.json(await auditLog.listAudit(ctx.get('c'), actor(ctx), query(ctx, AuditQuery))))
  .get('/audit.csv', async (ctx) => {
    const q = query(ctx, AuditQuery);
    return csvResponse(ctx, await auditLog.auditCsv(ctx.get('c'), actor(ctx), q), `audit-${new Date().toISOString().slice(0, 10)}.csv`);
  })
  .get('/sessions', async (ctx) => ctx.json(await auditLog.adminSessions(ctx.get('c'), actor(ctx))))
  .delete('/sessions/:id', async (ctx) => {
    await auditLog.revokeAdminSession(ctx.get('c'), actor(ctx), param(ctx, 'id'));
    return ctx.json(OK);
  })
  .get('/jobs/runs', async (ctx) => ctx.json(await auditLog.jobRuns(ctx.get('c'))))
  .post('/jobs/run', async (ctx) => {
    const { step } = await body(ctx, z.object({ step: z.string().min(1).max(40) }));
    return ctx.json(await auditLog.runStep(ctx.get('c'), actor(ctx), step));
  });
