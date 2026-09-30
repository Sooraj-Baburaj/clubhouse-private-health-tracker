import { Hono } from 'hono';
import { z } from 'zod';
import { CreateMemberRequest, ImportMembersRequest, ReasonRequest, RoleChangeRequest, TypedConfirmRequest, UpdateMemberRequest, VacationRequest } from '@clubhouse/contracts';
import * as members from '../../../../application/admin/members';
import type { AppEnv } from '../../types';
import { body, param } from '../../validate';
import { actor, OK } from './util';

export const memberRoutes = new Hono<AppEnv>()
  .get('/members', async (ctx) => ctx.json(await members.listMembers(ctx.get('c'), actor(ctx))))
  .post('/members/import', async (ctx) => {
    const input = await body(ctx, ImportMembersRequest);
    return ctx.json(await members.importMembers(ctx.get('c'), actor(ctx), input.csv, input.dryRun));
  })
  .post('/members', async (ctx) => ctx.json(await members.createMember(ctx.get('c'), actor(ctx), await body(ctx, CreateMemberRequest))))
  .get('/members/:id', async (ctx) => ctx.json(await members.memberDetail(ctx.get('c'), actor(ctx), param(ctx, 'id'))))
  .patch('/members/:id', async (ctx) => ctx.json(await members.updateMember(ctx.get('c'), actor(ctx), param(ctx, 'id'), await body(ctx, UpdateMemberRequest))))
  .post('/members/:id/role', async (ctx) => ctx.json(await members.changeRole(ctx.get('c'), actor(ctx), param(ctx, 'id'), await body(ctx, RoleChangeRequest))))
  .post('/members/:id/reset-password', async (ctx) => ctx.json(await members.resetPassword(ctx.get('c'), actor(ctx), param(ctx, 'id'))))
  .post('/members/:id/deactivate', async (ctx) => {
    const { reason } = await body(ctx, ReasonRequest);
    return ctx.json(await members.deactivate(ctx.get('c'), actor(ctx), param(ctx, 'id'), reason));
  })
  .post('/members/:id/reactivate', async (ctx) => ctx.json(await members.reactivate(ctx.get('c'), actor(ctx), param(ctx, 'id'))))
  .post('/members/:id/delete-data', async (ctx) => {
    await members.deleteMemberData(ctx.get('c'), actor(ctx), param(ctx, 'id'), await body(ctx, TypedConfirmRequest));
    return ctx.json(OK);
  })
  .post('/members/:id/revoke-sessions', async (ctx) => ctx.json(await members.revokeSessions(ctx.get('c'), actor(ctx), param(ctx, 'id'))))
  .post('/members/:id/reset-totp', async (ctx) => {
    const { reason } = await body(ctx, z.object({ reason: z.string().trim().min(3, 'Give a reason (at least 3 characters).').max(300) }));
    await members.resetTotp(ctx.get('c'), actor(ctx), param(ctx, 'id'), reason);
    return ctx.json(OK);
  })
  .post('/members/:id/vacation', async (ctx) => {
    await members.setMemberVacation(ctx.get('c'), actor(ctx), param(ctx, 'id'), await body(ctx, VacationRequest));
    return ctx.json(OK);
  });
