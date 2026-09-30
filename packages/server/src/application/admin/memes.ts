import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { CONDITION_LABELS, type AdminTriggerDto, type BulkMemeRequest, type CreateMemeRequest, type MemeDto, type TriggerCondition, type TriggerDefinition, type UpdateMemeRequest } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { z } from 'zod';
import type { Container } from '../../container';
import { badRequest, notFound, unprocessable } from '../../lib/errors';
import { memeLibrary } from '../chat';
import { dryRun as engineDryRun, fireTest as engineFireTest } from '../memeEngine';
import { getTeam } from '../team';
import { logAudit, personMap, personOf, type Actor } from './shared';

type TriggerRow = typeof s.memeTriggers.$inferSelect;
type Def = z.infer<typeof TriggerDefinition>;

/* ───────── Memes ───────── */

async function memeDto(c: Container, teamId: string, id: string): Promise<MemeDto> {
  const all = await memeLibrary(c, teamId, { includeDisabled: true, includePending: true });
  const m = all.find((x) => x.id === id);
  if (!m) throw notFound('Meme not found.');
  return m;
}

async function teamMeme(c: Container, teamId: string, id: string) {
  const m = await c.db.query.memes.findFirst({ where: and(eq(s.memes.id, id), eq(s.memes.teamId, teamId), isNull(s.memes.deletedAt)) });
  if (!m) throw notFound('Meme not found.');
  return m;
}

export async function listMemes(c: Container, a: Actor) {
  return memeLibrary(c, a.user.teamId, { includeDisabled: true, includePending: true });
}

const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);

export async function createMeme(c: Container, a: Actor, input: z.infer<typeof CreateMemeRequest>) {
  const team = await getTeam(c, a.user.teamId);
  const img = await c.db.query.images.findFirst({ where: and(eq(s.images.id, input.imageId), eq(s.images.teamId, a.user.teamId), isNull(s.images.purgedAt)) });
  if (!img) throw badRequest('Upload the image first.', 'bad_image');
  const [{ n } = { n: 0 }] = await c.db.select({ n: sql<number>`count(*)::int` }).from(s.memes).where(and(eq(s.memes.teamId, a.user.teamId), isNull(s.memes.deletedAt)));
  if (n >= team.settings.media.memeLibraryCap) throw unprocessable(`The meme library is full (${team.settings.media.memeLibraryCap}). Delete some first.`, 'meme_cap');
  await c.db.update(s.images).set({ kind: 'meme', expiresAt: null }).where(eq(s.images.id, img.id));
  const [m] = await c.db.insert(s.memes).values({ teamId: a.user.teamId, imageId: img.id, caption: input.caption, tags: cleanTags(input.tags), tone: input.tone, enabled: input.enabled, status: 'approved', createdBy: a.user.id }).returning();
  await logAudit(c, a, { action: 'meme.create', targetType: 'meme', targetId: m!.id, after: { caption: m!.caption, tags: m!.tags, tone: m!.tone, enabled: m!.enabled } });
  return memeDto(c, a.user.teamId, m!.id);
}

/** Also approves member suggestions (status → approved). */
export async function updateMeme(c: Container, a: Actor, id: string, input: z.infer<typeof UpdateMemeRequest>) {
  const m = await teamMeme(c, a.user.teamId, id);
  const patch: Partial<typeof s.memes.$inferInsert> = {};
  if (input.caption !== undefined) patch.caption = input.caption;
  if (input.tags !== undefined) patch.tags = cleanTags(input.tags);
  if (input.tone !== undefined) patch.tone = input.tone;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.status !== undefined) patch.status = input.status;
  if (input.status === 'approved' && m.status === 'pending' && input.enabled === undefined) patch.enabled = true;
  if (Object.keys(patch).length) await c.db.update(s.memes).set(patch).where(eq(s.memes.id, m.id));
  await logAudit(c, a, { action: m.status === 'pending' && input.status === 'approved' ? 'meme.approve' : 'meme.update', targetType: 'meme', targetId: m.id, memberId: m.suggestedBy, before: { caption: m.caption, tags: m.tags, tone: m.tone, enabled: m.enabled, status: m.status }, after: patch });
  return memeDto(c, a.user.teamId, m.id);
}

