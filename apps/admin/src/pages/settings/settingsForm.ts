import { DEFAULT_BOARD_SETTINGS, DEFAULT_MEAL_SLOTS, DEFAULT_STREAK_SETTINGS, DEFAULT_TEAM_SETTINGS, MEAL_SLOTS, TeamSettingsUpdate, type MealSlot } from '@clubhouse/contracts';
import type { TeamSettingsData } from '@/features/settings';
import { fromDateTimeLocal, toDateTimeLocal } from '@/lib/format';

type Num = number | null;

/** Editable copy of the team settings. Numbers are nullable while a field is being retyped. */
export interface SettingsForm {
  name: string;
  timezone: string;
  units: 'metric' | 'imperial';
  /** `changed` = a new logo was uploaded or the old one removed (sent as `logoImageId`). */
  logo: { changed: boolean; imageId: string | null; url: string | null };
  privacyDefault: 'summary' | 'full';
  roastDefault: boolean;
  eatBackDefault: boolean;
  mealSlots: Record<MealSlot, { label: string; until: string | null }>;
  featureFlags: { teamPulse: boolean; roastMemes: boolean; naturalLanguageEntry: boolean; leaderboard: boolean };
  board: { workoutMinMinutes: Num; workoutCap: Num; noPlanTarget: Num; postResults: boolean; showOnDashboard: boolean };
  streaks: {
    graceEarnedPer7: Num;
    graceBankMax: Num;
    pauseWindowDays: Num;
    resetAfterDays: Num;
    vacationDaysPerQuarter: Num;
    teamStreakEnabled: boolean;
    milestones: number[];
    teamMilestones: number[];
  };
  memes: { dailyChatCap: Num; confidenceThreshold: Num };
  chat: { digestMinutes: Num };
  /** `startsAt`/`endsAt` are `datetime-local` values ('' = none). */
  banner: { on: boolean; message: string; startsAt: string; endsAt: string };
}

export type SectionKey = 'team' | 'defaults' | 'mealSlots' | 'flags' | 'streaks' | 'board' | 'memesChat' | 'banner';

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'team', label: 'Team' },
  { key: 'defaults', label: 'Member defaults' },
  { key: 'mealSlots', label: 'Meal slots' },
  { key: 'flags', label: 'Feature flags' },
  { key: 'streaks', label: 'Streaks' },
  { key: 'board', label: 'Leaderboard' },
  { key: 'memesChat', label: 'Memes & chat' },
  { key: 'banner', label: 'Maintenance banner' },
];

export function toForm(d: TeamSettingsData): SettingsForm {
  const s = d.settings;
  const D = DEFAULT_TEAM_SETTINGS;
  const streaks = { ...DEFAULT_STREAK_SETTINGS, ...s.streaks };
  const mealSlots = Object.fromEntries(MEAL_SLOTS.map((k) => [k, { ...(s.mealSlots?.[k] ?? DEFAULT_MEAL_SLOTS[k]) }])) as SettingsForm['mealSlots'];
  const b = s.maintenanceBanner;
  return {
    name: d.name,
    timezone: d.timezone,
    units: d.units,
    logo: { changed: false, imageId: null, url: d.logoUrl },
    privacyDefault: s.privacyDefault ?? D.privacyDefault,
    roastDefault: s.roastDefault ?? D.roastDefault,
    eatBackDefault: s.eatBackDefault ?? D.eatBackDefault,
    mealSlots,
    featureFlags: { ...D.featureFlags, ...s.featureFlags },
    board: { ...DEFAULT_BOARD_SETTINGS, ...s.board },
    streaks: { ...streaks, milestones: sortNums(streaks.milestones), teamMilestones: sortNums(streaks.teamMilestones) },
    memes: { ...D.memes, ...s.memes },
    chat: { digestMinutes: s.chat?.digestMinutes ?? D.chat.digestMinutes },
    banner: b ? { on: true, message: b.message, startsAt: toDateTimeLocal(b.startsAt), endsAt: toDateTimeLocal(b.endsAt) } : { on: false, message: '', startsAt: '', endsAt: '' },
  };
}

