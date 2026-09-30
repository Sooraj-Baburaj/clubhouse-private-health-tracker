import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { MemeMomentDto, MemeTone, PersonalRecord, TriggerAction, TriggerEvent } from '@clubhouse/contracts';
import {
  addDays,
  bandFor,
  daysBetween,
  evaluateTriggers,
  isOnVacation,
  localDateOf,
  localTimeOf,
  weekStartOf,
  ZERO_TOTALS,
  type FireRecord,
  type MemeRef,
  type TriggerDecision,
  type TriggerRule,
  type TriggerSnapshot,
} from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { notFound } from '../lib/errors';
import { log } from '../lib/log';
import type { AuthUser } from '../interface/http/types';
import { postSystemMessage, teamChannel } from './chat';
import { imageUrlMap, pick } from './images';
import { computeDayFacts, teamAllLogged, type StreakChange } from './momentum';
import { notifyUser } from './notify';
import { getTeam } from './team';

type TriggerRow = typeof s.memeTriggers.$inferSelect;

export interface LogEventContext {
  kind: 'food' | 'activity' | 'weight';
  id: string;
  date: string;
  row: unknown;
  streakChanges: StreakChange[];
  personalRecords: PersonalRecord[];
  planItemCompleted: { planItemId: string } | null;
}

function toRule(t: TriggerRow): TriggerRule {
  return {
    id: t.id,
    order: t.sortOrder,
    name: t.name,
    event: t.event as TriggerEvent,
    match: t.match as 'all' | 'any',
    conditions: t.conditions,
    action: t.action as TriggerAction,
    selection: t.selection,
    cooldown: t.cooldown as TriggerRule['cooldown'],
    tone: t.tone as MemeTone,
    caption: t.caption,
    excludedUserIds: t.excludedUserIds,
    enabled: t.enabled,
  };
}