export async function bulkMemes(c: Container, a: Actor, input: z.infer<typeof BulkMemeRequest>) {
  const rows = await c.db.query.memes.findMany({ where: and(inArray(s.memes.id, input.ids), eq(s.memes.teamId, a.user.teamId), isNull(s.memes.deletedAt)) });
  const ids = rows.map((r) => r.id);
  if (!ids.length) return { affected: 0 };
  const tags = cleanTags(input.tags ?? []);
  if ((input.action === 'add_tags' || input.action === 'remove_tags') && !tags.length) throw badRequest('Pick at least one tag.', 'tags_required');
  if (input.action === 'delete') await c.db.update(s.memes).set({ deletedAt: c.clock.now(), enabled: false }).where(inArray(s.memes.id, ids));
  else if (input.action === 'enable' || input.action === 'disable') await c.db.update(s.memes).set({ enabled: input.action === 'enable' }).where(inArray(s.memes.id, ids));
  else {
    for (const r of rows) {
      const next = input.action === 'add_tags' ? cleanTags([...r.tags, ...tags]) : r.tags.filter((t) => !tags.includes(t));
      await c.db.update(s.memes).set({ tags: next }).where(eq(s.memes.id, r.id));
    }
  }
  await logAudit(c, a, { action: `meme.bulk_${input.action}`, targetType: 'meme', after: { ids, tags } });
  return { affected: ids.length };
}

/* ───────── Triggers ───────── */

const EVENT_LABEL: Record<string, string> = {
  log_saved: 'Any log saved',
  food_log_saved: 'Food logged',
  activity_log_saved: 'Activity logged',
  weight_log_saved: 'Weight logged',
  day_end: 'Day ends',
  streak_changed: 'Streak changes',
  chat_message_posted: 'Chat message posted',
  weekly_recap: 'Weekly recap',
};
const ACTION_LABEL: Record<string, string> = {
  show_private: 'Show privately',
  post_chat_tag: 'Post in chat and tag',
  post_chat_no_tag: 'Post in chat',
  reply_to_message: 'Reply to the message',
  react_to_message: 'React to the message',
};
const OP: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' };

function conditionText(x: TriggerCondition): string {
  switch (x.type) {
    case 'meal_kcal':
    case 'item_kcal':
      return `${CONDITION_LABELS[x.type]} ${OP[x.op]} ${x.value} kcal`;
    case 'macro_amount':
      return `${x.macro} ${OP[x.op]} ${x.grams} g`;
    case 'macro_percent':
      return `${x.macro} ${OP[x.op]} ${x.percent}% of target`;
    case 'food_tags':
      return `${x.match === 'all' ? 'all of' : 'any of'} ${x.tags.join(', ')}`;
    case 'time_of_day':
      return `between ${x.from} and ${x.to}`;
    case 'count_this_week':
      return `${x.what.replace(/_/g, ' ')}${x.tag ? ` (${x.tag})` : ''} this week ${OP[x.op]} ${x.value}`;
    case 'days_since_last_log':
      return `days since last log ${OP[x.op]} ${x.days}`;
    case 'streak_milestone':
      return `${x.kind} streak hits ${x.values.join('/')}`;
    case 'personal_record':
      return `record: ${x.records.join(', ').replace(/_/g, ' ')}`;
    case 'message_contains':
      return `message contains ${[...x.words, ...(x.useTeamKeywords ? ['team keywords'] : [])].join(', ') || 'team keywords'}`;
    case 'member_in_list':
      return `${x.userIds.length} selected member${x.userIds.length === 1 ? '' : 's'}`;
    case 'macro_target_met_days':
      return `${x.macro} target met ${x.days} days running`;
    case 'weight_change':
      return `weight ${x.direction} ${x.kg} kg over ${x.overDays} days`;
    case 'calorie_band':
      return `calorie band: ${x.bands.join(', ')}`;
    default:
      return CONDITION_LABELS[x.type];
  }
}

