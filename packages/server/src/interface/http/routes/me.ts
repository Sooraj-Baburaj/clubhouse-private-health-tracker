import { Hono } from 'hono';
import { z } from 'zod';
import { ActivityLevel, GoalType, GoalUpdateRequest, OnboardingRequest, PreferencesUpdateRequest, ProfileUpdateRequest, Sex, VacationRequest } from '@clubhouse/contracts';
import { buildMe } from '../../../application/me';
import * as profile from '../../../application/profile';
import { currentAuth } from '../middleware/session';
import type { AppEnv } from '../types';
import { body } from '../validate';

export const meRoutes = new Hono<AppEnv>()
  .get('/me', async (ctx) => {
    const a = currentAuth(ctx, { allowMustChange: true, allowMfaPending: true });
    const me = await buildMe(ctx.get('c'), a.user);
    return ctx.json({ ...me, mfaPending: a.mfaPending });
  })
  .get('/profile', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await profile.getProfileDto(ctx.get('c'), a.user));
  })
  .post('/profile/onboarding', async (ctx) => {
    const a = currentAuth(ctx);
    const input = await body(ctx, OnboardingRequest);
    return ctx.json({ targets: await profile.completeOnboarding(ctx.get('c'), a.user, input) });
  })
  .patch('/profile', async (ctx) => {
    const a = currentAuth(ctx);
    await profile.updateProfile(ctx.get('c'), a.user, await body(ctx, ProfileUpdateRequest));
    return ctx.json(await profile.getProfileDto(ctx.get('c'), a.user));
  })
  .post('/profile/targets/preview', async (ctx) => {
    const a = currentAuth(ctx);
    const input = await body(
      ctx,
      z
        .object({ weightKg: z.number().min(25).max(350), activityLevel: ActivityLevel, goalType: GoalType, paceKgWeek: z.number().min(0).max(1).nullable(), targetWeightKg: z.number().nullable(), targetDate: z.string().nullable(), heightCm: z.number(), sex: Sex, dob: z.string() })
        .partial(),
    );
    return ctx.json({ preview: await profile.previewTargets(ctx.get('c'), a.user, input) });
  })
  .put('/profile/goal', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json({ targets: await profile.updateGoal(ctx.get('c'), a.user, await body(ctx, GoalUpdateRequest)) });
  })
  .patch('/profile/preferences', async (ctx) => {
    const a = currentAuth(ctx);
    await profile.updatePreferences(ctx.get('c'), a.user, await body(ctx, PreferencesUpdateRequest));
    return ctx.json(await profile.getProfileDto(ctx.get('c'), a.user));
  })
  .post('/profile/vacation', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json({ vacationRanges: await profile.setVacation(ctx.get('c'), a.user, await body(ctx, VacationRequest)) });
  })
  .delete('/profile/vacation', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json({ vacationRanges: await profile.endVacation(ctx.get('c'), a.user) });
  })
  .post('/profile/deletion-request', async (ctx) => {
    const a = currentAuth(ctx);
    const { note } = await body(ctx, z.object({ note: z.string().max(500).nullable().optional() }));
    const r = await profile.requestDeletion(ctx.get('c'), a.user, note ?? null);
    return ctx.json({ id: r.id, status: r.status });
  });
