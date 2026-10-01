import { z } from 'zod';
import { HHmmStr, IsoDateTime, LocalDateStr, Uuid, type PersonRef } from './common';

/* ───────── Habits: admin-defined daily checklist (skin care, laundry, reading…) ───────── */

export const HABIT_KINDS = ['check', 'count', 'duration', 'scale'] as const;
export const HabitKind = z.enum(HABIT_KINDS);
export type HabitKind = z.infer<typeof HabitKind>;

/** Sections on the member's list, in display order. */
export const HABIT_GROUPS = ['Morning', 'Home', 'Self-care', 'Evening'] as const;
export const HabitGroup = z.enum(HABIT_GROUPS);
export type HabitGroup = z.infer<typeof HabitGroup>;

export const HABIT_ICONS = ['☀️', '🌙', '💧', '📖', '🧺', '🪴', '✍️', '🦷', '🧘', '✨'] as const;
/** Tile hues (oklch hue angle) the admin can pick from. */
export const HABIT_HUES = [350, 25, 70, 145, 230, 290] as const;

/** Every day; picked weekdays (0 = Monday); or N times a week on any days, judged at the end of the week. */
export const HabitSchedule = z.object({
  type: z.enum(['daily', 'days', 'weekly']),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  perWeek: z.number().int().min(1).max(6),
});
export type HabitSchedule = z.infer<typeof HabitSchedule>;

export const AdminHabitInput = z
  .object({
    name: z.string().trim().min(1, 'Give the habit a name.').max(60, 'Keep the name under 60 characters.'),
    icon: z.string().min(1).max(16),
    hue: z.number().int().min(0).max(360),
    group: HabitGroup,
    kind: HabitKind,
    target: z.number().int().min(1, 'Target must be at least 1.').max(1000),
    unit: z.string().trim().max(20),
    schedule: HabitSchedule,
    assign: z.enum(['all', 'some']),
    memberIds: z.array(Uuid).max(500),
    required: z.boolean(),
    reminderTime: HHmmStr.nullable(),
    note: z.string().trim().max(300, 'Keep the note under 300 characters.').nullable(),
    startsOn: LocalDateStr,
    endsOn: LocalDateStr.nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.schedule.type === 'days' && v.schedule.days.length === 0) ctx.addIssue({ code: 'custom', path: ['schedule', 'days'], message: 'Pick at least one day.' });
    if (v.assign === 'some' && v.memberIds.length === 0) ctx.addIssue({ code: 'custom', path: ['memberIds'], message: 'Pick at least one member.' });
    if (v.endsOn && v.endsOn < v.startsOn) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'End date must be after the start.' });
  });
export type AdminHabitInput = z.infer<typeof AdminHabitInput>;

export const HabitEnabledRequest = z.object({ enabled: z.boolean() });

export interface HabitTemplate {
  key: string;
  label: string;
  input: Omit<AdminHabitInput, 'startsOn' | 'endsOn' | 'assign' | 'memberIds'>;
}

const tpl = (key: string, label: string, x: Partial<HabitTemplate['input']> & Pick<HabitTemplate['input'], 'name' | 'icon' | 'hue' | 'group'>): HabitTemplate => ({
  key,
  label,
  input: { kind: 'check', target: 1, unit: '', schedule: { type: 'daily', days: [], perWeek: 3 }, required: true, reminderTime: null, note: null, ...x },
});

/** Starter set (ADM habits templates): added for everyone, edited after adding. */
export const HABIT_TEMPLATES: HabitTemplate[] = [
  tpl('skin_am', 'Skin care AM', { name: 'Morning skin care', icon: '☀️', hue: 70, group: 'Morning', reminderTime: '07:30', note: 'Cleanser, serum, sunscreen.' }),
  tpl('skin_pm', 'Skin care PM', { name: 'Night skin care', icon: '🌙', hue: 290, group: 'Evening', reminderTime: '22:00', note: 'Remove sunscreen, moisturise.' }),
  tpl('laundry', 'Laundry 2×/week', { name: 'Laundry', icon: '🧺', hue: 145, group: 'Home', schedule: { type: 'weekly', days: [], perWeek: 2 } }),
  tpl('plants', 'Water plants', { name: 'Water plants', icon: '🪴', hue: 145, group: 'Home', schedule: { type: 'days', days: [0, 3], perWeek: 2 } }),
  tpl('read', 'Read 20 min', { name: 'Read', icon: '📖', hue: 25, group: 'Evening', kind: 'duration', target: 20, unit: 'min', required: false }),
  tpl('journal', 'Journal', { name: 'Journal', icon: '✍️', hue: 230, group: 'Evening', required: false }),
  tpl('water', 'Drink water 8 glasses', { name: 'Drink water', icon: '💧', hue: 230, group: 'Self-care', kind: 'count', target: 8, unit: 'glasses', required: false }),
];