function summary(t: TriggerRow): AdminTriggerDto['summary'] {
  const joiner = t.match === 'any' ? ' or ' : ' and ';
  const sel = t.selection.mode === 'specific' ? 'a specific meme' : `a random “${t.selection.tag}” meme`;
  return { event: EVENT_LABEL[t.event] ?? t.event, condition: t.conditions.length ? t.conditions.map(conditionText).join(joiner) : 'Always', action: `${ACTION_LABEL[t.action] ?? t.action} · ${sel}` };
}

async function triggerDtos(c: Container, teamId: string, rows: TriggerRow[]): Promise<AdminTriggerDto[]> {
  if (!rows.length) return [];
  const since = new Date(c.clock.now().getTime() - 28 * 86400_000);
  const stats = await c.db
    .select({
      triggerId: s.memeFires.triggerId,
      fires28: sql<number>`count(*) filter (where ${s.memeFires.firedAt} >= ${since.toISOString()}::timestamptz)::int`,
      dismissed28: sql<number>`count(*) filter (where ${s.memeFires.firedAt} >= ${since.toISOString()}::timestamptz and ${s.memeFires.dismissedAt} is not null)::int`,
      reactions: sql<number>`coalesce(sum(${s.memeFires.reactions}), 0)::int`,
    })
    .from(s.memeFires)
    .where(and(eq(s.memeFires.teamId, teamId), eq(s.memeFires.test, false), inArray(s.memeFires.triggerId, rows.map((r) => r.id))))
    .groupBy(s.memeFires.triggerId);
  return rows.map((t) => {
    const st = stats.find((x) => x.triggerId === t.id);
    const fires = Number(st?.fires28 ?? 0);
    const dismissRate = fires ? Number(st?.dismissed28 ?? 0) / fires : 0;
    return {
      id: t.id,
      catalogKey: t.catalogKey,
      name: t.name,
      event: t.event as Def['event'],
      match: t.match as Def['match'],
      conditions: t.conditions,
      action: t.action as Def['action'],
      selection: t.selection,
      cooldown: t.cooldown as Def['cooldown'],
      tone: t.tone as Def['tone'],
      caption: t.caption,
      excludedUserIds: t.excludedUserIds,
      enabled: t.enabled,
      firedCount: t.firedCount,
      dismissCount: t.dismissCount,
      firesPerWeek: Math.round((fires / 4) * 10) / 10,
      reactions: Number(st?.reactions ?? 0),
      dismissRate: Math.round(dismissRate * 100) / 100,
      annoying: fires >= 5 && dismissRate > 0.4,
      summary: summary(t),
      sortOrder: t.sortOrder,
    };
  });
}

async function teamTrigger(c: Container, teamId: string, id: string) {
  const t = await c.db.query.memeTriggers.findFirst({ where: and(eq(s.memeTriggers.id, id), eq(s.memeTriggers.teamId, teamId), isNull(s.memeTriggers.deletedAt)) });
  if (!t) throw notFound('Trigger not found.');
  return t;
}

export async function listTriggers(c: Container, a: Actor) {
  const rows = await c.db.query.memeTriggers.findMany({ where: and(eq(s.memeTriggers.teamId, a.user.teamId), isNull(s.memeTriggers.deletedAt)), orderBy: [asc(s.memeTriggers.sortOrder), asc(s.memeTriggers.name)] });
  return triggerDtos(c, a.user.teamId, rows);
}

/** Beyond the schema's guardrails: referenced memes and members must belong to this team. */
async function validateRefs(c: Container, teamId: string, d: Def) {
  if (d.selection.mode === 'specific') {
    const m = await c.db.query.memes.findFirst({ where: and(eq(s.memes.id, d.selection.memeId), eq(s.memes.teamId, teamId), isNull(s.memes.deletedAt)) });
    if (!m) throw unprocessable('The selected meme was not found.', 'bad_meme', { selection: 'Meme not found' });
  }
  const ids = [...d.excludedUserIds, ...d.conditions.flatMap((x) => (x.type === 'member_in_list' ? x.userIds : []))];
  if (ids.length) {
    const found = await c.db.select({ id: s.users.id }).from(s.users).where(and(inArray(s.users.id, [...new Set(ids)]), eq(s.users.teamId, teamId)));
    if (found.length !== new Set(ids).size) throw unprocessable('One of the selected members was not found.', 'bad_member');
  }
}