/** Everything the evaluator needs about a member at a moment, from the logic engine's own numbers. */
async function snapshot(c: Container, user: AuthUser, opts: { event: TriggerEvent; eventKey: string; date: string; localTime: string; meal?: TriggerSnapshot['meal']; message?: TriggerSnapshot['message']; streakChanges?: StreakChange[]; personalRecords?: PersonalRecord[]; planItemCompleted?: { planItemId: string } | null }): Promise<TriggerSnapshot> {
  const team = await getTeam(c, user.teamId);
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, user.id) });
  const fact = (await c.db.query.dayFacts.findFirst({ where: and(eq(s.dayFacts.userId, user.id), eq(s.dayFacts.date, opts.date)) })) ?? (await computeDayFacts(c, user.id, opts.date));
  const ws = weekStartOf(opts.date);
  const weekFoods = await c.db.query.foodLogs.findMany({ where: and(eq(s.foodLogs.userId, user.id), gte(s.foodLogs.date, ws), lte(s.foodLogs.date, opts.date), isNull(s.foodLogs.deletedAt)) });
  const weekActs = await c.db.query.activityLogs.findMany({ where: and(eq(s.activityLogs.userId, user.id), gte(s.activityLogs.date, ws), lte(s.activityLogs.date, opts.date), isNull(s.activityLogs.deletedAt)) });
  const foodTags: Record<string, number> = {};
  for (const f of weekFoods) for (const i of f.items) for (const t of i.tags ?? []) foodTags[t] = (foodTags[t] ?? 0) + 1;
  const activityTypes: Record<string, number> = {};
  for (const a of weekActs) activityTypes[a.typeId] = (activityTypes[a.typeId] ?? 0) + 1;
  const history = await c.db.query.dayFacts.findMany({ where: and(eq(s.dayFacts.userId, user.id), gte(s.dayFacts.date, addDays(opts.date, -60)), lte(s.dayFacts.date, opts.date)), orderBy: [desc(s.dayFacts.date)] });
  const lastLogged = history.find((h) => h.logged && h.date <= opts.date);
  const thresholds = team.settings.thresholds;
  const metRun = (nutrient: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fibre') => {
    let n = 0;
    let d = opts.date;
    for (const h of history) {
      if (h.date !== d) break;
      const t = h.targets?.[nutrient];
      if (!t || !h.totals) break;
      if (bandFor(nutrient, h.totals[nutrient], t, thresholds, true).band !== 'green') break;
      n++;
      d = addDays(d, -1);
    }
    return n;
  };
  const weights = await c.db.query.weightEntries.findMany({ where: and(eq(s.weightEntries.userId, user.id), isNull(s.weightEntries.deletedAt)), orderBy: [asc(s.weightEntries.date)] });
  const latest = weights.at(-1);
  const kcalTarget = fact.targets?.kcal ?? 0;
  const dayBandRes = kcalTarget ? bandFor('kcal', fact.totals?.kcal ?? 0, kcalTarget + (profile?.eatBackExercise ? fact.kcalBurned : 0), thresholds, true) : null;
  const logging = opts.streakChanges?.find((ch) => ch.kind === 'logging');
  return {
    event: opts.event,
    eventKey: opts.eventKey,
    userId: user.id,
    localDate: opts.date,
    localTime: opts.localTime,
    weekStart: ws,
    meal: opts.meal ?? null,
    dayTotals: fact.totals ?? ZERO_TOTALS,
    targets: fact.targets ?? ZERO_TOTALS,
    weekCounts: { foodTags, foodLogs: weekFoods.length, activityLogs: weekActs.length, activityTypes },
    daysSinceLastLog: lastLogged ? daysBetween(lastLogged.date, opts.date) : 60,
    planItemCompleted: opts.planItemCompleted ?? null,
    streaks: Object.fromEntries((opts.streakChanges ?? []).map((ch) => [ch.kind, { before: ch.before, after: ch.after }])),
    streakResumed: !!logging?.resumed,
    personalRecords: opts.personalRecords ?? [],
    message: opts.message ?? null,
    macroTargetMetDays: { protein: metRun('protein'), kcal: metRun('kcal'), fibre: metRun('fibre'), carbs: metRun('carbs'), fat: metRun('fat') },
    teamAllLogged: await teamAllLogged(c, user.teamId, opts.date),
    onVacation: isOnVacation(profile?.vacationRanges ?? [], opts.date),
    weightChangeOver: (days) => {
      const since = addDays(opts.date, -days);
      const w = weights.filter((x) => x.date >= since && x.date <= opts.date);
      return w.length >= 2 ? w.at(-1)!.weightKg - w[0]!.weightKg : null;
    },
    weightNewLow: !!latest && latest.date === opts.date && weights.length >= 4 && weights.slice(0, -1).every((w) => w.weightKg > latest.weightKg),
    dayBand: dayBandRes ? (dayBandRes.band === 'green' ? 'green' : dayBandRes.band === 'red' ? 'red' : dayBandRes.direction === 'over' ? 'over' : 'under') : null,
    teamKeywords: team.settings.chat.keywords,
    roastOptOut: !(profile?.privacy.roastMemes ?? true),
  };
}

async function loadContext(c: Container, teamId: string, userId: string, today: string) {
  const [rules, fires, memes, chatFires, team] = await Promise.all([
    c.db.query.memeTriggers.findMany({ where: and(eq(s.memeTriggers.teamId, teamId), isNull(s.memeTriggers.deletedAt)) }),
    c.db.query.memeFires.findMany({ where: and(eq(s.memeFires.teamId, teamId), gte(s.memeFires.localDate, addDays(today, -60)), eq(s.memeFires.test, false)) }),
    c.db.query.memes.findMany({ where: and(eq(s.memes.teamId, teamId), isNull(s.memes.deletedAt), eq(s.memes.status, 'approved')) }),
    c.db.select({ n: sql<number>`count(*)::int` }).from(s.memeFires).where(and(eq(s.memeFires.teamId, teamId), eq(s.memeFires.localDate, today), eq(s.memeFires.postedToChat, true), eq(s.memeFires.test, false))),
    getTeam(c, teamId),
  ]);
  const fireRecords: FireRecord[] = fires.map((f) => ({ triggerId: f.triggerId, userId: f.userId, memeId: f.memeId, cooldownKey: f.cooldownKey, localDate: f.localDate, postedToChat: f.postedToChat }));
  const memeRefs: MemeRef[] = memes.map((m) => ({ id: m.id, tags: m.tags, tone: m.tone as MemeTone, enabled: m.enabled }));
  void userId;
  return { rules, fireRecords, memeRefs, chatFiresToday: chatFires[0]?.n ?? 0, team };
}

async function recordEvaluations(c: Container, teamId: string, userId: string, snap: TriggerSnapshot, decisions: TriggerDecision[]) {
  if (!decisions.length) return;
  await c.db.insert(s.triggerEvaluations).values(decisions.map((d) => ({ teamId, triggerId: d.triggerId, userId, event: snap.event, eventKey: snap.eventKey, fired: d.fire, reasons: d.reasons })));
}

