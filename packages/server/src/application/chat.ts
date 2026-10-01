import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import type { AttachmentDto, AttachmentInput, ChatChangesResponse, ChatMemberDto, ChatMessageDto, ChatPageResponse, MemeDto, SendMessageRequest } from '@clubhouse/contracts';
import { bandFor, messageContains } from '@clubhouse/domain';
import { schema as s, type AttachmentJson } from '@clubhouse/db';
import type { Container } from '../container';
import { initials } from '../lib/crypto';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';
import { imageUrlMap, pick } from './images';
import { notifyUser } from './notify';
import { hitRateLimit, LIMITS } from './rateLimit';
import { signalTeam } from './realtime';
import { getTeam } from './team';

type MessageRow = typeof s.messages.$inferSelect;

export async function teamChannel(c: Container, teamId: string) {
  let ch = await c.db.query.channels.findFirst({ where: eq(s.channels.teamId, teamId) });
  if (!ch) [ch] = await c.db.insert(s.channels).values({ teamId, name: 'The Clubhouse' }).returning();
  return ch!;
}

export interface SystemPost {
  systemKind: string;
  body: string;
  attachments?: AttachmentJson[];
  mentions?: string[];
  meta?: Record<string, unknown>;
  memeId?: string | null;
  replyToId?: string | null;
  pinned?: boolean;
  test?: boolean;
}

/** SYS-CHAT-05: server-generated posts attributed to "Clubhouse". */
export async function postSystemMessage(c: Container, teamId: string, p: SystemPost) {
  const ch = await teamChannel(c, teamId);
  const [row] = await c.db
    .insert(s.messages)
    .values({
      id: randomUUID(),
      channelId: ch.id,
      userId: null,
      kind: 'system',
      systemKind: p.systemKind,
      body: p.body,
      attachments: p.attachments ?? (p.memeId ? [{ type: 'meme', memeId: p.memeId }] : []),
      mentions: p.mentions ?? [],
      memeId: p.memeId ?? null,
      replyToId: p.replyToId ?? null,
      pinned: !!p.pinned,
      test: !!p.test,
      meta: p.meta ?? {},
    })
    .returning();
  await signalTeam(c, teamId, 'chat.message', { seq: row!.seq });
  await scheduleDigests(c, teamId, null);
  return row!;
}

/* ───────── Reading ───────── */

