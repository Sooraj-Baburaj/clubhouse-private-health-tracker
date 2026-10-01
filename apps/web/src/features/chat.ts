import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { api, ApiError, NetworkError } from '@clubhouse/client';
import type { AttachmentInput, ChatMessageDto, ChatPageResponse, SendMessageRequest } from '@clubhouse/contracts';
import { haptic, toast } from '@clubhouse/ui';
import { CHAT_FEED_KEY, useCollectionStatus } from '@/infrastructure/cache';
import { cachedMessage, chatFeed, chatHistory, loadOlder, patchMessage, setLastRead, upsertMessage } from '@/infrastructure/cache/chatHistory';
import { compressImage } from '@/infrastructure/images';
import { outbox } from '@/infrastructure/outbox';
import { nowIso, uuid } from '@/lib/ids';
import { qk } from './keys';
import { errorText } from './settings';

export const FEED_KEY = CHAT_FEED_KEY;
export type ChatFeed = ChatPageResponse;

/**
 * The chat feed is a view over the IndexedDB-backed chat history (infrastructure/cache/chatHistory.ts): it renders
 * instantly from the cache and refreshes with delta pulls. Invalidating ['chat'] (realtime hints, polling, focus)
 * refetches, which revalidates the cache; cache changes are pushed into this query by the cache manager.
 */
export function useChatFeed() {
  const status = useCollectionStatus(chatHistory);
  return useQuery({
    queryKey: FEED_KEY,
    queryFn: async () => {
      await chatHistory.revalidate('manual');
      const s = chatHistory.getStatus();
      // Nothing cached and the pull failed: surface the error instead of an empty chat.
      if (!s.ready && s.state === 'error') throw new Error(s.error ?? 'Couldn’t load the chat');
      return chatFeed();
    },
    initialData: status.hydrated && status.count > 0 ? chatFeed() : undefined,
    initialDataUpdatedAt: status.syncedAt ?? 0,
    staleTime: 4_000,
    networkMode: 'always',
  });
}

/** Infinite scroll up: cached history first, then older pages from the server (stored in the cache). */
export function useLoadOlder() {
  return useMutation({
    mutationFn: () => loadOlder(),
    onError: (err) => toast.error(errorText(err, 'Couldn’t load older messages.')),
  });
}

export function useChatMembers() {
  return useQuery({ queryKey: qk.chatMembers, queryFn: () => api.chat.members(), staleTime: 10 * 60_000 });
}

export function useMemes(enabled = true) {
  return useQuery({ queryKey: qk.memes, queryFn: () => api.chat.memes(), staleTime: 10 * 60_000, enabled });
}


export function applyReaction(m: ChatMessageDto, emoji: string, on: boolean, myName: string): ChatMessageDto {
  const existing = m.reactions.find((r) => r.emoji === emoji);
  let reactions: ChatMessageDto['reactions'];
  if (on) {
    reactions = existing
      ? m.reactions.map((r) => (r.emoji === emoji && !r.mine ? { ...r, count: r.count + 1, mine: true, names: [...r.names, myName] } : r))
      : [...m.reactions, { emoji, count: 1, mine: true, names: [myName] }];
  } else {
    reactions = m.reactions.map((r) => (r.emoji === emoji && r.mine ? { ...r, count: r.count - 1, mine: false, names: r.names.filter((n) => n !== myName) } : r)).filter((r) => r.count > 0);
  }
  return { ...m, reactions };
}

export function useReact(myName: string) {
  return useMutation({
    mutationFn: ({ id, emoji, on }: { id: string; emoji: string; on: boolean }) => api.chat.react(id, emoji, on),
    onMutate: async ({ id, emoji, on }) => {
      const prev = cachedMessage(id);
      await patchMessage(id, (m) => applyReaction(m, emoji, on, myName));
      haptic(6);
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) void patchMessage(ctx.prev.id, () => ctx.prev!);
      toast.error(errorText(err, 'Couldn’t react just now.'));
    },
    onSettled: () => void chatHistory.revalidate('write'),
  });
}

export function useDeleteMessage() {
  return useMutation({
    mutationFn: (id: string) => api.chat.delete(id),
    onMutate: async (id) => {
      const prev = cachedMessage(id);
      await patchMessage(id, (m) => ({ ...m, deleted: true, body: '', attachments: [] }));
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) void patchMessage(ctx.prev.id, () => ctx.prev!);
      toast.error(errorText(err, 'Couldn’t delete that message.'));
    },
    onSuccess: () => toast.show('Message deleted'),
    onSettled: () => void chatHistory.revalidate('write'),
  });
}

export function useReportMessage() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.chat.report(id, reason),
    onSuccess: () => toast.success('Thanks — an admin will take a look'),
    onError: (err) => toast.error(errorText(err, 'Couldn’t send that report.')),
  });
}

export function useMarkChatRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seq: number) => api.chat.read(seq),
    onMutate: (seq) => {
      void setLastRead(seq);
      qc.setQueryData<{ chat: number; inbox: number }>(qk.unread, (u) => (u ? { ...u, chat: 0 } : u));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.unread }),
  });
}