/** Apply one firing decision: record the fire (idempotent by cooldown key), then show or post the meme. */
async function applyFire(c: Container, user: AuthUser, rule: TriggerRow, d: TriggerDecision, snap: TriggerSnapshot, logRef: { type: 'food_log' | 'activity_log' | 'weight' | 'message'; id: string } | null, test = false): Promise<MemeMomentDto | null> {
  const [fire] = await c.db
    .insert(s.memeFires)
    .values({ teamId: user.teamId, triggerId: rule.id, userId: user.id, memeId: d.memeId, action: d.action, cooldownKey: d.cooldownKey, eventKey: snap.eventKey, localDate: snap.localDate, postedToChat: d.postsToChat && !test, logRef, test })
    .onConflictDoNothing()
    .returning();
  if (!fire) return null;
  const meme = d.memeId ? await c.db.query.memes.findFirst({ where: eq(s.memes.id, d.memeId) }) : null;
  const caption = (rule.caption ?? meme?.caption ?? '').replace(/\{name\}/g, user.displayName.split(' ')[0]!);
  const images = await imageUrlMap(c, [meme?.imageId]);
  const memeUrl = pick(images, meme?.imageId).url;
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, user.id) });
  let messageId: string | null = null;

  if (test) {
    await notifyUser(c, user.id, { type: 'meme_fired', title: `Test: ${rule.name}`, body: caption || 'Trigger test fired.', url: '/admin/triggers', dedupeKey: `meme-test:${fire.id}` });
  } else if (d.action === 'post_chat_tag' || d.action === 'post_chat_no_tag' || d.action === 'reply_to_message') {
    const attachments = [...(d.memeId ? [{ type: 'meme' as const, memeId: d.memeId }] : []), ...(logRef && (logRef.type === 'food_log' || logRef.type === 'activity_log') ? [{ type: logRef.type, id: logRef.id }] : [])];
    const tagged = d.action === 'post_chat_tag';
    const msg = await postSystemMessage(c, user.teamId, {
      systemKind: 'meme',
      body: tagged ? `@${user.username} ${caption}`.trim() : caption,
      attachments,
      mentions: tagged ? [user.id] : [],
      memeId: d.memeId,
      replyToId: d.action === 'reply_to_message' ? (snap.message?.id ?? null) : null,
      meta: { triggerId: rule.id, triggerName: rule.name, tone: rule.tone, userId: tagged ? user.id : null, fireId: fire.id },
    });
    messageId = msg.id;
    if (tagged) await notifyUser(c, user.id, { type: 'meme_fired', title: rule.tone === 'roast' ? 'You got roasted 😅' : 'A meme for you 🎉', body: caption || rule.name, url: `/chat?seq=${msg.seq}`, dedupeKey: `meme:${fire.id}` });
  } else if (d.action === 'react_to_message' && snap.message) {
    const m = await c.db.query.messages.findFirst({ where: eq(s.messages.id, snap.message.id) });
    if (m) {
      const list = ((m.meta.memeReactions as { memeId: string; fireId: string }[] | undefined) ?? []).concat(d.memeId ? [{ memeId: d.memeId, fireId: fire.id }] : []);
      await c.db.update(s.messages).set({ meta: { ...m.meta, memeReactions: list } }).where(eq(s.messages.id, m.id));
    }
  }
  if (messageId) await c.db.update(s.memeFires).set({ messageId }).where(eq(s.memeFires.id, fire.id));
  await c.db.update(s.memeTriggers).set({ firedCount: sql`${s.memeTriggers.firedCount} + 1` }).where(eq(s.memeTriggers.id, rule.id));
  if (d.memeId) await c.db.update(s.memes).set({ uses: sql`${s.memes.uses} + 1`, lastUsedAt: c.clock.now() }).where(eq(s.memes.id, d.memeId));

  if (d.action === 'show_private' || d.action === 'post_chat_tag') {
    return {
      fireId: fire.id,
      logId: logRef && logRef.type !== 'message' ? logRef.id : null,
      memeUrl,
      caption,
      tone: rule.tone as MemeTone,
      triggerName: rule.name,
      firedAt: fire.firedAt.toISOString(),
      reactions: [],
      canRoastOptOut: rule.tone === 'roast' && !(profile?.privacy.roastPromptSeen ?? false),
    };
  }
  return null;
}

