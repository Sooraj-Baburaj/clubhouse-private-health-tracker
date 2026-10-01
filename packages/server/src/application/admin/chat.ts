import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, sql, type SQL } from 'drizzle-orm';
import type { AnnouncementDto, AnnouncementRequest, ChatMessageDto, ClearChatRequest, MuteRequest, PersonRef, ReportResolveRequest } from '@clubhouse/contracts';
import { startOfLocalDay, addDays } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { z } from 'zod';
import type { Container } from '../../container';
import { log } from '../../lib/log';
import { badRequest, notFound } from '../../lib/errors';
import { bumpChatEpoch, postSystemMessage, renderMessages, teamChannel } from '../chat';
import { notifyUser } from '../notify';
import { signalTeam, signalUser } from '../realtime';
import { getTeam, invalidateTeam } from '../team';
import { assertCanManage, getMember, logAudit, personMap, personOf, teamUsers, type Actor } from './shared';

export const CLEAR_CONFIRM_WORD = 'CLEAR';

function parseBound(v: string | undefined, tz: string, end: boolean): Date | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return startOfLocalDay(end ? addDays(v, 1) : v, tz);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw badRequest('Invalid date.', 'invalid_date');
  return d;
}

export async function listMessages(c: Container, a: Actor, q: { q?: string; userId?: string; from?: string; to?: string; reported?: '1'; before?: number; limit: number }) {
  const team = await getTeam(c, a.user.teamId);
  const ch = await teamChannel(c, a.user.teamId);
  const conds: SQL[] = [eq(s.messages.channelId, ch.id)];
  if (q.q?.trim()) conds.push(sql`${s.messages.body} ilike ${`%${q.q.trim().replace(/[%_]/g, '')}%`}`);
  if (q.userId) conds.push(eq(s.messages.userId, q.userId));
  const from = parseBound(q.from, team.timezone, false);
  const to = parseBound(q.to, team.timezone, true);
  if (from) conds.push(gte(s.messages.createdAt, from));
  if (to) conds.push(lt(s.messages.createdAt, to));
  if (q.before != null) conds.push(lt(s.messages.seq, q.before));
  if (q.reported === '1') conds.push(sql`exists (select 1 from ${s.messageReports} r where r.message_id = ${s.messages.id} and r.status = 'open')`);
  const rows = await c.db.select().from(s.messages).where(and(...conds)).orderBy(desc(s.messages.seq)).limit(q.limit + 1);
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  const rendered = await renderMessages(c, a.user, page);
  const reports = page.length
    ? await c.db.select({ messageId: s.messageReports.messageId, n: sql<number>`count(*)::int` }).from(s.messageReports).where(and(inArray(s.messageReports.messageId, page.map((m) => m.id)), eq(s.messageReports.status, 'open'))).groupBy(s.messageReports.messageId)
    : [];
  return {
    messages: rendered.map((m, i) => ({ ...m, reports: reports.find((r) => r.messageId === m.id)?.n ?? 0, flaggedKeywords: page[i]!.flaggedKeywords })),
    hasMore,
  };
}

async function teamMessage(c: Container, teamId: string, id: string) {
  const ch = await teamChannel(c, teamId);
  const m = await c.db.query.messages.findFirst({ where: and(eq(s.messages.id, id), eq(s.messages.channelId, ch.id)) });
  if (!m) throw notFound('Message not found.');
  return m;
}

export async function pin(c: Container, a: Actor, id: string, on: boolean) {
  const m = await teamMessage(c, a.user.teamId, id);
  if (on && m.deletedAt) throw badRequest('A removed message can’t be pinned.', 'deleted_message');
  await c.db.update(s.messages).set({ pinned: on }).where(eq(s.messages.id, m.id));
  await logAudit(c, a, { action: on ? 'chat.pin' : 'chat.unpin', targetType: 'message', targetId: m.id, memberId: m.userId, before: { pinned: m.pinned }, after: { pinned: on } });
  await signalTeam(c, a.user.teamId, 'chat.message', { seq: m.seq, updated: true });
}

