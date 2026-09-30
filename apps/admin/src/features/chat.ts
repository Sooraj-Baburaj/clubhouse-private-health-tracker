import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import type {
  AnnouncementRequest,
  ClearChatRequest,
  MuteRequest,
  ReportResolveRequest,
} from '@clubhouse/contracts';
import type { z } from 'zod';
import { qk } from './keys';
import { useAction, useOptimistic } from './mutations';

/** Chat moderation: server-side message search (paged by seq), announcements, clear, reports, mutes, keywords. */

export type ChatPage = Awaited<ReturnType<typeof adminApi.chat.list>>;
export type AdminChatMessage = ChatPage['messages'][number];
export type ReportRow = Awaited<ReturnType<typeof adminApi.chat.reports>>[number];
export type MuteRow = Awaited<ReturnType<typeof adminApi.chat.mutes>>[number];
export interface ChatFilters {
  q?: string;
  userId?: string;
  from?: string;
  to?: string;
  reported?: '1';
}
type ChatCache = InfiniteData<ChatPage, number | undefined>;

const PAGE = 50;

/** Strip empty values so equivalent filters share one cache entry. */
export function cleanFilters(f: ChatFilters): ChatFilters {
  const out: ChatFilters = {};
  if (f.q?.trim()) out.q = f.q.trim();
  if (f.userId) out.userId = f.userId;
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  if (f.reported) out.reported = '1';
  return out;
}

export function useChatMessages(filters: ChatFilters) {
  return useInfiniteQuery({
    queryKey: qk.chatMessages({ ...filters }),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => adminApi.chat.list({ ...filters, before: pageParam, limit: PAGE }),
    getNextPageParam: (last) => {
      if (!last.hasMore || last.messages.length === 0) return undefined;
      return Math.min(...last.messages.map((m) => m.seq));
    },
  });
}

function mapMessages(old: ChatCache, fn: (m: AdminChatMessage) => AdminChatMessage): ChatCache {
  return { ...old, pages: old.pages.map((p) => ({ ...p, messages: p.messages.map(fn) })) };
}

export function usePinMessage(filters: ChatFilters) {
  return useOptimistic<ChatCache, { id: string; on: boolean }>({
    queryKey: qk.chatMessages({ ...filters }),
    mutationFn: ({ id, on }) => adminApi.chat.pin(id, on),
    apply: (old, { id, on }) => mapMessages(old, (m) => (m.id === id ? { ...m, pinned: on } : m)),
    success: ({ on }) => (on ? 'Pinned to the top of chat' : 'Unpinned'),
    invalidate: [qk.chatAll],
  });
}

export function useDeleteMessage(filters: ChatFilters) {
  return useOptimistic<ChatCache, string>({
    queryKey: qk.chatMessages({ ...filters }),
    mutationFn: (id) => adminApi.chat.delete(id),
    apply: (old, id) =>
      mapMessages(old, (m) =>
        m.id === id ? { ...m, deleted: true, deletedByAdmin: true, pinned: false } : m,
      ),
    success: 'Message removed',
    invalidate: [qk.reports],
  });
}

export function useAnnouncements() {
  return useQuery({ queryKey: qk.announcements, queryFn: adminApi.chat.announcements });
}

export function useAnnounce() {
  return useAction((body: z.input<typeof AnnouncementRequest>) => adminApi.chat.announce(body), {
    success: (a) => (a.sentAt ? 'Announcement posted' : 'Announcement scheduled'),
    invalidate: [qk.announcements, qk.chatAll],
  });
}

export function useClearChat() {
  return useAction((body: z.input<typeof ClearChatRequest>) => adminApi.chat.clear(body), {
    success: (r) =>
      `Cleared ${r.messages} ${r.messages === 1 ? 'message' : 'messages'} and ${r.images} ${r.images === 1 ? 'image' : 'images'}`,
    invalidate: [qk.chatAll, qk.dashboard],
  });
}

export function useReports() {
  return useQuery({ queryKey: qk.reports, queryFn: adminApi.chat.reports });
}

export function useResolveReport() {
  return useAction(
    ({ id, body }: { id: string; body: z.input<typeof ReportResolveRequest> }) =>
      adminApi.chat.resolveReport(id, body),
    {
      success: (_r, v) =>
        v.body.action === 'delete'
          ? 'Message removed and report closed'
          : v.body.action === 'nudge'
            ? 'Author nudged and report closed'
            : 'Report dismissed',
      invalidate: [qk.chatAll, qk.dashboard],
    },
  );
}

export function useMutes() {
  return useQuery({ queryKey: qk.mutes, queryFn: adminApi.chat.mutes });
}

export function useMute() {
  return useAction((body: z.input<typeof MuteRequest>) => adminApi.chat.mute(body), {
    success: 'Member muted in chat',
    invalidate: [qk.mutes],
  });
}

export function useUnmute() {
  return useAction((userId: string) => adminApi.chat.unmute(userId), {
    success: 'Member can post again',
    invalidate: [qk.mutes],
  });
}

export function useKeywords() {
  return useQuery({ queryKey: qk.keywords, queryFn: adminApi.chat.keywords });
}

export function useSetKeywords() {
  return useAction((keywords: string[]) => adminApi.chat.setKeywords(keywords), {
    success: 'Keyword list saved',
    invalidate: [qk.keywords, qk.triggers],
  });
}
