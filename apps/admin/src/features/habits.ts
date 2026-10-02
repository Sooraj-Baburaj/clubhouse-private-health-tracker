import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import type { AdminHabitDto, AdminHabitInput, AdminHabitsResponse } from '@clubhouse/contracts';
import type { z } from 'zod';
import { qk } from './keys';
import { useAction, useOptimistic } from './mutations';

/** Habits (admin): catalogue with KPIs, member × habit adherence, editor, templates, on/off and archive. */

export function useHabits() {
  return useQuery({ queryKey: qk.habits, queryFn: adminApi.habits.list });
}

export function useHabitAdherence(enabled = true) {
  return useQuery({ queryKey: qk.habitAdherence, queryFn: adminApi.habits.adherence, enabled });
}

export function useSaveHabit() {
  return useAction(
    ({ id, body }: { id: string | null; body: z.input<typeof AdminHabitInput> }) => (id ? adminApi.habits.update(id, body) : adminApi.habits.create(body)),
    {
      success: (h, v) => (v.id ? `${h.name} saved` : `${h.name} created`),
      invalidate: [qk.habits],
    },
  );
}

export function useAddTemplate() {
  return useAction((key: string) => adminApi.habits.addTemplate(key), { success: (h) => `${h.name} added for everyone`, invalidate: [qk.habits] });
}

export function useToggleHabit() {
  return useOptimistic<AdminHabitsResponse, { id: string; enabled: boolean }, AdminHabitDto>({
    queryKey: qk.habits,
    mutationFn: ({ id, enabled }) => adminApi.habits.setEnabled(id, enabled),
    apply: (old, v) => ({ ...old, habits: old.habits.map((h) => (h.id === v.id ? { ...h, enabled: v.enabled } : h)) }),
    success: (v) => (v.enabled ? 'Habit switched on' : 'Habit switched off. History is kept.'),
    invalidate: [qk.habitAdherence],
  });
}

export function useArchiveHabit() {
  return useAction((h: AdminHabitDto) => adminApi.habits.archive(h.id), { success: (_r, h) => `${h.name} archived. Its history is kept.`, invalidate: [qk.habits, qk.habitAdherence] });
}

/** Save the team order; the response is the refreshed catalogue (members who now match are synced). */
export function useSetHabitOrder() {
  const qc = useQueryClient();
  return useAction((ids: string[]) => adminApi.habits.setOrder(ids), {
    success: 'Order saved. Members see it right away.',
    onSuccess: (r) => qc.setQueryData(qk.habits, r),
    invalidate: [qk.habitAdherence],
  });
}

/** Put members back on the team order: some (`userIds`) or everyone who arranged their own. */
export function useSyncHabitOrders() {
  return useAction((userIds?: string[]) => adminApi.habits.syncOrders(userIds), {
    success: (r) => (r.synced === 1 ? 'Synced to the team order' : `${r.synced} members synced to the team order`),
    invalidate: [qk.habits],
  });
}