/** ADM-CHAT-03: removal shows "removed by an admin" to everyone (deleted_by ≠ author). */
export async function deleteMessage(c: Container, a: Actor, id: string) {
  const m = await teamMessage(c, a.user.teamId, id);
  if (m.deletedAt) return;
  await c.db.update(s.messages).set({ deletedAt: c.clock.now(), deletedBy: a.user.id, pinned: false }).where(eq(s.messages.id, m.id));
  await c.db.update(s.messageReports).set({ status: 'deleted', handledBy: a.user.id, handledAt: c.clock.now() }).where(and(eq(s.messageReports.messageId, m.id), eq(s.messageReports.status, 'open')));
  await logAudit(c, a, { action: 'chat.delete', targetType: 'message', targetId: m.id, memberId: m.userId, before: { body: m.body.slice(0, 500), attachments: m.attachments.length } });
  await signalTeam(c, a.user.teamId, 'chat.message', { seq: m.seq, updated: true });
}

/* ───────── Announcements ───────── */

type AnnouncementRow = typeof s.announcements.$inferSelect;
const annKey = (id: string, userId: string) => `ann:${id}:${userId}`;

async function inboxOnly(c: Container, userId: string, row: AnnouncementRow, deliverAfter: Date | null) {
  const [n] = await c.db
    .insert(s.notifications)
    .values({ userId, type: 'announcement', title: row.title, body: row.body.slice(0, 300), data: { url: '/chat', tag: 'announcement', link: row.link, announcementId: row.id }, dedupeKey: annKey(row.id, userId), deliverAfter, pushResult: deliverAfter ? 'scheduled' : 'inbox_only' })
    .onConflictDoNothing()
    .returning({ id: s.notifications.id });
  if (n && !deliverAfter) await signalUser(c, userId, 'inbox.new', { id: n.id });
}

/** Post the chat message and notify everyone for an announcement that is due now. */
async function deliver(c: Container, row: AnnouncementRow, alreadyNotified: boolean) {
  const msg = await postSystemMessage(c, row.teamId, { systemKind: 'announcement', body: `${row.title}\n\n${row.body}`, pinned: row.pinned, meta: { title: row.title, link: row.link, announcementId: row.id } });
  await c.db.update(s.announcements).set({ sentAt: c.clock.now(), messageId: msg.id }).where(eq(s.announcements.id, row.id));
  if (alreadyNotified) return;
  const users = await teamUsers(c, row.teamId, { activeOnly: true });
  for (const u of users) {
    try {
      if (row.push) await notifyUser(c, u.id, { type: 'announcement', title: row.title, body: row.body.slice(0, 300), url: '/chat', tag: 'announcement', dedupeKey: annKey(row.id, u.id), data: { link: row.link, announcementId: row.id } });
      else await inboxOnly(c, u.id, row, null);
    } catch (e) {
      log.warn('admin.announcement_notify_failed', { announcementId: row.id, userId: u.id, error: (e as Error).message });
    }
  }
}

/**
 * Send scheduled announcements whose time has come (chat post + inbox rows for push-off announcements; pushes were
 * queued up front with `deliver_after`). Idempotent; the jobs tick can call this, and the admin list calls it too.
 */
export async function sendDueAnnouncements(c: Container, teamId?: string): Promise<number> {
  const due = await c.db.query.announcements.findMany({
    where: and(isNull(s.announcements.sentAt), isNotNull(s.announcements.scheduledFor), lte(s.announcements.scheduledFor, c.clock.now()), teamId ? eq(s.announcements.teamId, teamId) : undefined),
    limit: 20,
  });
  let n = 0;
  for (const row of due) {
    const [claimed] = await c.db.update(s.announcements).set({ sentAt: c.clock.now() }).where(and(eq(s.announcements.id, row.id), isNull(s.announcements.sentAt))).returning();
    if (!claimed) continue;
    await deliver(c, row, row.push);
    n++;
  }
  return n;
}

