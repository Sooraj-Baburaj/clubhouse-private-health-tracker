import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api } from '@clubhouse/client';
import type { InboxResponse, NotificationPrefDto, NotificationPrefUpdate } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { qk } from './keys';
import { errorText } from './settings';

export function useInbox() {
  return useInfiniteQuery({
    queryKey: qk.inbox,
    queryFn: ({ pageParam }) => api.inbox.list(pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  });
}

type InboxData = InfiniteData<InboxResponse, string | null>;

export function useMarkInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[] | 'all') => api.inbox.read(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: qk.inbox });
      const prev = qc.getQueryData<InboxData>(qk.inbox);
      if (prev) {
        const now = new Date().toISOString();
        const hit = (id: string) => ids === 'all' || ids.includes(id);
        qc.setQueryData<InboxData>(qk.inbox, {
          ...prev,
          pages: prev.pages.map((p) => {
            const items = p.items.map((n) => (hit(n.id) && !n.readAt ? { ...n, readAt: now } : n));
            return { ...p, items, unread: ids === 'all' ? 0 : Math.max(0, p.unread - p.items.filter((n) => hit(n.id) && !n.readAt).length) };
          }),
        });
      }
      return { prev };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.inbox, ctx.prev);
      toast.error(errorText(err));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.unread });
      void qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

export function useNotificationPrefs() {
  return useQuery({ queryKey: qk.prefs, queryFn: () => api.inbox.prefs(), staleTime: 60_000 });
}

export function useUpdateNotificationPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: NotificationPrefUpdate['items'][number]) => api.inbox.updatePrefs({ items: [item] }),
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: qk.prefs });
      const prev = qc.getQueryData<NotificationPrefDto[]>(qk.prefs);
      if (prev) qc.setQueryData<NotificationPrefDto[]>(qk.prefs, prev.map((p) => (p.type === item.type ? { ...p, ...Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)) } : p)));
      return { prev };
    },
    onError: (err, _i, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.prefs, ctx.prev);
      toast.error(errorText(err, 'Couldn’t save that reminder.'));
    },
    onSuccess: (list) => qc.setQueryData(qk.prefs, list),
  });
}
