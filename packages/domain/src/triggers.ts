import {
  ROAST_FORBIDDEN_CONDITIONS,
  type CompareOp,
  type MemeTone,
  type Nutrient,
  type PersonalRecord,
  type StreakKind,
  type TriggerAction,
  type TriggerCondition,
  type TriggerDefinition,
  type TriggerEvent,
} from '@clubhouse/contracts';
import type { NutrientTotals } from './bands';
import { addDays, hhmmToMinutes, inWindow } from './time';

export interface TriggerSnapshot {
  event: TriggerEvent;
  /** Unique key for the thing that happened (log id, message id, day) — idempotency for scope 'none'. */
  eventKey: string;
  userId: string;
  localDate: string;
  localTime: string;
  weekStart: string;
  meal: { kcal: number; items: { kcal: number; tags: string[] }[]; macros: Omit<NutrientTotals, 'kcal'> } | null;
  dayTotals: NutrientTotals;
  targets: NutrientTotals;
  weekCounts: { foodTags: Record<string, number>; foodLogs: number; activityLogs: number; activityTypes: Record<string, number> };
  daysSinceLastLog: number;
  planItemCompleted: { planItemId: string } | null;
  streaks: Partial<Record<StreakKind | 'team', { before: number; after: number }>>;
  streakResumed: boolean;
  personalRecords: PersonalRecord[];
  message: { id: string; text: string } | null;
  macroTargetMetDays: Partial<Record<Nutrient, number>>;
  teamAllLogged: boolean;
  onVacation: boolean;
  /** Weight change (kg, latest minus earliest) over the last N days, keyed by N. */
  weightChangeOver: (days: number) => number | null;
  weightNewLow: boolean;
  dayBand: 'green' | 'under' | 'over' | 'red' | null;
  teamKeywords: string[];
  roastOptOut: boolean;
}

export interface TriggerRule extends Omit<TriggerDefinition, 'enabled'> {
  id: string;
  enabled: boolean;
  order: number;
}

export interface FireRecord {
  triggerId: string;
  userId: string;
  memeId: string | null;
  cooldownKey: string;
  localDate: string;
  postedToChat: boolean;
}

export interface MemeRef {
  id: string;
  tags: string[];
  tone: MemeTone;
  enabled: boolean;
}

export interface TriggerDecision {
  triggerId: string;
  fire: boolean;
  reasons: string[];
  action: TriggerAction;
  memeId: string | null;
  cooldownKey: string;
  postsToChat: boolean;
}