async function announcementDtos(c: Container, rows: AnnouncementRow[]): Promise<AnnouncementDto[]> {
  const people = await personMap(c, rows.map((r) => r.createdBy));
  const stats = rows.length
    ? ((await c.db.execute(sql`
        select split_part(dedupe_key, ':', 2) as id,
               count(*)::int as recipients,
               count(*) filter (where pushed_at is not null)::int as pushed,
               count(*) filter (where push_result ~ '^[0-9]+/[0-9]+$' and split_part(push_result, '/', 1)::int < split_part(push_result, '/', 2)::int)::int as failed,
               count(*) filter (where read_at is not null)::int as opened
        from ${s.notifications}
        where type = 'announcement' and dedupe_key like 'ann:%' and split_part(dedupe_key, ':', 2) in ${sql`(${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)})`}
        group by 1`)) as unknown as { id: string; recipients: number; pushed: number; failed: number; opened: number }[])
    : [];
  return rows.map((r) => {
    const st = stats.find((x) => x.id === r.id);
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      link: r.link,
      pinned: r.pinned,
      push: r.push,
      scheduledFor: r.scheduledFor?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      createdBy: personOf(people, r.createdBy),
      stats: st ? { recipients: Number(st.recipients), pushed: Number(st.pushed), failed: Number(st.failed), opened: Number(st.opened) } : r.stats,
    };
  });
}

export async function announce(c: Container, a: Actor, input: z.infer<typeof AnnouncementRequest>): Promise<AnnouncementDto> {
  const now = c.clock.now();
  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  const future = !!scheduledFor && scheduledFor.getTime() > now.getTime() + 30_000;
  const [row] = await c.db
    .insert(s.announcements)
    .values({ teamId: a.user.teamId, title: input.title, body: input.body, link: input.link ?? null, pinned: input.pin, push: input.push, scheduledFor: future ? scheduledFor : null, createdBy: a.user.id })
    .returning();
  if (future) {
    // Pushes wait in the inbox table until `deliver_after`; the tick's deferred delivery sends them.
    if (input.push) for (const u of await teamUsers(c, a.user.teamId, { activeOnly: true })) await inboxOnly(c, u.id, row!, scheduledFor);
  } else {
    await c.db.update(s.announcements).set({ sentAt: now }).where(eq(s.announcements.id, row!.id));
    await deliver(c, row!, false);
  }
  await logAudit(c, a, { action: 'chat.announce', targetType: 'announcement', targetId: row!.id, after: { title: input.title, pin: input.pin, push: input.push, scheduledFor: future ? scheduledFor!.toISOString() : null } });
  const fresh = await c.db.query.announcements.findFirst({ where: eq(s.announcements.id, row!.id) });
  return (await announcementDtos(c, [fresh!]))[0]!;
}

export async function listAnnouncements(c: Container, a: Actor) {
  await sendDueAnnouncements(c, a.user.teamId);
  const rows = await c.db.query.announcements.findMany({ where: eq(s.announcements.teamId, a.user.teamId), orderBy: [desc(s.announcements.createdAt)], limit: 100 });
  return announcementDtos(c, rows);
}

/* ───────── Clear by period ───────── */

async function rangeInfo(c: Container, teamId: string, from: Date, to: Date) {
  if (!(from < to)) throw badRequest('The start must be before the end.', 'bad_range');
  const ch = await teamChannel(c, teamId);
  const msgs = await c.db
    .select({ id: s.messages.id, attachments: s.messages.attachments, kind: s.messages.kind })
    .from(s.messages)
    .where(and(eq(s.messages.channelId, ch.id), gte(s.messages.createdAt, from), lte(s.messages.createdAt, to)));
  const imageIds = [...new Set(msgs.flatMap((m) => m.attachments.filter((x) => x.type === 'image').map((x) => (x as { imageId: string }).imageId)))];
  const images = imageIds.length ? await c.db.select({ id: s.images.id, key: s.images.storageKey, thumb: s.images.thumbKey }).from(s.images).where(and(inArray(s.images.id, imageIds), eq(s.images.teamId, teamId), isNull(s.images.purgedAt))) : [];
  return { ch, msgs, images };
}

export async function clearPreview(c: Container, a: Actor, from: string, to: string) {
  const r = await rangeInfo(c, a.user.teamId, new Date(from), new Date(to));
  return { messages: r.msgs.length, images: r.images.length, confirmWord: CLEAR_CONFIRM_WORD };
}