export async function renderMessages(c: Container, viewer: AuthUser, rows: MessageRow[]): Promise<ChatMessageDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
  const att = rows.flatMap((r) => r.attachments);
  const foodIds = att.filter((a) => a.type === 'food_log').map((a) => (a as { id: string }).id);
  const actIds = att.filter((a) => a.type === 'activity_log').map((a) => (a as { id: string }).id);
  const memeIds = [...new Set([...att.filter((a) => a.type === 'meme').map((a) => (a as { memeId: string }).memeId), ...rows.flatMap((r) => ((r.meta.memeReactions as { memeId: string }[] | undefined) ?? []).map((m) => m.memeId))])];
  const dayCards = att.filter((a) => a.type === 'day_card') as { type: 'day_card'; userId: string; date: string }[];

  const [authors, replies, reactions, foods, acts, memes] = await Promise.all([
    authorIds.length ? c.db.select().from(s.users).where(inArray(s.users.id, authorIds)) : [],
    replyIds.length ? c.db.select().from(s.messages).where(inArray(s.messages.id, replyIds)) : [],
    c.db.select({ r: s.reactions, name: s.users.displayName }).from(s.reactions).innerJoin(s.users, eq(s.users.id, s.reactions.userId)).where(inArray(s.reactions.messageId, ids)),
    foodIds.length ? c.db.select().from(s.foodLogs).where(inArray(s.foodLogs.id, foodIds)) : [],
    actIds.length ? c.db.select({ log: s.activityLogs, type: s.activityTypes }).from(s.activityLogs).innerJoin(s.activityTypes, eq(s.activityTypes.id, s.activityLogs.typeId)).where(inArray(s.activityLogs.id, actIds)) : [],
    memeIds.length ? c.db.select().from(s.memes).where(inArray(s.memes.id, memeIds)) : [],
  ]);
  const replyAuthors = replies.length ? await c.db.select().from(s.users).where(inArray(s.users.id, replies.map((r) => r.userId).filter((x): x is string => !!x))) : [];
  const avatarIds = [...authors.map((a) => a.avatarImageId)];
  const imgIds = [...att.filter((a) => a.type === 'image').map((a) => (a as { imageId: string }).imageId), ...foods.map((f) => f.imageId), ...memes.map((m) => m.imageId), ...avatarIds];
  const images = await imageUrlMap(c, imgIds);
  const authorMap = new Map(authors.map((a) => [a.id, a]));
  const cardData = new Map<string, AttachmentDto>();
  if (dayCards.length) {
    const team = await getTeam(c, viewer.teamId);
    for (const d of dayCards) {
      const fact = await c.db.query.dayFacts.findFirst({ where: and(eq(s.dayFacts.userId, d.userId), eq(s.dayFacts.date, d.date)) });
      const u = await c.db.query.users.findFirst({ where: eq(s.users.id, d.userId) });
      const [cnt] = await c.db.select({ n: sql<number>`count(*)::int` }).from(s.foodLogs).where(and(eq(s.foodLogs.userId, d.userId), eq(s.foodLogs.date, d.date), isNull(s.foodLogs.deletedAt)));
      const eaten = fact?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
      cardData.set(`${d.userId}:${d.date}`, {
        type: 'day_card',
        userId: d.userId,
        date: d.date,
        name: u?.displayName ?? 'Member',
        eaten,
        targetKcal: fact?.kcalTarget ?? null,
        burned: Math.round(fact?.kcalBurned ?? 0),
        bandLabel: fact?.kcalTarget ? bandFor('kcal', eaten.kcal, fact.kcalTarget, team.settings.thresholds, true).label : null,
        logged: cnt?.n ?? 0,
      });
    }
  }
  const person = (id: string | null) => {
    if (!id) return null;
    const u = authorMap.get(id);
    if (!u) return { id, name: 'Former member', initials: '?', avatarUrl: null };
    const av = pick(images, u.avatarImageId);
    return { id: u.id, name: u.displayName, initials: initials(u.displayName), avatarUrl: av.thumbUrl ?? av.url };
  };
  return rows.map((r) => {
    const reply = r.replyToId ? replies.find((x) => x.id === r.replyToId) : null;
    const replyAuthor = reply?.userId ? replyAuthors.find((u) => u.id === reply.userId) : null;
    const grouped = new Map<string, { count: number; mine: boolean; names: string[] }>();
    for (const rx of reactions.filter((x) => x.r.messageId === r.id)) {
      const g = grouped.get(rx.r.emoji) ?? { count: 0, mine: false, names: [] };
      g.count++;
      g.names.push(rx.name);
      if (rx.r.userId === viewer.id) g.mine = true;
      grouped.set(rx.r.emoji, g);
    }
    const deleted = !!r.deletedAt;
    const attachments: AttachmentDto[] = deleted
      ? []
      : r.attachments.map((a): AttachmentDto => {
          if (a.type === 'image') {
            const im = pick(images, a.imageId);
            return { type: 'image', imageId: a.imageId, url: im.url, thumbUrl: im.thumbUrl, expired: im.expired };
          }
          if (a.type === 'food_log') {
            const f = foods.find((x) => x.id === a.id);
            if (!f || f.deletedAt) return { type: 'food_log', id: a.id, removed: true, mealSlot: null, items: [], kcal: 0, thumbUrl: null, date: null, mine: false };
            return { type: 'food_log', id: a.id, removed: false, mealSlot: f.mealSlot, items: f.items.map((i) => i.name), kcal: Math.round(f.totals.kcal), thumbUrl: pick(images, f.imageId).thumbUrl, date: f.date, mine: f.userId === viewer.id };
          }
          if (a.type === 'activity_log') {
            const x = acts.find((y) => y.log.id === a.id);
            if (!x || x.log.deletedAt) return { type: 'activity_log', id: a.id, removed: true, typeName: null, icon: null, durationMin: null, distanceKm: null, kcal: 0, date: null, mine: false };
            return { type: 'activity_log', id: a.id, removed: false, typeName: x.type.name, icon: x.type.icon, durationMin: x.log.durationMin, distanceKm: x.log.distanceKm, kcal: Math.round(x.log.kcalBurned), date: x.log.date, mine: x.log.userId === viewer.id };
          }
          if (a.type === 'day_card') return cardData.get(`${a.userId}:${a.date}`) ?? { type: 'day_card', userId: a.userId, date: a.date, name: 'Member', eaten: { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }, targetKcal: null, burned: 0, bandLabel: null, logged: 0 };
          const m = memes.find((x) => x.id === a.memeId);
          return { type: 'meme', memeId: a.memeId, url: m ? pick(images, m.imageId).url : null, caption: m?.caption ?? '' };
        });
    return {
      id: r.id,
      seq: r.seq,
      kind: r.kind as ChatMessageDto['kind'],
      systemKind: r.systemKind,
      author: r.kind === 'user' ? person(r.userId) : null,
      body: deleted ? '' : r.body,
      attachments,
      replyTo: reply ? { id: reply.id, authorName: reply.userId ? (replyAuthor?.displayName ?? 'Member') : 'Clubhouse', body: reply.deletedAt ? '' : reply.body.slice(0, 140), removed: !!reply.deletedAt } : null,
      mentions: r.mentions,
      reactions: [...grouped.entries()].map(([emoji, g]) => ({ emoji, ...g })),
      memeReactions: ((r.meta.memeReactions as { memeId: string }[] | undefined) ?? []).map((m) => ({ memeId: m.memeId, url: (() => { const mm = memes.find((x) => x.id === m.memeId); return mm ? pick(images, mm.imageId).url : null; })() })),
      pinned: r.pinned,
      aiGenerated: r.aiGenerated,
      test: r.test,
      createdAt: r.createdAt.toISOString(),
      deleted,
      deletedByAdmin: deleted && !!r.deletedBy && r.deletedBy !== r.userId,
      mine: r.userId === viewer.id,
      meta: r.meta,
    };
  });
}

