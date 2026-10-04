import { z } from 'zod';
import type { MealSlot } from '../enums';
import { LocalDateStr, type PersonRef } from './common';

/*
 * Crew leaderboard (Team tab). Points come from each member's own targets and plan; a board never carries calories,
 * grams, foods or weight — only ranks, points, category points, day states and streaks.
 */

/** A day on the board: a solid day, something logged, nothing, away (vacation or before joining), today, to come. */
export const BOARD_DAY_STATES = ['full', 'partial', 'none', 'away', 'today', 'future'] as const;
export type BoardDayState = (typeof BOARD_DAY_STATES)[number];

/** Last 28 days on the Solid days view. */
export const SOLID_DAY_STATES = ['solid', 'logged', 'none', 'away', 'pre'] as const;
export type SolidDayState = (typeof SOLID_DAY_STATES)[number];

export const AWARD_KEYS = ['winner', 'consistent', 'streak', 'plan', 'protein', 'comeback'] as const;
export type AwardKey = (typeof AWARD_KEYS)[number];

export const AWARD_META: Record<AwardKey, { emoji: string; title: string }> = {
  winner: { emoji: '🏆', title: 'Week winner' },
  consistent: { emoji: '👑', title: 'Most consistent' },
  streak: { emoji: '🔥', title: 'Iron streak' },
  plan: { emoji: '💪', title: 'Plan keeper' },
  protein: { emoji: '🥚', title: 'Protein pro' },
  comeback: { emoji: '📈', title: 'Comeback' },
};

/** Ranked, away this week (4+ days off), or new (joined too late in the week to rank). */
export type BoardStatus = 'ranked' | 'away' | 'new';

export interface BoardPartsDto {
  meals: number;
  calories: number;
  protein: number;
  workouts: number;
  bonus: number;
  /** Vacation days credited with the member's average day. */
  away: number;
}

export interface BoardDayDto {
  date: string;
  state: BoardDayState;
  points: number;
}

export interface BoardRowDto {
  person: PersonRef;
  isMe: boolean;
  rank: number | null;
  points: number;
  /** Places gained (+) or lost (−) since yesterday morning's standings; null when there is nothing to compare. */
  movement: number | null;
  status: BoardStatus;
  days: BoardDayDto[];
  /** Logging streak. */
  streak: number;
  crown: boolean;
}

export interface SolidRowDto {
  person: PersonRef;
  isMe: boolean;
  rank: number | null;
  solidDays: number;
  eligibleDays: number;
  /** Ranked from 7 eligible days; "warming up" before that. */
  status: 'ranked' | 'warming_up';
  strip: SolidDayState[];
  streak: number;
  crown: boolean;
}

export interface AwardDto {
  key: AwardKey;
  person: PersonRef;
  isMe: boolean;
  why: string;
}

export interface WeekResultsDto {
  weekStart: string;
  weekNumber: number;
  podium: { person: PersonRef; isMe: boolean; rank: number; points: number }[];
  standings: { person: PersonRef; isMe: boolean; rank: number | null; points: number; status: BoardStatus }[];
  awards: AwardDto[];
  /** The viewer's result; `best` when it beat every earlier week. Null when the viewer had no row. */
  me: { rank: number | null; points: number; best: boolean } | null;
}

export interface NextActionDto {
  kind: 'meal' | 'finish' | 'workout' | 'weigh_in';
  slot?: MealSlot;
  /** The photo-only meal to finish. */
  logId?: string;
  label: string;
  points: number;
}

export interface MyWeekDto {
  rank: number | null;
  points: number;
  /** `hidden`: the viewer opted out of the board; `wouldBeRank` is shown only to them. */
  status: BoardStatus | 'hidden';
  wouldBeRank: number | null;
  /** The next person up (or, when leading, the runner-up). */
  gap: { kind: 'behind' | 'ahead' | 'level'; points: number; name: string } | null;
  /** Calorie and protein points still to land for days that haven't settled (yours only). */
  pending: number;
  nextActions: NextActionDto[];
}

export interface BoardResponse {
  enabled: boolean;
  /** Who switched the board off, when it is off and that is known. */
  offBy: string | null;
  week: { start: string; end: string; number: number; isCurrent: boolean; closesAt: string };
  me: MyWeekDto | null;
  rows: BoardRowDto[];
  solid: SolidRowDto[];
  rankedCount: number;
  lastWeek: WeekResultsDto | null;
  rules: { workoutMinMinutes: number; workoutCap: number; noPlanTarget: number };
  updatedAt: string;
}

export interface MemberPointsResponse {
  person: PersonRef;
  isMe: boolean;
  weekStart: string;
  rank: number | null;
  points: number;
  status: BoardStatus;
  /** `items` (how each day's points were earned) only for the viewer's own card. */
  days: { date: string; state: BoardDayState; points: number; items: { label: string; points: number }[] | null }[];
  parts: BoardPartsDto;
  streak: number;
  badges: number;
}

export const BoardQuery = z.object({ week: LocalDateStr.optional() });