/** SYS-CHAT-12: hard-delete a period (messages, reactions, reports), purge its images, leave a divider. */
export async function clearChat(c: Container, a: Actor, input: z.infer<typeof ClearChatRequest>) {
  if ((input.confirm ?? '').trim().toUpperCase() !== CLEAR_CONFIRM_WORD) throw badRequest(`Type ${CLEAR_CONFIRM_WORD} to confirm.`, 'confirm_required', { confirm: `Type ${CLEAR_CONFIRM_WORD}` });
  const from = new Date(input.from);
  const to = new Date(input.to);
  const { ch, msgs, images } = await rangeInfo(c, a.user.teamId, from, to);
  const now = c.clock.now();
  const ids = msgs.map((m) => m.id);
  await c.db.transaction(async (tx) => {
    if (images.length) await tx.update(s.images).set({ expiresAt: now, purgeRequestedAt: now }).where(inArray(s.images.id, images.map((i) => i.id)));
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await tx.delete(s.reactions).where(inArray(s.reactions.messageId, chunk));
      await tx.delete(s.messageReports).where(inArray(s.messageReports.messageId, chunk));
      await tx.delete(s.messages).where(inArray(s.messages.id, chunk));
    }
    // Browsers cache chat history; hard-deleted rows can't appear in a delta, so move the epoch to make caches reset.
    await bumpChatEpoch({ db: tx as unknown as Container['db'] }, a.user.teamId, a.user.id);
    await tx.insert(s.messages).values({
      id: randomUUID(),
      channelId: ch.id,
      userId: null,
      kind: 'divider',
      systemKind: 'chat_cleared',
      body: 'Earlier messages were cleared by an admin.',
      meta: { from: from.toISOString(), to: to.toISOString(), messages: ids.length, images: images.length, clearedBy: a.user.id },
    });
  });
  // Purge the objects right away (the retention job retries anything that fails here).
  let purged = 0;
  for (const im of images) {
    try {
      await c.storage.delete(im.key);
      if (im.thumb) await c.storage.delete(im.thumb);
      await c.db.update(s.images).set({ purgedAt: c.clock.now() }).where(eq(s.images.id, im.id));
      purged++;
    } catch (e) {
      log.warn('admin.chat_clear_purge_failed', { imageId: im.id, error: (e as Error).message });
    }
  }
  await signalTeam(c, a.user.teamId, 'chat.cleared', {});
  await logAudit(c, a, { action: 'chat.clear', targetType: 'channel', targetId: ch.id, after: { from: from.toISOString(), to: to.toISOString(), messages: ids.length, images: images.length, imagesPurged: purged } });
  return { messages: ids.length, images: images.length };
}

/* ───────── Reports, mutes, keywords ───────── */

export async function reports(c: Container, a: Actor): Promise<{ id: string; message: ChatMessageDto; reporter: PersonRef; reason: string; status: string; createdAt: string }[]> {
  const ch = await teamChannel(c, a.user.teamId);
  const rows = await c.db
    .select({ r: s.messageReports, m: s.messages })
    .from(s.messageReports)
    .innerJoin(s.messages, eq(s.messages.id, s.messageReports.messageId))
    .where(eq(s.messages.channelId, ch.id))
    .orderBy(sql`(${s.messageReports.status} = 'open') desc`, desc(s.messageReports.createdAt))
    .limit(100);
  const uniqueMsgs = [...new Map(rows.map((x) => [x.m.id, x.m])).values()];
  const [rendered, people] = await Promise.all([renderMessages(c, a.user, uniqueMsgs), personMap(c, rows.map((x) => x.r.reporterId))]);
  return rows.map((x) => ({ id: x.r.id, message: rendered.find((m) => m.id === x.m.id)!, reporter: personOf(people, x.r.reporterId)!, reason: x.r.reason, status: x.r.status, createdAt: x.r.createdAt.toISOString() }));
}

