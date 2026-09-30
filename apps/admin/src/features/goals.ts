import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import type { AdminGoalRow, AdminGoalUpdate, MemberTargetSettingsRequest, OverrideTargetsRequest, Thresholds } from '@clubhouse/contracts';
import type { z } from 'zod';
import { qk } from './keys';
import { useAction, useOptimistic } from './mutations';

export function useGoals() {
  return useQuery({ queryKey: qk.goals, queryFn: adminApi.goals.list });
}

/** Goal changes can be refused by the safety rules (ADM-PLAN-11); callers show the refusal inline, so no error toast. */
export function useUpdateGoal() {
  return useAction(({ userId, body }: { userId: string; body: z.input<typeof AdminGoalUpdate> }) => adminApi.goals.update(userId, body), { success: 'Goal saved. Targets recalculated.', errorToast: false, invalidate: [qk.goals, qk.members, qk.dashboard] });
}

export function useOverrideTargets() {
  return useAction(({ userId, body }: { userId: string; body: z.input<typeof OverrideTargetsRequest> }) => adminApi.goals.override(userId, body), { success: 'Override saved', errorToast: false, invalidate: [qk.goals, qk.members, qk.dashboard] });
}

export function useClearOverride() {
  return useAction(({ userId, reason }: { userId: string; reason: string }) => adminApi.goals.clearOverride(userId, reason), { success: 'Override cleared. Back to calculated targets.', invalidate: [qk.goals, qk.members, qk.dashboard] });
}

/** Per-member threshold overrides (null = team default). */
export function useMemberThresholds() {
  return useAction(({ userId, body }: { userId: string; body: z.input<typeof MemberTargetSettingsRequest> }) => adminApi.goals.memberSettings(userId, body), { success: 'Band thresholds saved', invalidate: [qk.goals, qk.members] });
}

/** Eat-back toggle: optimistic on the goals list with rollback. */
export function useEatBackToggle() {
  return useOptimistic<AdminGoalRow[], { userId: string; on: boolean }>({
    queryKey: qk.goals,
    mutationFn: ({ userId, on }) => adminApi.goals.memberSettings(userId, { eatBackExercise: on }),
    apply: (old, { userId, on }) => old.map((r) => (r.userId === userId ? { ...r, eatBackExercise: on } : r)),
    success: ({ on }) => (on ? 'Exercise calories will be added back' : 'Exercise calories no longer added back'),
    invalidate: [qk.members],
  });
}

export function useSaveThresholds() {
  return useAction((thresholds: Thresholds) => adminApi.settings.update({ thresholds }), { success: 'Team thresholds saved', invalidate: [qk.settings, qk.dashboard] });
}