export async function listMessages(c: Container, user: AuthUser, opts: { after?: number; before?: number; limit: number }): Promise<ChatPageResponse> {
  const ch = await teamChannel(c, user.teamId);
  const limit = Math.min(100, Math.max(1, opts.limit));
  let rows: MessageRow[];
  if (opts.after != null) {
    rows = await c.db.query.messages.findMany({ where: and(eq(s.messages.channelId, ch.id), gt(s.messages.seq, opts.after)), orderBy: [asc(s.messages.seq)], limit });
  } else {
    const where = opts.before != null ? and(eq(s.messages.channelId, ch.id), lt(s.messages.seq, opts.before)) : eq(s.messages.channelId, ch.id);
    rows = (await c.db.query.messages.findMany({ where, orderBy: [desc(s.messages.seq)], limit: limit + 1 })).reverse();
  }
  const hasMoreBefore = opts.after == null && rows.length > limit;
  if (hasMoreBefore) rows = rows.slice(1);
  return { messages: await renderMessages(c, user, rows), hasMoreBefore, ...(await chatMeta(c, user, ch.id)) };
}

/** Everything about the channel besides the messages themselves: pins, read position, latest seq, mute. */
async function chatMeta(c: Container, user: AuthUser, channelId: string) {
  const [pinnedRows, read, [latest], mute] = await Promise.all([
    c.db.query.messages.findMany({ where: and(eq(s.messages.channelId, channelId), eq(s.messages.pinned, true), isNull(s.messages.deletedAt)), orderBy: [desc(s.messages.seq)], limit: 3 }),
    c.db.query.chatReads.findFirst({ where: eq(s.chatReads.userId, user.id) }),
    c.db.select({ seq: sql<number>`coalesce(max(${s.messages.seq}), 0)::bigint` }).from(s.messages).where(eq(s.messages.channelId, channelId)),
    c.db.query.chatMutes.findFirst({ where: eq(s.chatMutes.userId, user.id) }),
  ]);
  return {
    pinned: await renderMessages(c, user, pinnedRows),
    lastReadSeq: read?.lastReadSeq ?? 0,
    latestSeq: Number(latest?.seq ?? 0),
    muted: mute && mute.until > c.clock.now() ? { until: mute.until.toISOString(), reason: mute.reason } : null,
  };
}