const defValues = (d: Def) => ({ name: d.name, event: d.event, match: d.match, conditions: d.conditions, action: d.action, selection: d.selection, cooldown: d.cooldown, tone: d.tone, caption: d.caption, excludedUserIds: d.excludedUserIds, enabled: d.enabled });

export async function createTrigger(c: Container, a: Actor, d: Def) {
  await validateRefs(c, a.user.teamId, d);
  const [{ max } = { max: 0 }] = await c.db.select({ max: sql<number>`coalesce(max(${s.memeTriggers.sortOrder}), 0)::int` }).from(s.memeTriggers).where(eq(s.memeTriggers.teamId, a.user.teamId));
  const [row] = await c.db.insert(s.memeTriggers).values({ ...defValues(d), teamId: a.user.teamId, sortOrder: max + 1, createdBy: a.user.id }).returning();
  await logAudit(c, a, { action: 'trigger.create', targetType: 'trigger', targetId: row!.id, after: defValues(d) });
  return (await triggerDtos(c, a.user.teamId, [row!]))[0]!;
}

export async function updateTrigger(c: Container, a: Actor, id: string, d: Def) {
  const t = await teamTrigger(c, a.user.teamId, id);
  await validateRefs(c, a.user.teamId, d);
  const [row] = await c.db.update(s.memeTriggers).set({ ...defValues(d), updatedAt: c.clock.now() }).where(eq(s.memeTriggers.id, t.id)).returning();
  await logAudit(c, a, { action: 'trigger.update', targetType: 'trigger', targetId: t.id, before: defValues({ ...(t as unknown as Def), excludedUserIds: t.excludedUserIds }), after: defValues(d) });
  return (await triggerDtos(c, a.user.teamId, [row!]))[0]!;
}

export async function toggleTrigger(c: Container, a: Actor, id: string, enabled: boolean) {
  const t = await teamTrigger(c, a.user.teamId, id);
  const [row] = await c.db.update(s.memeTriggers).set({ enabled, updatedAt: c.clock.now() }).where(eq(s.memeTriggers.id, t.id)).returning();
  await logAudit(c, a, { action: 'trigger.toggle', targetType: 'trigger', targetId: t.id, before: { enabled: t.enabled }, after: { enabled } });
  return (await triggerDtos(c, a.user.teamId, [row!]))[0]!;
}

export async function deleteTrigger(c: Container, a: Actor, id: string) {
  const t = await teamTrigger(c, a.user.teamId, id);
  await c.db.update(s.memeTriggers).set({ deletedAt: c.clock.now(), enabled: false }).where(eq(s.memeTriggers.id, t.id));
  await logAudit(c, a, { action: 'trigger.delete', targetType: 'trigger', targetId: t.id, before: { name: t.name, enabled: t.enabled } });
}

export async function dryRun(c: Container, a: Actor, triggerId: string | null, memberId: string, date: string) {
  if (triggerId) await teamTrigger(c, a.user.teamId, triggerId);
  return engineDryRun(c, a.user, triggerId, memberId, date);
}

export async function fireTest(c: Container, a: Actor, id: string) {
  await teamTrigger(c, a.user.teamId, id);
  const r = await engineFireTest(c, a.user, id);
  await logAudit(c, a, { action: 'trigger.fire_test', targetType: 'trigger', targetId: id, after: { memeId: r.memeId } });
  return r;
}

export async function evaluations(c: Container, a: Actor, id: string) {
  await teamTrigger(c, a.user.teamId, id);
  const rows = await c.db.query.triggerEvaluations.findMany({ where: and(eq(s.triggerEvaluations.triggerId, id), eq(s.triggerEvaluations.teamId, a.user.teamId), gte(s.triggerEvaluations.createdAt, new Date(c.clock.now().getTime() - 30 * 86400_000))), orderBy: [desc(s.triggerEvaluations.createdAt)], limit: 100 });
  const people = await personMap(c, rows.map((r) => r.userId));
  return rows.map((r) => ({ createdAt: r.createdAt.toISOString(), person: personOf(people, r.userId), event: r.event, fired: r.fired, reasons: r.reasons }));
}
