import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, api } from '@clubhouse/client';
import type { AdminTriggerDto, MemeDto, MemeTone, TriggerDefinition } from '@clubhouse/contracts';
import { plural } from '@/lib/format';
import { qk } from './keys';
import { useAction, useOptimistic } from './mutations';

/* ───────── Queries ───────── */

export function useMemes() {
  return useQuery({ queryKey: qk.memes, queryFn: adminApi.memes.list });
}

export function useTriggers() {
  return useQuery({ queryKey: qk.triggers, queryFn: adminApi.memes.triggers });
}

export function useTriggerEvaluations(id: string | null | undefined) {
  return useQuery({ queryKey: qk.triggerEvals(id ?? ''), queryFn: () => adminApi.memes.evaluations(id!), enabled: !!id && id !== 'new' });
}

/** Team keyword list (read-only here; edited on Chat moderation). */
export function useTeamKeywords(enabled = true) {
  return useQuery({ queryKey: qk.keywords, queryFn: adminApi.chat.keywords, enabled, staleTime: 60_000 });
}

/* ───────── Memes ───────── */

export function useToggleMeme() {
  return useOptimistic<MemeDto[], { id: string; enabled: boolean }>({
    queryKey: qk.memes,
    mutationFn: ({ id, enabled }) => adminApi.memes.update(id, { enabled }),
    apply: (old, v) => old.map((m) => (m.id === v.id ? { ...m, enabled: v.enabled } : m)),
    success: (v) => (v.enabled ? 'Meme switched on' : 'Meme switched off'),
  });
}

export interface MemeEdit {
  caption?: string;
  tags?: string[];
  tone?: MemeTone;
  enabled?: boolean;
  status?: 'approved' | 'pending';
}

export function useUpdateMeme() {
  return useAction(({ id, body }: { id: string; body: MemeEdit }) => adminApi.memes.update(id, body), {
    success: (_d, v) => (v.body.status === 'approved' ? 'Suggestion approved' : 'Meme saved'),
    invalidate: [qk.memes],
  });
}

/** Upload the image (kind "meme") then create the library entry. */
export function useCreateMeme() {
  return useAction(
    async ({ file, caption, tags, tone, enabled }: { file: File; caption: string; tags: string[]; tone: MemeTone; enabled: boolean }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'meme');
      const image = await api.media.upload(form);
      return adminApi.memes.create({ imageId: image.id, caption, tags, tone, enabled });
    },
    { success: 'Meme added to the library', invalidate: [qk.memes] },
  );
}

export type BulkMemeAction = 'delete' | 'enable' | 'disable' | 'add_tags' | 'remove_tags';

const BULK_DONE: Record<BulkMemeAction, string> = {
  delete: 'deleted',
  enable: 'switched on',
  disable: 'switched off',
  add_tags: 'tagged',
  remove_tags: 'updated',
};

export function useBulkMemes() {
  return useAction(({ ids, action, tags }: { ids: string[]; action: BulkMemeAction; tags?: string[] }) => adminApi.memes.bulk({ ids, action, tags }), {
    success: (r, v) => `${plural(r.affected, 'meme')} ${BULK_DONE[v.action]}`,
    invalidate: [qk.memes, qk.triggers],
  });
}

/* ───────── Triggers ───────── */

export function useToggleTrigger() {
  return useOptimistic<AdminTriggerDto[], { id: string; enabled: boolean }>({
    queryKey: qk.triggers,
    mutationFn: ({ id, enabled }) => adminApi.memes.toggleTrigger(id, enabled),
    apply: (old, v) => old.map((t) => (t.id === v.id ? { ...t, enabled: v.enabled } : t)),
    success: (v) => (v.enabled ? 'Trigger switched on' : 'Trigger switched off'),
  });
}

export function useSaveTrigger() {
  const qc = useQueryClient();
  return useAction(({ id, def }: { id: string | null; def: TriggerDefinition }) => (id ? adminApi.memes.updateTrigger(id, def) : adminApi.memes.createTrigger(def)), {
    success: (_d, v) => (v.id ? 'Trigger saved' : v.def.enabled ? 'Trigger created and switched on' : 'Trigger created. It stays off until you switch it on.'),
    invalidate: [qk.triggers],
    onSuccess: (saved) => {
      // Upsert so the builder can show the saved trigger before the refetch lands.
      qc.setQueryData<AdminTriggerDto[]>(qk.triggers, (old) => (old ? (old.some((t) => t.id === saved.id) ? old.map((t) => (t.id === saved.id ? saved : t)) : [...old, saved]) : old));
    },
  });
}

export function useDeleteTrigger() {
  return useAction((id: string) => adminApi.memes.deleteTrigger(id), { success: 'Trigger deleted', invalidate: [qk.triggers] });
}

export function useFireTest() {
  return useAction((id: string) => adminApi.memes.fireTest(id), { invalidate: [qk.triggers] });
}

export function useDryRun() {
  return useAction(({ triggerId, memberId, date }: { triggerId: string | 'all'; memberId: string; date: string }) => adminApi.memes.dryRun(triggerId, { memberId, date }));
}