async function evaluateAndApply(c: Container, user: AuthUser, snap: TriggerSnapshot, logRef: { type: 'food_log' | 'activity_log' | 'weight' | 'message'; id: string } | null): Promise<MemeMomentDto[]> {
  const ctx = await loadContext(c, user.teamId, user.id, snap.localDate);
  const rules = ctx.rules.filter((r) => r.enabled);
  if (!rules.length) return [];
  const decisions = evaluateTriggers({
    snapshot: snap,
    rules: rules.map(toRule),
    fires: ctx.fireRecords,
    memes: ctx.memeRefs,
    chatFiresToday: ctx.chatFiresToday,
    dailyChatCap: ctx.team.settings.memes.dailyChatCap,
    roastEnabledForTeam: ctx.team.settings.featureFlags.roastMemes,
    rng: Math.random,
  });
  await recordEvaluations(c, user.teamId, user.id, snap, decisions);
  const moments: MemeMomentDto[] = [];
  for (const d of decisions.filter((x) => x.fire)) {
    const rule = rules.find((r) => r.id === d.triggerId)!;
    try {
      const m = await applyFire(c, user, rule, d, snap, logRef);
      if (m) moments.push(m);
    } catch (e) {
      log.warn('meme.apply_failed', { triggerId: d.triggerId, error: (e as Error).message });
    }
  }
  return moments;
}

const EVENT_BY_KIND = { food: 'food_log_saved', activity: 'activity_log_saved', weight: 'weight_log_saved' } as const;

/** SYS-CHAT-10: evaluate after every log save. */
export async function runTriggers(c: Container, user: AuthUser, ev: LogEventContext): Promise<MemeMomentDto[]> {
  let meal: TriggerSnapshot['meal'] = null;
  let loggedAt = c.clock.now();
  if (ev.kind === 'food') {
    const row = ev.row as typeof s.foodLogs.$inferSelect;
    loggedAt = row.loggedAt;
    meal = {
      kcal: row.totals.kcal,
      items: row.items.map((i) => ({ kcal: i.nutrition.kcal, tags: i.tags ?? [] })),
      macros: { protein: row.totals.protein, carbs: row.totals.carbs, fat: row.totals.fat, fibre: row.totals.fibre },
    };
  } else if (ev.kind === 'activity') loggedAt = (ev.row as typeof s.activityLogs.$inferSelect).loggedAt;
  const snap = await snapshot(c, user, {
    event: EVENT_BY_KIND[ev.kind],
    eventKey: `${ev.kind}:${ev.id}`,
    date: ev.date,
    localTime: localTimeOf(loggedAt, user.timezone),
    meal,
    streakChanges: ev.streakChanges,
    personalRecords: ev.personalRecords,
    planItemCompleted: ev.planItemCompleted,
  });
  const ref = ev.kind === 'food' ? { type: 'food_log' as const, id: ev.id } : ev.kind === 'activity' ? { type: 'activity_log' as const, id: ev.id } : { type: 'weight' as const, id: ev.id };
  return evaluateAndApply(c, user, snap, ref);
}

export async function runChatTriggers(c: Container, user: AuthUser, message: typeof s.messages.$inferSelect) {
  const date = localDateOf(message.createdAt, user.timezone);
  const snap = await snapshot(c, user, { event: 'chat_message_posted', eventKey: `message:${message.id}`, date, localTime: localTimeOf(message.createdAt, user.timezone), message: { id: message.id, text: message.body } });
  await evaluateAndApply(c, user, snap, { type: 'message', id: message.id });
}

/** Day-end evaluation for a completed member-day (run by the nightly rollover). */
export async function runDayEnd(c: Container, user: AuthUser, date: string, event: 'day_end' | 'weekly_recap' = 'day_end') {
  const snap = await snapshot(c, user, { event, eventKey: `${event}:${date}`, date, localTime: '23:59' });
  await evaluateAndApply(c, user, snap, null);
}

/* ───────── Moments, dry runs, tests ───────── */