export function sortNums(v: number[]): number[] {
  return Array.from(new Set(v)).sort((a, b) => a - b);
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function pick(f: SettingsForm, k: SectionKey): unknown {
  switch (k) {
    case 'team':
      return [f.name, f.timezone, f.units, f.logo];
    case 'defaults':
      return [f.privacyDefault, f.roastDefault, f.eatBackDefault];
    case 'mealSlots':
      return f.mealSlots;
    case 'flags': {
      // The leaderboard switch lives on the Leaderboard card.
      const { leaderboard: _board, ...flags } = f.featureFlags;
      return flags;
    }
    case 'board':
      return [f.featureFlags.leaderboard, f.board];
    case 'streaks':
      return f.streaks;
    case 'memesChat':
      return [f.memes, f.chat];
    case 'banner':
      // A switched-off banner is "no banner" whatever the draft text says.
      return f.banner.on ? f.banner : null;
  }
}

export function dirtySections(base: SettingsForm, cur: SettingsForm): SectionKey[] {
  return SECTIONS.map((s) => s.key).filter((k) => !eq(pick(base, k), pick(cur, k)));
}

/** Only the changed keys, shaped for `TeamSettingsUpdate` (validated by the caller). */
export function buildUpdate(base: SettingsForm, cur: SettingsForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (cur.name.trim() !== base.name.trim()) out.name = cur.name.trim();
  if (cur.timezone !== base.timezone) out.timezone = cur.timezone;
  if (cur.units !== base.units) out.units = cur.units;
  if (cur.logo.changed && !eq(cur.logo, base.logo)) out.logoImageId = cur.logo.imageId;
  if (cur.privacyDefault !== base.privacyDefault) out.privacyDefault = cur.privacyDefault;
  if (cur.roastDefault !== base.roastDefault) out.roastDefault = cur.roastDefault;
  if (cur.eatBackDefault !== base.eatBackDefault) out.eatBackDefault = cur.eatBackDefault;
  if (!eq(cur.mealSlots, base.mealSlots)) {
    out.mealSlots = Object.fromEntries(MEAL_SLOTS.map((k) => [k, { label: cur.mealSlots[k].label.trim(), until: cur.mealSlots[k].until || null }]));
  }
  const flags = changedKeys(base.featureFlags, cur.featureFlags);
  if (flags) out.featureFlags = flags;
  if (!eq(cur.streaks, base.streaks)) out.streaks = { ...cur.streaks, milestones: sortNums(cur.streaks.milestones), teamMilestones: sortNums(cur.streaks.teamMilestones) };
  const board = changedKeys(base.board, cur.board);
  if (board) out.board = board;
  const memes = changedKeys(base.memes, cur.memes);
  if (memes) out.memes = memes;
  if (cur.chat.digestMinutes !== base.chat.digestMinutes) out.chat = { digestMinutes: cur.chat.digestMinutes };
  if (!eq(pick(base, 'banner'), pick(cur, 'banner'))) {
    out.maintenanceBanner = cur.banner.on ? { message: cur.banner.message.trim(), startsAt: fromDateTimeLocal(cur.banner.startsAt), endsAt: fromDateTimeLocal(cur.banner.endsAt) } : null;
  }
  return out;
}

function changedKeys<T extends Record<string, unknown>>(a: T, b: T): Partial<T> | null {
  const out: Partial<T> = {};
  let any = false;
  for (const k of Object.keys(b) as (keyof T)[]) {
    if (!eq(a[k], b[k])) {
      out[k] = b[k];
      any = true;
    }
  }
  return any ? out : null;
}

type Issue = NonNullable<ReturnType<typeof TeamSettingsUpdate.safeParse>['error']>['issues'][number];

function issueMessage(i: Issue): string {
  switch (i.code) {
    case 'too_small':
      return i.origin === 'string' ? (Number(i.minimum) <= 1 ? 'Required' : `At least ${i.minimum} characters`) : i.origin === 'array' ? `Add at least ${i.minimum}` : `Use ${i.minimum} or more`;
    case 'too_big':
      return i.origin === 'string' ? `Keep it under ${i.maximum} characters` : i.origin === 'array' ? `Up to ${i.maximum}` : `Use ${i.maximum} or less`;
    case 'invalid_type':
      return 'Required';
    case 'invalid_format':
      return i.format === 'regex' ? 'Use HH:mm' : i.format === 'datetime' ? 'Pick a date and time' : i.format === 'uuid' ? 'Upload the logo again' : i.message;
    default:
      return i.message;
  }
}

/** Field-path keyed errors ("streaks.graceBankMax", "mealSlots.lunch.until", "name", …). */
export type Errors = Record<string, string>;

/** Schema validation plus the checks the schema can't express (slot order, banner window). */
export function validate(cur: SettingsForm, candidate: Record<string, unknown>): { ok: true; data: TeamSettingsUpdate } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  if ('mealSlots' in candidate) {
    let prev: { label: string; until: string } | null = null;
    for (const k of MEAL_SLOTS) {
      const s = cur.mealSlots[k];
      if (!s.until) {
        if (k !== MEAL_SLOTS[MEAL_SLOTS.length - 1]) errors[`mealSlots.${k}.until`] = 'Pick a time';
        continue;
      }
      if (prev && s.until <= prev.until) errors[`mealSlots.${k}.until`] = `Make this later than ${prev.label || 'the slot before'} (${prev.until})`;
      prev = { label: s.label.trim(), until: s.until };
    }
  }
  if (cur.banner.on && 'maintenanceBanner' in candidate) {
    if (!cur.banner.message.trim()) errors['maintenanceBanner.message'] = 'Add a message, or remove the banner';
    const a = fromDateTimeLocal(cur.banner.startsAt);
    const b = fromDateTimeLocal(cur.banner.endsAt);
    if (a && b && b <= a) errors['maintenanceBanner.endsAt'] = 'End after the start time';
  }
  const parsed = TeamSettingsUpdate.safeParse(candidate);
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      const key = i.path.map(String).join('.');
      if (!errors[key]) errors[key] = issueMessage(i);
    }
  }
  if (Object.keys(errors).length || !parsed.success) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}

/** Which section a field-error key belongs to (for the save bar and side nav). */
export function sectionOf(key: string): SectionKey {
  const head = key.split('.')[0] ?? '';
  if (['name', 'timezone', 'units', 'logoImageId'].includes(head)) return 'team';
  if (['privacyDefault', 'roastDefault', 'eatBackDefault'].includes(head)) return 'defaults';
  if (head === 'mealSlots') return 'mealSlots';
  if (key === 'featureFlags.leaderboard' || head === 'board') return 'board';
  if (head === 'featureFlags') return 'flags';
  if (head === 'streaks') return 'streaks';
  if (head === 'memes' || head === 'chat') return 'memesChat';
  return 'banner';
}