/* ───────── Browser cache revalidation (delta feed) ───────── */

const CHAT_OVERLAP_MS = 2 * 60_000;
/** More changes than this since the client's last sync: cheaper to reload the latest page than to stream them. */
const CHAT_MAX_DELTA = 400;
const epochKey = (teamId: string) => `chat.epoch:${teamId}`;

/** The chat epoch moves whenever messages are hard-deleted (admin "clear by period"); caches must then reset. */
export async function chatEpoch(c: Container, teamId: string): Promise<string> {
  const row = await c.db.query.settingsKv.findFirst({ where: eq(s.settingsKv.key, epochKey(teamId)) });
  return typeof row?.value === 'string' ? row.value : '0';
}

export async function bumpChatEpoch(c: Pick<Container, 'db'>, teamId: string, by: string | null) {
  const value = `${Date.now().toString(36)}`;
  await c.db
    .insert(s.settingsKv)
    .values({ key: epochKey(teamId), value, updatedBy: by })
    .onConflictDoUpdate({ target: s.settingsKv.key, set: { value, updatedBy: by, updatedAt: new Date() } });
}

/** See ChatChangesResponse: latest page on first load, then everything created or changed since `since`. */
export async function chatChanges(c: Container, user: AuthUser, q: { since?: string; epoch?: string; limit: number }): Promise<ChatChangesResponse> {
  const ch = await teamChannel(c, user.teamId);
  const [{ now }] = (await c.db.execute<{ now: string }>(sql`select now()::text as now`)) as unknown as [{ now: string }];
  const syncedAt = new Date(now).toISOString();
  const epoch = await chatEpoch(c, user.teamId);
  const fresh = async (reset: boolean): Promise<ChatChangesResponse> => ({ ...(await listMessages(c, user, { limit: q.limit })), epoch, reset, syncedAt });
  if (!q.since) return fresh(false);
  if (q.epoch && q.epoch !== epoch) return fresh(true);
  const from = new Date(new Date(q.since).getTime() - CHAT_OVERLAP_MS);
  const rows = await c.db.query.messages.findMany({
    where: and(eq(s.messages.channelId, ch.id), sql`${s.messages.updatedAt} > ${from.toISOString()}::timestamptz`),
    orderBy: [asc(s.messages.seq)],
    limit: CHAT_MAX_DELTA + 1,
  });
  if (rows.length > CHAT_MAX_DELTA) return fresh(true);
  // hasMoreBefore is a property of the initial page; a delta never changes it (the client keeps its own).
  return { messages: await renderMessages(c, user, rows), hasMoreBefore: true, ...(await chatMeta(c, user, ch.id)), epoch, reset: false, syncedAt };
}

export async function renderOne(c: Container, user: AuthUser, id: string) {
  const row = await c.db.query.messages.findFirst({ where: eq(s.messages.id, id) });
  if (!row) throw notFound('Message not found.');
  return (await renderMessages(c, user, [row]))[0]!;
}

/* ───────── Writing ───────── */

async function resolveMentions(c: Container, teamId: string, body: string): Promise<string[]> {
  const handles = [...body.matchAll(/(^|\s)@([a-z0-9._-]{2,30})/gi)].map((m) => m[2]!.toLowerCase());
  if (!handles.length) return [];
  const rows = await c.db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.teamId, teamId), eq(s.users.status, 'active'), inArray(sql`lower(${s.users.username})`, handles)));
  return rows.map((r) => r.id);
}

