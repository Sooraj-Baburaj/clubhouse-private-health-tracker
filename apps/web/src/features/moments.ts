import { useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { api, ApiError } from '@clubhouse/client';
import type { LogSideEffects, MemeMomentDto, TodayResponse } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { qk } from './keys';
import { useUpdatePreferences } from './onboarding';

export type Milestone = LogSideEffects['milestones'][number];

interface MomentsState {
  /** Moments returned by a save; shown on Today before the next refetch includes them. */
  recent: MemeMomentDto[];
  dismissed: string[];
  reacted: string[];
  /** Milestones waiting for their celebration overlay. */
  celebrations: Milestone[];
  pushEffects: (effects: LogSideEffects | null | undefined) => void;
  markDismissed: (fireId: string) => void;
  markReacted: (fireId: string) => void;
  nextCelebration: () => void;
}

export const useMoments = create<MomentsState>((set) => ({
  recent: [],
  dismissed: [],
  reacted: [],
  celebrations: [],
  pushEffects: (effects) => {
    if (!effects) return;
    set((s) => ({
      recent: [...effects.memeMoments.filter((m) => !s.recent.some((r) => r.fireId === m.fireId)), ...s.recent].slice(0, 20),
      celebrations: [...s.celebrations, ...effects.milestones],
    }));
  },
  markDismissed: (fireId) => set((s) => ({ dismissed: [...s.dismissed, fireId] })),
  markReacted: (fireId) => set((s) => ({ reacted: s.reacted.includes(fireId) ? s.reacted : [...s.reacted, fireId] })),
  nextCelebration: () => set((s) => ({ celebrations: s.celebrations.slice(1) })),
}));

/** Moments from the Today payload merged with ones a save just returned, minus dismissed. */
export function mergeMoments(fromToday: MemeMomentDto[], recent: MemeMomentDto[], dismissed: string[]): MemeMomentDto[] {
  const seen = new Set<string>();
  const out: MemeMomentDto[] = [];
  for (const m of [...fromToday, ...recent]) {
    if (seen.has(m.fireId) || dismissed.includes(m.fireId)) continue;
    seen.add(m.fireId);
    out.push(m);
  }
  return out;
}

function removeFromToday(qc: ReturnType<typeof useQueryClient>, fireId: string) {
  qc.setQueriesData<TodayResponse>({ queryKey: ['today'] }, (t) => (t ? { ...t, memeMoments: t.memeMoments.filter((m) => m.fireId !== fireId) } : t));
}

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Quick reaction, dismiss, share to chat and the one-tap roast opt-out for private meme moments. */
export function useMomentActions() {
  const qc = useQueryClient();
  const { markDismissed, markReacted } = useMoments.getState();
  const prefs = useUpdatePreferences();

  const react = useMutation({
    mutationFn: (fireId: string) => api.moments.react(fireId),
    onMutate: (fireId) => markReacted(fireId),
    onError: (e) => toast.error(errMsg(e, 'Couldn’t send that reaction.')),
  });
  const dismiss = useMutation({
    mutationFn: ({ moment }: { moment: MemeMomentDto; markRoastSeen: boolean }) => api.moments.dismiss(moment.fireId),
    onMutate: ({ moment, markRoastSeen }) => {
      markDismissed(moment.fireId);
      removeFromToday(qc, moment.fireId);
      if (markRoastSeen) prefs.mutate({ privacy: { roastPromptSeen: true } });
    },
    onError: (e) => toast.error(errMsg(e, 'Couldn’t hide that one.')),
  });
  const share = useMutation({
    mutationFn: (fireId: string) => api.moments.share(fireId),
    onSuccess: () => {
      toast.success('Shared to the team chat');
      void qc.invalidateQueries({ queryKey: qk.chat });
    },
    onError: (e) => toast.error(errMsg(e, 'Couldn’t share that to chat.')),
  });
  const noRoasts = (moment: MemeMomentDto) => {
    prefs.mutate(
      { privacy: { roastMemes: false, roastPromptSeen: true } },
      {
        onSuccess: () => toast.show('Got it — no roasts for you. Celebrations still welcome.'),
        onError: (e) => toast.error(errMsg(e, 'Couldn’t save that. Try again from Settings.')),
      },
    );
    markDismissed(moment.fireId);
    removeFromToday(qc, moment.fireId);
    void api.moments.dismiss(moment.fireId).catch(() => undefined);
  };
  return { react, dismiss, share, noRoasts };
}