export function compare(value: number, op: CompareOp, target: number): boolean {
  switch (op) {
    case 'gt':
      return value > target;
    case 'gte':
      return value >= target;
    case 'lt':
      return value < target;
    case 'lte':
      return value <= target;
    case 'eq':
      return Math.abs(value - target) < 1e-9;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function messageContains(text: string, words: string[]): string | null {
  for (const w of words) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(w.trim())}($|[^\\p{L}\\p{N}])`, 'iu');
    if (w.trim() && re.test(text)) return w;
  }
  return null;
}

/** Evaluate one condition; returns [matched, human-readable reason]. */
export function evaluateCondition(c: TriggerCondition, s: TriggerSnapshot): [boolean, string] {
  switch (c.type) {
    case 'meal_kcal':
      if (!s.meal) return [false, 'no meal in this event'];
      return [compare(s.meal.kcal, c.op, c.value), `meal ${Math.round(s.meal.kcal)} kcal ${c.op} ${c.value}`];
    case 'item_kcal': {
      if (!s.meal) return [false, 'no meal in this event'];
      const max = Math.max(0, ...s.meal.items.map((i) => i.kcal));
      return [s.meal.items.some((i) => compare(i.kcal, c.op, c.value)), `largest item ${Math.round(max)} kcal ${c.op} ${c.value}`];
    }
    case 'macro_amount':
      if (!s.meal) return [false, 'no meal in this event'];
      return [compare(s.meal.macros[c.macro], c.op, c.grams), `${c.macro} ${Math.round(s.meal.macros[c.macro])} g ${c.op} ${c.grams}`];
    case 'macro_percent': {
      const t = s.targets[c.macro];
      const pct = t > 0 ? (s.dayTotals[c.macro] / t) * 100 : 0;
      return [compare(pct, c.op, c.percent), `${c.macro} at ${Math.round(pct)}% ${c.op} ${c.percent}%`];
    }
    case 'food_tags': {
      if (!s.meal) return [false, 'no meal in this event'];
      const tags = new Set(s.meal.items.flatMap((i) => i.tags));
      const ok = c.match === 'any' ? c.tags.some((t) => tags.has(t)) : c.tags.every((t) => tags.has(t));
      return [ok, `meal tags [${[...tags].join(', ')}] ${c.match} of [${c.tags.join(', ')}]`];
    }
    case 'time_of_day':
      return [inWindow(hhmmToMinutes(s.localTime), c.from, c.to), `local time ${s.localTime} in ${c.from}–${c.to}`];
    case 'count_this_week': {
      let n = 0;
      if (c.what === 'food_tag') n = c.tag ? (s.weekCounts.foodTags[c.tag] ?? 0) : 0;
      if (c.what === 'food_logs') n = s.weekCounts.foodLogs;
      if (c.what === 'activity_logs') n = s.weekCounts.activityLogs;
      if (c.what === 'activity_type') n = c.activityTypeId ? (s.weekCounts.activityTypes[c.activityTypeId] ?? 0) : 0;
      return [compare(n, c.op, c.value), `${c.what}${c.tag ? `:${c.tag}` : ''} this week = ${n} ${c.op} ${c.value}`];
    }
    case 'days_since_last_log':
      return [compare(s.daysSinceLastLog, c.op, c.days), `${s.daysSinceLastLog} days since last log ${c.op} ${c.days}`];
    case 'plan_item_completed':
      return [!!s.planItemCompleted, s.planItemCompleted ? 'a weekly plan item was completed' : 'no plan item completed'];
    case 'streak_milestone': {
      const st = s.streaks[c.kind];
      if (!st) return [false, `no ${c.kind} streak change`];
      const hit = c.values.filter((v) => st.before < v && st.after >= v);
      return [hit.length > 0, `${c.kind} streak ${st.before} → ${st.after}${hit.length ? ` crossed ${hit.join(', ')}` : ''}`];
    }
    case 'streak_resumed':
      return [s.streakResumed, s.streakResumed ? 'first log after a pause' : 'no comeback'];
    case 'personal_record': {
      const hit = c.records.filter((r) => s.personalRecords.includes(r));
      return [hit.length > 0, hit.length ? `new record: ${hit.join(', ')}` : 'no new record'];
    }
    case 'message_contains': {
      if (!s.message) return [false, 'no message in this event'];
      const words = [...c.words, ...(c.useTeamKeywords ? s.teamKeywords : [])];
      const w = messageContains(s.message.text, words);
      return [w != null, w ? `message contains "${w}"` : 'no listed word in message'];
    }
    case 'member_in_list':
      return [c.userIds.includes(s.userId), 'member list check'];
    case 'macro_target_met_days': {
      const n = s.macroTargetMetDays[c.macro] ?? 0;
      return [n >= c.days, `${c.macro} target met ${n} days running (needs ${c.days})`];
    }
    case 'team_all_logged':
      return [s.teamAllLogged, s.teamAllLogged ? 'every active member logged today' : 'not everyone has logged'];
    case 'not_on_vacation':
      return [!s.onVacation, s.onVacation ? 'member is on vacation' : 'member not on vacation'];
    case 'weight_change': {
      const d = s.weightChangeOver(c.overDays);
      if (d == null) return [false, 'not enough weigh-ins'];
      const ok = c.direction === 'down' ? d <= -c.kg : d >= c.kg;
      return [ok, `weight changed ${d.toFixed(1)} kg over ${c.overDays} days`];
    }
    case 'weight_new_low':
      return [s.weightNewLow, s.weightNewLow ? 'new lowest weight' : 'not a new low'];
    case 'calorie_band':
      return [s.dayBand != null && c.bands.includes(s.dayBand), `day band ${s.dayBand ?? 'none'}`];
  }
}

export function cooldownKey(rule: Pick<TriggerRule, 'cooldown'>, s: TriggerSnapshot): string {
  switch (rule.cooldown) {
    case 'member_day':
      return `${s.userId}:${s.localDate}`;
    case 'member_week':
      return `${s.userId}:w${s.weekStart}`;
    case 'team_day':
      return `team:${s.localDate}`;
    case 'plan_item_week':
      return `${s.userId}:${s.planItemCompleted?.planItemId ?? 'none'}:w${s.weekStart}`;
    case 'record_week':
      return `${s.userId}:${[...s.personalRecords].sort().join(',') || 'none'}:w${s.weekStart}`;
    case 'none':
      return `${s.userId}:${s.eventKey}`;
  }
}

export const CHAT_POSTING_ACTIONS: TriggerAction[] = ['post_chat_tag', 'post_chat_no_tag', 'reply_to_message'];

export function selectMeme(
  rule: TriggerRule,
  memes: MemeRef[],
  fires: FireRecord[],
  userId: string,
  today: string,
  rng: () => number,
): string | null {
  if (rule.selection.mode === 'specific') {
    const m = memes.find((x) => x.id === (rule.selection as { memeId: string }).memeId && x.enabled);
    return m?.id ?? null;
  }
  const { tag, noRepeatDays } = rule.selection;
  const pool = memes.filter((m) => m.enabled && m.tags.includes(tag));
  if (!pool.length) return null;
  const since = addDays(today, -noRepeatDays);
  const recent = new Set(fires.filter((f) => f.userId === userId && f.memeId && f.localDate > since).map((f) => f.memeId));
  const fresh = pool.filter((m) => !recent.has(m.id));
  if (fresh.length) return fresh[Math.floor(rng() * fresh.length)]!.id;
  // Library exhausted for this member: use the one they saw longest ago.
  const lastSeen = new Map<string, string>();
  for (const f of fires) if (f.userId === userId && f.memeId) lastSeen.set(f.memeId, f.localDate > (lastSeen.get(f.memeId) ?? '') ? f.localDate : lastSeen.get(f.memeId)!);
  return [...pool].sort((a, b) => ((lastSeen.get(a.id) ?? '') < (lastSeen.get(b.id) ?? '') ? -1 : 1))[0]!.id;
}

/**
 * SYS-CHAT-10 order: match enabled triggers → opt-outs and exclusions → cooldowns and the daily chat cap → fire.
 * At most one trigger fires per member per event (first in rule order), so a busy moment is not a pile-on.
 */
export function evaluateTriggers(opts: {
  snapshot: TriggerSnapshot;
  rules: TriggerRule[];
  fires: FireRecord[];
  memes: MemeRef[];
  chatFiresToday: number;
  dailyChatCap: number;
  roastEnabledForTeam: boolean;
  rng: () => number;
  /** Dry runs report every rule's decision and ignore the one-per-event rule. */
  dryRun?: boolean;
}): TriggerDecision[] {
  const { snapshot: s } = opts;
  const decisions: TriggerDecision[] = [];
  let fired = false;
  let chatFires = opts.chatFiresToday;
  const LOG_EVENTS: TriggerEvent[] = ['food_log_saved', 'activity_log_saved', 'weight_log_saved'];
  const matchesEvent = (e: TriggerEvent) => e === s.event || (e === 'log_saved' && LOG_EVENTS.includes(s.event));
  const rules = [...opts.rules].filter((r) => matchesEvent(r.event)).sort((a, b) => a.order - b.order);
  for (const rule of rules) {
    const reasons: string[] = [];
    const key = cooldownKey(rule, s);
    const postsToChat = CHAT_POSTING_ACTIONS.includes(rule.action);
    const base = { triggerId: rule.id, action: rule.action, cooldownKey: key, postsToChat, memeId: null as string | null };
    const skip = (why: string) => decisions.push({ ...base, fire: false, reasons: [...reasons, why] });
    if (!rule.enabled && !opts.dryRun) {
      skip('trigger is off');
      continue;
    }
    const results = rule.conditions.map((c) => evaluateCondition(c, s));
    reasons.push(...results.map(([ok, why]) => `${ok ? '✓' : '✗'} ${why}`));
    const matched = rule.conditions.length === 0 ? true : rule.match === 'all' ? results.every(([ok]) => ok) : results.some(([ok]) => ok);
    if (!matched) {
      skip('conditions not met');
      continue;
    }
    if (rule.tone === 'roast') {
      if (!opts.roastEnabledForTeam) {
        skip('roast memes are off for the team');
        continue;
      }
      if (s.roastOptOut) {
        skip('member opted out of roasts');
        continue;
      }
      if (rule.conditions.some((c) => ROAST_FORBIDDEN_CONDITIONS.includes(c.type))) {
        skip('roasts cannot use weight or missed-band conditions');
        continue;
      }
    }
    if (rule.excludedUserIds.includes(s.userId)) {
      skip('member is excluded from this trigger');
      continue;
    }
    {
      const already = opts.fires.some((f) => f.triggerId === rule.id && f.cooldownKey === key);
      if (already) {
        skip(`cooldown: already fired for ${key}`);
        continue;
      }
    }
    if (postsToChat && chatFires >= opts.dailyChatCap) {
      skip(`daily chat meme cap reached (${opts.dailyChatCap})`);
      continue;
    }
    if (fired && !opts.dryRun) {
      skip('another trigger already fired for this event');
      continue;
    }
    const memeId = rule.action === 'react_to_message' ? null : selectMeme(rule, opts.memes, opts.fires, s.userId, s.localDate, opts.rng);
    if (rule.action !== 'react_to_message' && !memeId && !rule.caption) {
      skip('no meme available for this selection');
      continue;
    }
    decisions.push({ ...base, memeId, fire: true, reasons: [...reasons, 'fires'] });
    fired = true;
    if (postsToChat) chatFires += 1;
  }
  return decisions;
}
