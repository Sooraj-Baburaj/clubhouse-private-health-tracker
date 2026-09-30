import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import type {
  AssignPlanTemplateRequest,
  ProposalReplyRequest,
  UpsertPlanRequest,
  AdminRestWeekRequest,
} from '@clubhouse/contracts';
import type { z } from 'zod';
import { qk } from './keys';
import { useAction } from './mutations';

/** Activity plans (admin): table, per-member plan + adherence, ranking, proposals and rest weeks. */

export type PlanDetail = Awaited<ReturnType<typeof adminApi.plans.get>>;
export type RankingRow = Awaited<ReturnType<typeof adminApi.plans.ranking>>[number];
export type ProposalRow = Awaited<ReturnType<typeof adminApi.plans.proposals>>[number];
export type RestWeekRow = Awaited<ReturnType<typeof adminApi.plans.restWeeks>>[number];

export function usePlans() {
  return useQuery({ queryKey: qk.plans, queryFn: adminApi.plans.list });
}

export function usePlan(userId: string | null) {
  return useQuery({
    queryKey: qk.plan(userId ?? ''),
    queryFn: () => adminApi.plans.get(userId!),
    enabled: !!userId,
  });
}

export function usePlanRanking() {
  return useQuery({ queryKey: qk.planRanking, queryFn: adminApi.plans.ranking });
}

export function usePlanProposals() {
  return useQuery({ queryKey: qk.planProposals, queryFn: adminApi.plans.proposals });
}

export function usePlanRestWeeks() {
  return useQuery({ queryKey: qk.planRestWeeks, queryFn: adminApi.plans.restWeeks });
}

export function useUpsertPlan() {
  return useAction(
    ({ userId, body }: { userId: string; body: z.input<typeof UpsertPlanRequest> }) =>
      adminApi.plans.upsert(userId, body),
    {
      success: 'Plan saved. The member will see it right away.',
      invalidate: [qk.plans, qk.planRanking],
    },
  );
}

export function useAssignPlan() {
  return useAction(
    (body: z.input<typeof AssignPlanTemplateRequest>) => adminApi.plans.assign(body),
    {
      success: (r) => `Plan assigned to ${r.updated} ${r.updated === 1 ? 'member' : 'members'}`,
      invalidate: [qk.plans, qk.planRanking],
    },
  );
}

export function useReplyProposal() {
  return useAction(
    ({ id, body }: { id: string; body: z.input<typeof ProposalReplyRequest> }) =>
      adminApi.plans.replyProposal(id, body),
    {
      success: (_r, v) =>
        v.body.status === 'accepted'
          ? 'Proposal accepted'
          : v.body.status === 'declined'
            ? 'Proposal declined'
            : 'Reply sent',
      invalidate: [qk.planProposals, qk.plans],
    },
  );
}

export function useDecideRestWeek() {
  return useAction(
    ({ id, status }: { id: string; status: 'approved' | 'declined' }) =>
      adminApi.plans.decideRestWeek(id, status),
    {
      success: (_r, v) => (v.status === 'approved' ? 'Rest week approved' : 'Rest week declined'),
      invalidate: [qk.planRestWeeks, qk.plans, qk.planRanking],
    },
  );
}

export function useSetRestWeek() {
  return useAction(
    (body: z.input<typeof AdminRestWeekRequest>) => adminApi.plans.setRestWeek(body),
    {
      success: 'Rest week set',
      invalidate: [qk.planRestWeeks, qk.plans, qk.planRanking],
    },
  );
}