export interface AdminHabitDto {
  id: string;
  name: string;
  icon: string;
  hue: number;
  group: HabitGroup;
  kind: HabitKind;
  target: number;
  unit: string;
  schedule: HabitSchedule;
  assign: 'all' | 'some';
  memberIds: string[];
  required: boolean;
  reminderTime: string | null;
  note: string | null;
  startsOn: string;
  endsOn: string | null;
  enabled: boolean;
  hasCheckins: boolean;
  /** Share of scheduled days kept over the last 14 finished days, 0–100; null before anything was due. */
  adherence14: number | null;
  updatedAt: string;
}

export interface AdminHabitsResponse {
  habits: AdminHabitDto[];
  kpis: {
    active: number;
    required: number;
    off: number;
    teamAdherence: number | null;
    requiredToday: { kept: number; total: number; pending: string[] };
  };
}

export interface AdminHabitAdherence {
  from: string;
  to: string;
  habits: { id: string; name: string; icon: string; hue: number }[];
  /** One cell per habit, in `habits` order; null when the habit isn't assigned to that member. */
  rows: { person: PersonRef; cells: ({ pct: number | null; kept: number; scheduled: number } | null)[]; avg: number | null }[];
}

/* ───────── Member side ───────── */

export interface HabitDto {
  id: string;
  name: string;
  icon: string;
  hue: number;
  group: HabitGroup;
  kind: HabitKind;
  target: number;
  unit: string;
  schedule: HabitSchedule;
  scheduleLabel: string;
  required: boolean;
  note: string | null;
  /** The member's reminder (their override, else the admin default); null when off or none. */
  reminderTime: string | null;
  defaultReminderTime: string | null;
  reminderOff: boolean;
  setBy: string | null;
}

export interface HabitDayItem extends HabitDto {
  value: number;
  done: boolean;
  checkinId: string | null;
  addedLate: boolean;
  /** Weekly habits: days done this week vs times a week. */
  week: { done: number; target: number } | null;
}

export interface HabitDayResponse {
  date: string;
  today: string;
  /** Today and yesterday can be ticked; yesterday's ticks are marked added later. */
  editable: boolean;
  items: HabitDayItem[];
  done: number;
  total: number;
  streak: { current: number; best: number };
  hidden: { id: string; name: string; icon: string }[];
}

export const HabitCheckinUpsert = z.object({
  habitId: Uuid,
  date: LocalDateStr,
  value: z.number().min(0).max(10000),
  clientUpdatedAt: IsoDateTime,
});
export type HabitCheckinUpsert = z.infer<typeof HabitCheckinUpsert>;

export interface HabitCheckinDto {
  id: string;
  habitId: string;
  date: string;
  value: number;
  done: boolean;
  addedLate: boolean;
  clientUpdatedAt: string;
}

export type HabitCellState = 'done' | 'miss' | 'off' | 'today' | 'future';

export interface HabitDetailResponse {
  habit: HabitDto;
  today: string;
  /** Five Monday-start weeks ending with this week. */
  cells: { date: string; state: HabitCellState; value: number }[];
  current: number;
  best: number;
  adherence14: number | null;
}

export const HabitPrefUpdate = z.object({
  hidden: z.boolean().optional(),
  /** Member's own reminder time; null goes back to the admin default. */
  reminderTime: HHmmStr.nullable().optional(),
  reminderOff: z.boolean().optional(),
});
export type HabitPrefUpdate = z.infer<typeof HabitPrefUpdate>;

export interface HabitWeekResponse {
  days: { date: string; done: number; total: number }[];
  /** Habits done on every scheduled day of the last 7 (weekly ones: on pace). */
  kept: number;
  total: number;
  slipping: string[];
}