export async function momentsForLogs(c: Container, userId: string, logIds: string[]): Promise<MemeMomentDto[]> {
  if (!logIds.length) return [];
  const fires = await c.db
    .select({ fire: s.memeFires, trigger: s.memeTriggers, meme: s.memes })
    .from(s.memeFires)
    .innerJoin(s.memeTriggers, eq(s.memeTriggers.id, s.memeFires.triggerId))
    .leftJoin(s.memes, eq(s.memes.id, s.memeFires.memeId))
    .where(and(eq(s.memeFires.userId, userId), isNull(s.memeFires.dismissedAt), eq(s.memeFires.test, false), inArray(sql`${s.memeFires.logRef}->>'id'`, logIds), inArray(s.memeFires.action, ['show_private', 'post_chat_tag'])));
  const images = await imageUrlMap(c, fires.map((f) => f.meme?.imageId));
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  const msgIds = fires.map((f) => f.fire.messageId).filter((x): x is string => !!x);
  const reactions = msgIds.length ? await c.db.select().from(s.reactions).where(inArray(s.reactions.messageId, msgIds)) : [];
  return fires.map(({ fire, trigger, meme }) => {
    const rx = reactions.filter((r) => r.messageId === fire.messageId);
    const grouped = [...new Set(rx.map((r) => r.emoji))].map((emoji) => ({ emoji, count: rx.filter((r) => r.emoji === emoji).length, mine: rx.some((r) => r.emoji === emoji && r.userId === userId) }));
    return {
      fireId: fire.id,
      logId: (fire.logRef as { id: string } | null)?.id ?? null,
      memeUrl: pick(images, meme?.imageId).url,
      caption: (trigger.caption ?? meme?.caption ?? '').replace(/\{name\}/g, ''),
      tone: trigger.tone as MemeTone,
      triggerName: trigger.name,
      firedAt: fire.firedAt.toISOString(),
      reactions: grouped,
      canRoastOptOut: trigger.tone === 'roast' && !(profile?.privacy.roastPromptSeen ?? false),
    };
  });
}

export async function dismissMoment(c: Container, user: AuthUser, fireId: string) {
  const f = await c.db.query.memeFires.findFirst({ where: and(eq(s.memeFires.id, fireId), eq(s.memeFires.userId, user.id)) });
  if (!f) throw notFound();
  if (!f.dismissedAt) {
    await c.db.update(s.memeFires).set({ dismissedAt: c.clock.now() }).where(eq(s.memeFires.id, fireId));
    await c.db.update(s.memeTriggers).set({ dismissCount: sql`${s.memeTriggers.dismissCount} + 1` }).where(eq(s.memeTriggers.id, f.triggerId));
  }
}

export async function reactToMoment(c: Container, user: AuthUser, fireId: string) {
  const f = await c.db.query.memeFires.findFirst({ where: and(eq(s.memeFires.id, fireId), eq(s.memeFires.userId, user.id)) });
  if (!f) throw notFound();
  await c.db.update(s.memeFires).set({ reactions: sql`${s.memeFires.reactions} + 1` }).where(eq(s.memeFires.id, fireId));
}

/** APP-FUN-15: share a private meme moment to chat in one tap. */
export async function shareMoment(c: Container, user: AuthUser, fireId: string) {
  const f = await c.db.query.memeFires.findFirst({ where: and(eq(s.memeFires.id, fireId), eq(s.memeFires.userId, user.id)) });
  if (!f) throw notFound();
  const trigger = await c.db.query.memeTriggers.findFirst({ where: eq(s.memeTriggers.id, f.triggerId) });
  const { sendMessage } = await import('./chat');
  const attachments = [...(f.memeId ? [{ type: 'meme' as const, memeId: f.memeId }] : []), ...(f.logRef && (f.logRef.type === 'food_log' || f.logRef.type === 'activity_log') ? [{ type: f.logRef.type, id: f.logRef.id }] : [])];
  const { randomUUID } = await import('node:crypto');
  return sendMessage(c, user, randomUUID(), { body: trigger?.caption?.replace(/\{name\}/g, '') ?? '', attachments });
}

/**
 * ADM-MEME-16 dry run: replay a member's past day through one trigger (or all) without side effects and report
 * which would have fired and why.
 */