async function validateAttachments(c: Container, user: AuthUser, atts: AttachmentInput[]): Promise<AttachmentJson[]> {
  const out: AttachmentJson[] = [];
  for (const a of atts) {
    if (a.type === 'image') {
      const im = await c.db.query.images.findFirst({ where: and(eq(s.images.id, a.imageId), eq(s.images.ownerId, user.id)) });
      if (!im) throw badRequest('That photo isn’t available.', 'bad_attachment');
      out.push({ type: 'image', imageId: a.imageId });
    } else if (a.type === 'food_log') {
      const f = await c.db.query.foodLogs.findFirst({ where: and(eq(s.foodLogs.id, a.id), eq(s.foodLogs.userId, user.id)) });
      if (!f) throw badRequest('You can tag your own logs only.', 'bad_attachment');
      out.push({ type: 'food_log', id: a.id });
    } else if (a.type === 'activity_log') {
      const x = await c.db.query.activityLogs.findFirst({ where: and(eq(s.activityLogs.id, a.id), eq(s.activityLogs.userId, user.id)) });
      if (!x) throw badRequest('You can tag your own logs only.', 'bad_attachment');
      out.push({ type: 'activity_log', id: a.id });
    } else if (a.type === 'day_card') {
      out.push({ type: 'day_card', userId: user.id, date: a.date });
    } else {
      const m = await c.db.query.memes.findFirst({ where: and(eq(s.memes.id, a.memeId), eq(s.memes.teamId, user.teamId), eq(s.memes.enabled, true), eq(s.memes.status, 'approved')) });
      if (!m) throw badRequest('That meme isn’t available.', 'bad_attachment');
      out.push({ type: 'meme', memeId: a.memeId });
    }
  }
  return out;
}

/** Schedule a chat digest for everyone except the author who has none pending (SYS-NOTIF-07). */
export async function scheduleDigests(c: Container, teamId: string, authorId: string | null) {
  const team = await getTeam(c, teamId);
  const at = new Date(c.clock.now().getTime() + team.settings.chat.digestMinutes * 60_000);
  const members = await c.db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.teamId, teamId), eq(s.users.status, 'active'), authorId ? ne(s.users.id, authorId) : sql`true`));
  for (const m of members) {
    await c.db
      .insert(s.notificationSchedules)
      .values({ userId: m.id, type: 'chat_digest', nextSendAt: at })
      .onConflictDoUpdate({ target: [s.notificationSchedules.userId, s.notificationSchedules.type], set: { nextSendAt: sql`coalesce(${s.notificationSchedules.nextSendAt}, ${at.toISOString()}::timestamptz)` } });
  }
}

export async function sendMessage(c: Container, user: AuthUser, id: string, input: SendMessageRequest) {
  const existing = await c.db.query.messages.findFirst({ where: eq(s.messages.id, id) });
  if (existing) {
    if (existing.userId !== user.id) throw notFound();
    return { message: await renderOne(c, user, id), duplicate: true };
  }
  await hitRateLimit(c, `chat:${user.id}`, LIMITS.chat.limit, LIMITS.chat.windowSec, 'You’re sending messages very fast. Take a breath.');
  const mute = await c.db.query.chatMutes.findFirst({ where: eq(s.chatMutes.userId, user.id) });
  if (mute && mute.until > c.clock.now()) throw new AppError(403, 'muted', `You can read the chat but not post until ${mute.until.toLocaleString('en-IN', { timeZone: user.timezone })}. Reason: ${mute.reason}`);
  const ch = await teamChannel(c, user.teamId);
  const attachments = await validateAttachments(c, user, input.attachments);
  const mentions = await resolveMentions(c, user.teamId, input.body);
  const team = await getTeam(c, user.teamId);
  const flagged = team.settings.chat.keywords.filter((k) => messageContains(input.body, [k]));
  let replyToId: string | null = null;
  if (input.replyToId) {
    const target = await c.db.query.messages.findFirst({ where: and(eq(s.messages.id, input.replyToId), eq(s.messages.channelId, ch.id)) });
    if (target) replyToId = target.id;
  }
  const [row] = await c.db
    .insert(s.messages)
    .values({ id, channelId: ch.id, userId: user.id, kind: 'user', body: input.body.trim(), attachments, replyToId, mentions, flaggedKeywords: flagged, clientCreatedAt: input.clientCreatedAt ? new Date(input.clientCreatedAt) : null })
    .onConflictDoNothing()
    .returning();
  if (!row) return { message: await renderOne(c, user, id), duplicate: true };
  await c.db.insert(s.chatReads).values({ userId: user.id, lastReadSeq: row.seq }).onConflictDoUpdate({ target: s.chatReads.userId, set: { lastReadSeq: sql`greatest(${s.chatReads.lastReadSeq}, ${row.seq})` } });
  await signalTeam(c, user.teamId, 'chat.message', { seq: row.seq });

  // Mentions and replies are immediate; everything else is batched into the digest.
  const notified = new Set<string>();
  const onChat = async (uid: string) => {
    const r = await c.db.query.chatReads.findFirst({ where: eq(s.chatReads.userId, uid) });
    return !!r?.onChatUntil && r.onChatUntil > c.clock.now();
  };
  for (const uid of mentions.filter((m) => m !== user.id)) {
    if (await onChat(uid)) continue;
    notified.add(uid);
    await notifyUser(c, uid, { type: 'chat_mention', title: `${user.displayName} mentioned you`, body: input.body.slice(0, 140) || 'Tagged a log', url: `/chat?seq=${row.seq}`, tag: `chat-mention-${row.seq}`, dedupeKey: `mention:${row.id}:${uid}` });
  }
  if (replyToId) {
    const target = await c.db.query.messages.findFirst({ where: eq(s.messages.id, replyToId) });
    if (target?.userId && target.userId !== user.id && !notified.has(target.userId) && !(await onChat(target.userId))) {
      await notifyUser(c, target.userId, { type: 'chat_mention', title: `${user.displayName} replied to you`, body: input.body.slice(0, 140) || 'Replied', url: `/chat?seq=${row.seq}`, tag: `chat-reply-${row.seq}`, dedupeKey: `reply:${row.id}` });
    }
  }
  await scheduleDigests(c, user.teamId, user.id);
  const { runChatTriggers } = await import('./memeEngine');
  await runChatTriggers(c, user, row).catch(() => undefined);
  return { message: await renderOne(c, user, id), duplicate: false };
}