export async function resolveReport(c: Container, a: Actor, id: string, input: z.infer<typeof ReportResolveRequest>) {
  const ch = await teamChannel(c, a.user.teamId);
  const row = await c.db.select({ r: s.messageReports, m: s.messages }).from(s.messageReports).innerJoin(s.messages, eq(s.messages.id, s.messageReports.messageId)).where(and(eq(s.messageReports.id, id), eq(s.messages.channelId, ch.id))).limit(1);
  const hit = row[0];
  if (!hit) throw notFound('Report not found.');
  const now = c.clock.now();
  if (input.action === 'delete') await deleteMessage(c, a, hit.m.id);
  if (input.action === 'nudge' && hit.m.userId) {
    await notifyUser(c, hit.m.userId, { type: 'system', title: 'A note from your admin', body: input.note?.trim() || 'One of your chat messages was reported. Please keep the Clubhouse friendly for everyone.', url: '/chat', tag: 'admin_nudge' });
  }
  const status = input.action === 'dismiss' ? 'dismissed' : input.action === 'delete' ? 'deleted' : 'nudged';
  await c.db.update(s.messageReports).set({ status, handledBy: a.user.id, handledAt: now }).where(eq(s.messageReports.id, id));
  await logAudit(c, a, { action: `chat.report_${input.action}`, targetType: 'message_report', targetId: id, memberId: hit.m.userId, before: { status: hit.r.status }, after: { status, note: input.note ?? null } });
}

export async function mute(c: Container, a: Actor, input: z.infer<typeof MuteRequest>) {
  const u = await getMember(c, a.user.teamId, input.userId);
  if (u.id === a.user.id) throw badRequest('You can’t mute yourself.', 'own_account');
  assertCanManage(a, u);
  const until = new Date(c.clock.now().getTime() + input.hours * 3600_000);
  await c.db.insert(s.chatMutes).values({ userId: u.id, until, reason: input.reason, mutedBy: a.user.id }).onConflictDoUpdate({ target: s.chatMutes.userId, set: { until, reason: input.reason, mutedBy: a.user.id, createdAt: c.clock.now() } });
  await logAudit(c, a, { action: 'chat.mute', targetType: 'user', targetId: u.id, memberId: u.id, after: { until: until.toISOString(), hours: input.hours }, reason: input.reason });
  await notifyUser(c, u.id, { type: 'system', title: 'You’re muted in chat for now', body: `An admin muted you until ${until.toISOString().slice(0, 16).replace('T', ' ')} UTC. Reason: ${input.reason}`, url: '/chat', tag: 'chat_mute' });
}

export async function unmute(c: Container, a: Actor, userId: string) {
  const u = await getMember(c, a.user.teamId, userId);
  const existing = await c.db.query.chatMutes.findFirst({ where: eq(s.chatMutes.userId, u.id) });
  await c.db.delete(s.chatMutes).where(eq(s.chatMutes.userId, u.id));
  await logAudit(c, a, { action: 'chat.unmute', targetType: 'user', targetId: u.id, memberId: u.id, before: existing ? { until: existing.until.toISOString(), reason: existing.reason } : null });
}

export async function mutes(c: Container, a: Actor) {
  const users = await teamUsers(c, a.user.teamId);
  if (!users.length) return [];
  const rows = await c.db.query.chatMutes.findMany({ where: and(inArray(s.chatMutes.userId, users.map((u) => u.id)), gt(s.chatMutes.until, c.clock.now())) });
  const people = await personMap(c, rows.map((r) => r.userId));
  return rows.map((r) => ({ person: personOf(people, r.userId)!, until: r.until.toISOString(), reason: r.reason }));
}

export async function keywords(c: Container, a: Actor) {
  const team = await getTeam(c, a.user.teamId);
  return { keywords: team.settings.chat.keywords };
}

/** The keyword list is shared with the "message contains" trigger condition. */
export async function setKeywords(c: Container, a: Actor, list: string[]) {
  const team = await getTeam(c, a.user.teamId);
  const clean = [...new Set(list.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 200);
  await c.db.update(s.teams).set({ settings: { ...team.settings, chat: { ...team.settings.chat, keywords: clean } }, updatedAt: c.clock.now() }).where(eq(s.teams.id, team.id));
  invalidateTeam(team.id);
  await logAudit(c, a, { action: 'chat.keywords_update', targetType: 'team', targetId: team.id, before: { keywords: team.settings.chat.keywords }, after: { keywords: clean } });
  return { keywords: clean };
}