export async function dryRun(c: Container, admin: AuthUser, triggerId: string | null, memberId: string, date: string) {
  const member = await c.db.query.users.findFirst({ where: and(eq(s.users.id, memberId), eq(s.users.teamId, admin.teamId)) });
  if (!member) throw notFound('Member not found.');
  const team = await getTeam(c, admin.teamId);
  const mUser: AuthUser = { id: member.id, teamId: member.teamId, username: member.username, displayName: member.displayName, email: member.email, role: member.role, mustChangePassword: false, timezone: member.timezone || team.timezone, teamTimezone: team.timezone, totpEnabled: false, avatarImageId: member.avatarImageId };
  const ctx = await loadContext(c, admin.teamId, member.id, date);
  const rules = ctx.rules.filter((r) => !triggerId || r.id === triggerId).map(toRule);
  const events: { label: string; snap: TriggerSnapshot }[] = [];
  const foods = await c.db.query.foodLogs.findMany({ where: and(eq(s.foodLogs.userId, member.id), eq(s.foodLogs.date, date), isNull(s.foodLogs.deletedAt)), orderBy: [asc(s.foodLogs.loggedAt)] });
  for (const f of foods) {
    events.push({
      label: `${f.mealSlot.replace('_', ' ')} · ${f.items.map((i) => i.name).join(', ')} · ${Math.round(f.totals.kcal)} kcal`,
      snap: await snapshot(c, mUser, { event: 'food_log_saved', eventKey: `dry:${f.id}`, date, localTime: localTimeOf(f.loggedAt, mUser.timezone), meal: { kcal: f.totals.kcal, items: f.items.map((i) => ({ kcal: i.nutrition.kcal, tags: i.tags ?? [] })), macros: f.totals } }),
    });
  }
  const acts = await c.db.query.activityLogs.findMany({ where: and(eq(s.activityLogs.userId, member.id), eq(s.activityLogs.date, date), isNull(s.activityLogs.deletedAt)) });
  for (const a of acts) events.push({ label: `activity · ${Math.round(a.durationMin)} min`, snap: await snapshot(c, mUser, { event: 'activity_log_saved', eventKey: `dry:${a.id}`, date, localTime: localTimeOf(a.loggedAt, mUser.timezone) }) });
  events.push({ label: 'day end', snap: await snapshot(c, mUser, { event: 'day_end', eventKey: `dry:day_end:${date}`, date, localTime: '23:59' }) });
  return events.map((e) => ({
    event: e.snap.event,
    label: e.label,
    decisions: evaluateTriggers({ snapshot: e.snap, rules, fires: ctx.fireRecords.filter((f) => f.localDate < date), memes: ctx.memeRefs, chatFiresToday: 0, dailyChatCap: team.settings.memes.dailyChatCap, roastEnabledForTeam: team.settings.featureFlags.roastMemes, rng: () => 0, dryRun: true }).map((d) => ({
      triggerId: d.triggerId,
      triggerName: rules.find((r) => r.id === d.triggerId)?.name ?? '',
      fire: d.fire,
      reasons: d.reasons,
      action: d.action,
      memeId: d.memeId,
    })),
  }));
}

/** ADM-MEME-16 "Fire now": sends the trigger's meme to the admin privately, bypassing conditions and cooldowns. */
export async function fireTest(c: Container, admin: AuthUser, triggerId: string) {
  const rule = await c.db.query.memeTriggers.findFirst({ where: and(eq(s.memeTriggers.id, triggerId), eq(s.memeTriggers.teamId, admin.teamId)) });
  if (!rule) throw notFound('Trigger not found.');
  const memes = await c.db.query.memes.findMany({ where: and(eq(s.memes.teamId, admin.teamId), isNull(s.memes.deletedAt), eq(s.memes.status, 'approved')) });
  const r = toRule(rule);
  const memeId = r.selection.mode === 'specific' ? r.selection.memeId : (memes.find((m) => m.tags.includes((r.selection as { tag: string }).tag))?.id ?? null);
  const today = localDateOf(c.clock.now(), admin.timezone);
  const snap = await snapshot(c, admin, { event: r.event === 'log_saved' ? 'food_log_saved' : r.event, eventKey: `test:${Date.now()}`, date: today, localTime: localTimeOf(c.clock.now(), admin.timezone) });
  const d: TriggerDecision = { triggerId, fire: true, reasons: ['test'], action: r.action, memeId, cooldownKey: `test:${Date.now()}`, postsToChat: false };
  await applyFire(c, admin, rule, d, snap, null, true);
  const images = await imageUrlMap(c, [memes.find((m) => m.id === memeId)?.imageId]);
  return { memeId, memeUrl: pick(images, memes.find((m) => m.id === memeId)?.imageId).url, caption: rule.caption ?? '' };
}

export async function channelForTeam(c: Container, teamId: string) {
  return teamChannel(c, teamId);
}