/* ---------------- Composer draft + pending sends ---------------- */

export interface DraftAttachment {
  key: string;
  input: AttachmentInput;
  label: string;
  thumbUrl?: string | null;
}

export interface ReplyTarget {
  id: string;
  authorName: string;
  body: string;
}

export interface PendingMessage {
  id: string;
  req: SendMessageRequest;
  status: 'sending' | 'queued' | 'failed';
  error?: string;
  reply: ReplyTarget | null;
  labels: string[];
  createdAt: string;
}

interface ChatStore {
  draft: string;
  attachments: DraftAttachment[];
  replyTo: ReplyTarget | null;
  pending: PendingMessage[];
  setDraft: (d: string) => void;
  addAttachment: (a: DraftAttachment) => void;
  removeAttachment: (key: string) => void;
  setReplyTo: (r: ReplyTarget | null) => void;
  resetComposer: () => void;
  upsertPending: (p: PendingMessage) => void;
  patchPending: (id: string, patch: Partial<PendingMessage>) => void;
  dropPending: (ids: string[]) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  draft: '',
  attachments: [],
  replyTo: null,
  pending: [],
  setDraft: (draft) => set({ draft }),
  addAttachment: (a) => set((s) => (s.attachments.length >= 4 || s.attachments.some((x) => x.key === a.key) ? s : { attachments: [...s.attachments, a] })),
  removeAttachment: (key) => set((s) => ({ attachments: s.attachments.filter((a) => a.key !== key) })),
  setReplyTo: (replyTo) => set({ replyTo }),
  resetComposer: () => set({ draft: '', attachments: [], replyTo: null }),
  upsertPending: (p) => set((s) => ({ pending: [...s.pending.filter((x) => x.id !== p.id), p] })),
  patchPending: (id, patch) => set((s) => ({ pending: s.pending.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  dropPending: (ids) => set((s) => ({ pending: s.pending.filter((p) => !ids.includes(p.id)) })),
}));

/** Pre-fill the composer from elsewhere (e.g. Diet's "Ask your admin for a plan"). */
export function prefillChat(text: string, attachment?: DraftAttachment) {
  const s = useChatStore.getState();
  s.setDraft(text);
  if (attachment) s.addAttachment(attachment);
}


/**
 * Send with an optimistic bubble (clock icon). Direct PUT first; on a network failure the message goes to the
 * offline outbox and is replayed on reconnect with the same id, so it never duplicates (APP-CHAT-10).
 */
export function useSendMessage() {
  const qc = useQueryClient();
  const store = useChatStore;
  return useMutation({
    mutationFn: async (p: PendingMessage): Promise<{ message: ChatMessageDto | null; queued: boolean }> => {
      try {
        const r = await api.chat.send(p.id, p.req);
        return { message: r.message, queued: false };
      } catch (e) {
        if (e instanceof NetworkError || (e instanceof ApiError && e.status >= 500)) {
          await outbox.enqueue({ kind: 'chat', id: p.id, data: p.req });
          return { message: null, queued: true };
        }
        throw e;
      }
    },
    onMutate: (p) => {
      store.getState().upsertPending({ ...p, status: 'sending', error: undefined });
    },
    onSuccess: (r, p) => {
      if (r.queued) return store.getState().patchPending(p.id, { status: 'queued' });
      if (r.message) void upsertMessage(r.message);
      else void chatHistory.revalidate('write');
      store.getState().dropPending([p.id]);
      haptic(8);
    },
    onError: (err, p) => {
      store.getState().patchPending(p.id, { status: 'failed', error: errorText(err, 'Couldn’t send') });
      toast.error(errorText(err, 'Couldn’t send that message.'));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.unread }),
  });
}

export function buildPending(body: string, attachments: DraftAttachment[], reply: ReplyTarget | null): PendingMessage {
  const createdAt = nowIso();
  return {
    id: uuid(),
    req: { body: body.trim(), attachments: attachments.map((a) => a.input), replyToId: reply?.id ?? null, clientCreatedAt: createdAt },
    status: 'sending',
    reply,
    labels: attachments.map((a) => a.label),
    createdAt,
  };
}

/** Compress and upload a chat photo, returning an attachment for the composer. */
export async function uploadChatPhoto(file: File): Promise<DraftAttachment> {
  const c = await compressImage(file);
  const form = new FormData();
  form.append('file', c.blob, c.blob.type === 'image/webp' ? 'photo.webp' : 'photo.jpg');
  form.append('kind', 'chat');
  const up = await api.media.upload(form);
  return { key: `image:${up.id}`, input: { type: 'image', imageId: up.id }, label: 'Photo', thumbUrl: up.thumbUrl ?? c.previewUrl };
}

/** Presence heartbeat while Chat is open and visible (suppresses mention pushes). */
export function sendPresence() {
  return api.chat.presence().catch(() => undefined);
}