export async function deleteOwnMessage(c: Container, user: AuthUser, id: string) {
  const m = await c.db.query.messages.findFirst({ where: eq(s.messages.id, id) });
  if (!m || m.userId !== user.id) throw notFound('Message not found.');
  await c.db.update(s.messages).set({ deletedAt: c.clock.now(), deletedBy: user.id }).where(eq(s.messages.id, id));
  await signalTeam(c, user.teamId, 'chat.message', { seq: m.seq, updated: true });
}

export async function react(c: Container, user: AuthUser, messageId: string, emoji: string, on: boolean) {
  const m = await c.db.query.messages.findFirst({ where: eq(s.messages.id, messageId) });
  if (!m || m.deletedAt) throw notFound('Message not found.');
  const ch = await teamChannel(c, user.teamId);
  if (m.channelId !== ch.id) throw forbidden();
  if (on) {
    const [r] = await c.db.insert(s.reactions).values({ messageId, userId: user.id, emoji }).onConflictDoNothing().returning();
    if (r && m.memeId) await c.db.update(s.memeFires).set({ reactions: sql`${s.memeFires.reactions} + 1` }).where(eq(s.memeFires.messageId, messageId));
  } else {
    await c.db.delete(s.reactions).where(and(eq(s.reactions.messageId, messageId), eq(s.reactions.userId, user.id), eq(s.reactions.emoji, emoji)));
  }
  await signalTeam(c, user.teamId, 'chat.reaction', { messageId });
}

export async function report(c: Container, user: AuthUser, messageId: string, reason: string) {
  const m = await c.db.query.messages.findFirst({ where: eq(s.messages.id, messageId) });
  if (!m) throw notFound('Message not found.');
  await c.db.insert(s.messageReports).values({ messageId, reporterId: user.id, reason });
}

export async function markRead(c: Container, user: AuthUser, seq: number) {
  await c.db.insert(s.chatReads).values({ userId: user.id, lastReadSeq: seq }).onConflictDoUpdate({ target: s.chatReads.userId, set: { lastReadSeq: sql`greatest(${s.chatReads.lastReadSeq}, ${seq})`, updatedAt: c.clock.now() } });
  await c.db.update(s.notificationSchedules).set({ nextSendAt: null }).where(and(eq(s.notificationSchedules.userId, user.id), eq(s.notificationSchedules.type, 'chat_digest')));
}

