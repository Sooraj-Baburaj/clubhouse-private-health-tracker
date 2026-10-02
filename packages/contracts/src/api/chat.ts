import { z } from 'zod';
import { IsoDateTime, LocalDateStr, type Nutrients, type PersonRef } from './common';

export const AttachmentInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('image'), imageId: z.string().uuid() }),
  z.object({ type: z.literal('food_log'), id: z.string().uuid() }),
  z.object({ type: z.literal('activity_log'), id: z.string().uuid() }),
  z.object({ type: z.literal('day_card'), date: LocalDateStr }),
  z.object({ type: z.literal('meme'), memeId: z.string().uuid() }),
]);
export type AttachmentInput = z.infer<typeof AttachmentInput>;

export const SendMessageRequest = z
  .object({
    body: z.string().max(2000),
    attachments: z.array(AttachmentInput).max(4),
    replyToId: z.string().uuid().nullable().optional(),
    clientCreatedAt: IsoDateTime.optional(),
  })
  .refine((m) => m.body.trim().length > 0 || m.attachments.length > 0, 'Write something or attach a log.');
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const ReactRequest = z.object({ emoji: z.string().min(1).max(16), on: z.boolean() });
export const ReportRequest = z.object({ reason: z.string().trim().min(3).max(300) });

export type AttachmentDto =
  | { type: 'image'; imageId: string; url: string | null; thumbUrl: string | null; expired: boolean }
  | { type: 'food_log'; id: string; removed: boolean; mealSlot: string | null; items: string[]; kcal: number; thumbUrl: string | null; date: string | null; mine: boolean }
  | { type: 'activity_log'; id: string; removed: boolean; typeName: string | null; icon: string | null; durationMin: number | null; distanceKm: number | null; kcal: number; date: string | null; mine: boolean }
  | { type: 'day_card'; userId: string; date: string; name: string; eaten: Nutrients; targetKcal: number | null; burned: number; bandLabel: string | null; logged: number }
  | { type: 'meme'; memeId: string; url: string | null; width: number | null; height: number | null; caption: string };

export interface ChatMessageDto {
  id: string;
  seq: number;
  kind: 'user' | 'system' | 'divider';
  systemKind: string | null;
  author: PersonRef | null;
  body: string;
  attachments: AttachmentDto[];
  replyTo: { id: string; authorName: string; body: string; removed: boolean } | null;
  mentions: string[];
  reactions: { emoji: string; count: number; mine: boolean; names: string[] }[];
  memeReactions: { memeId: string; url: string | null }[];
  pinned: boolean;
  aiGenerated: boolean;
  test: boolean;
  createdAt: string;
  deleted: boolean;
  deletedByAdmin: boolean;
  mine: boolean;
  meta: Record<string, unknown>;
}

export interface ChatPageResponse {
  messages: ChatMessageDto[];
  pinned: ChatMessageDto[];
  lastReadSeq: number;
  latestSeq: number;
  hasMoreBefore: boolean;
  muted: { until: string; reason: string } | null;
}

export interface ChatMemberDto extends PersonRef {
  username: string;
  role: string;
}

export interface MemeDto {
  id: string;
  url: string | null;
  thumbUrl: string | null;
  caption: string;
  tags: string[];
  tone: 'roast' | 'celebrate' | 'neutral';
  enabled: boolean;
  status: 'approved' | 'pending';
  uses: number;
  lastUsedAt: string | null;
  reactions: number;
  suggestedBy: PersonRef | null;
}

/**
 * GET /chat/changes — the browser chat cache's revalidation feed. Without `since`: the latest page (like
 * /chat/messages). With `since`: every message created or changed after it (edits, deletions, pins, reactions), with
 * a safety overlap. `reset` means the cache must be dropped and reloaded (too many changes, or `epoch` moved because
 * an admin cleared a period). `syncedAt` is the `since` for the next call.
 */
export interface ChatChangesResponse {
  epoch: string;
  reset: boolean;
  messages: ChatMessageDto[];
  pinned: ChatMessageDto[];
  lastReadSeq: number;
  latestSeq: number;
  hasMoreBefore: boolean;
  muted: { until: string; reason: string } | null;
  syncedAt: string;
}

export const ChatChangesQuery = z.object({ since: IsoDateTime.optional(), epoch: z.string().max(64).optional(), limit: z.coerce.number().int().min(10).max(100).default(60) });