/** Presence while the Chat tab is open suppresses mention pushes and digests (Appendix C). */
export async function presence(c: Container, user: AuthUser) {
  const until = new Date(c.clock.now().getTime() + 75_000);
  await c.db.insert(s.chatReads).values({ userId: user.id, lastReadSeq: 0, onChatUntil: until }).onConflictDoUpdate({ target: s.chatReads.userId, set: { onChatUntil: until } });
}

export async function unreadChatCount(c: Container, user: AuthUser): Promise<number> {
  const ch = await teamChannel(c, user.teamId);
  const read = await c.db.query.chatReads.findFirst({ where: eq(s.chatReads.userId, user.id) });
  const [r] = await c.db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.messages)
    .where(and(eq(s.messages.channelId, ch.id), gt(s.messages.seq, read?.lastReadSeq ?? 0), isNull(s.messages.deletedAt), sql`${s.messages.userId} is distinct from ${user.id}`, eq(s.messages.test, false)));
  return r?.n ?? 0;
}

export async function chatMembers(c: Container, user: AuthUser): Promise<ChatMemberDto[]> {
  const rows = await c.db.query.users.findMany({ where: and(eq(s.users.teamId, user.teamId), eq(s.users.status, 'active')), orderBy: [asc(s.users.displayName)] });
  const images = await imageUrlMap(c, rows.map((r) => r.avatarImageId));
  return rows.map((u) => ({ id: u.id, name: u.displayName, initials: initials(u.displayName), avatarUrl: pick(images, u.avatarImageId).thumbUrl, username: u.username, role: u.role }));
}

export async function memeLibrary(c: Container, teamId: string, opts: { includeDisabled?: boolean; includePending?: boolean } = {}): Promise<MemeDto[]> {
  const rows = await c.db.query.memes.findMany({ where: and(eq(s.memes.teamId, teamId), isNull(s.memes.deletedAt)), orderBy: [desc(s.memes.createdAt)] });
  const visible = rows.filter((m) => (opts.includeDisabled || m.enabled) && (opts.includePending || m.status === 'approved'));
  const images = await imageUrlMap(c, visible.map((m) => m.imageId));
  const suggesters = await c.db.select().from(s.users).where(inArray(s.users.id, visible.map((m) => m.suggestedBy).filter((x): x is string => !!x).concat(['00000000-0000-0000-0000-000000000000'])));
  const reactionCounts = await c.db.select({ memeId: s.memeFires.memeId, n: sql<number>`coalesce(sum(${s.memeFires.reactions}), 0)::int` }).from(s.memeFires).where(eq(s.memeFires.teamId, teamId)).groupBy(s.memeFires.memeId);
  return visible.map((m) => {
    const im = pick(images, m.imageId);
    const sug = suggesters.find((u) => u.id === m.suggestedBy);
    return {
      id: m.id,
      url: im.url,
      thumbUrl: im.thumbUrl,
      caption: m.caption,
      tags: m.tags,
      tone: m.tone as MemeDto['tone'],
      enabled: m.enabled,
      status: m.status as MemeDto['status'],
      uses: m.uses,
      lastUsedAt: m.lastUsedAt?.toISOString() ?? null,
      reactions: reactionCounts.find((r) => r.memeId === m.id)?.n ?? 0,
      suggestedBy: sug ? { id: sug.id, name: sug.displayName, initials: initials(sug.displayName), avatarUrl: null } : null,
    };
  });
}

/** ADM-MEME-03: members suggest memes from chat; they wait as pending for an admin. */
export async function suggestMeme(c: Container, user: AuthUser, imageId: string, caption: string) {
  const im = await c.db.query.images.findFirst({ where: and(eq(s.images.id, imageId), eq(s.images.ownerId, user.id)) });
  if (!im) throw badRequest('Upload the image first.', 'bad_image');
  await c.db.update(s.images).set({ kind: 'meme', expiresAt: null }).where(eq(s.images.id, imageId));
  const [m] = await c.db.insert(s.memes).values({ teamId: user.teamId, imageId, caption, tags: ['custom'], tone: 'neutral', enabled: false, status: 'pending', suggestedBy: user.id }).returning();
  return m!;
}
