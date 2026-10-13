import type { Band, Nutrient, PersonalRecord, StreakKind } from '../index';
import type { Nutrients, PersonRef } from './common';
import type { ActivityLogDto, FoodLogDto } from './logs';
import type { AwardKey, BoardStatus } from './board';

export interface ForecastDto {
  locked: boolean;
  loggedDays: number;
  avgNet: number;
  sdNet: number;
  weeklyChangeKg: number;
  projectedAtGoalDate: { date: string; kg: number; lowKg: number; highKg: number } | null;
  goalEta: { date: string; weeks: number } | null;
  etaBeyondYear: boolean;
  series: { date: string; kg: number; lowKg: number; highKg: number }[];
  sentence: string;
  tdee: number | null;
}

export interface WeightProgressResponse {
  range: '4w' | '3m' | '1y' | 'all';
  unit: 'metric' | 'imperial';
  points: { date: string; kg: number; trend: number }[];
  latestKg: number | null;
  trendKg: number | null;
  deltaKg: number | null;
  goalKg: number | null;
  goalDate: string | null;
  forecast: ForecastDto;
  narrative: { text: string; ai: boolean; aiCallId: string | null };
}

export interface CaloriesProgressResponse {
  range: '1w' | '4w' | '3m';
  days: { date: string; eaten: number; burned: number; target: number | null; budget: number | null; cls: 'in' | 'over' | 'under' | 'none'; isToday: boolean; logged: boolean }[];
  avgIn: number;
  totalBurned: number;
  weightChangeKg: number | null;
  daysInRange: number;
  daysLogged: number;
}

export interface NutrientGridResponse {
  weekStart: string;
  days: { date: string; logged: boolean; bands: Record<Exclude<Nutrient, 'kcal'>, { band: Band; label: string } | null> }[];
  greenCounts: Record<Exclude<Nutrient, 'kcal'>, number>;
}

export interface ActivityProgressResponse {
  /** Sessions count one per activity a day (a second walk the same day adds minutes, not a session). */
  weeks: { weekStart: string; sessions: number; planned: number; minutes: number; burn: number }[];
  records: { record: PersonalRecord; label: string; value: number; unit: string; date: string }[];
  hasPlan: boolean;
}

export type ConsistencyPart = 'logging' | 'calories' | 'protein' | 'activity' | 'habits';

/** One week or month of consistency (SYS-CALC-33 v2). A part is null when it doesn't apply or nothing is due yet. */
export interface ConsistencyDto {
  period: 'week' | 'month';
  start: string;
  end: string;
  /** Null while nothing is due yet. */
  score: number | null;
  word: 'solid' | 'building' | 'rough week' | null;
  parts: Record<ConsistencyPart, { pct: number; done: number; due: number; weight: number } | null>;
}

/** One point of history; `viewer` is the person looking, on someone else's profile. */
export interface ConsistencyPoint {
  start: string;
  score: number | null;
  viewer?: number | null;
}

export interface ConsistencyResponse {
  week: ConsistencyDto;
  month: ConsistencyDto;
  /** Oldest first, ending with the current week (12) and month (6). */
  weeks: ConsistencyPoint[];
  months: ConsistencyPoint[];
}

export interface StreakDto {
  kind: StreakKind;
  current: number;
  best: number;
  status: 'active' | 'paused' | 'reset' | 'vacation';
  graceLeft: number;
  pausedSince: string | null;
  atRisk: boolean;
  history: { date: string; state: string }[];
}

export interface MomentumResponse {
  today: string;
  streaks: Record<StreakKind, StreakDto>;
  team: { current: number; best: number; status: string; enabled: boolean };
  badges: { kind: string; days: number; name: string; emoji: string; earnedAt: string; seen: boolean }[];
  nextMilestone: { days: number; name: string; emoji: string; inDays: number } | null;
  graceBankMax: number;
  vacation: { active: boolean; from: string | null; until: string | null; daysLeftThisQuarter: number; quota: number };
  crew: (PersonRef & { logged: boolean })[];
}

export interface TeamMemberSummary {
  person: PersonRef;
  isMe: boolean;
  logged: boolean;
  mealsLogged: number;
  bandLabel: string | null;
  band: Band | null;
  streak: number;
  pulse: { consistencyWord: string; consistencyScore: number; sessions: number } | null;
  canViewFull: boolean;
}

export interface TeamSummaryResponse {
  date: string;
  members: TeamMemberSummary[];
  anonymisedCount: number;
  anonymisedPulse: { avgConsistency: number; sessions: number } | null;
  teamStreak: number;
  /** Longest team streak so far (0 when the team streak is off). */
  teamStreakBest: number;
  teamStreakEnabled: boolean;
  myPulseOptIn: boolean;
}

export interface MemberDayResponse {
  person: PersonRef;
  date: string;
  summary: { eaten: number; targetKcal: number | null; bandLabel: string | null; band: Band | null; mealsLogged: number; burned: number; activities: { typeName: string; durationMin: number }[]; streak: number };
  full: { foodLogs: FoodLogDto[]; activityLogs: ActivityLogDto[] } | null;
  /** Habits due that day; `done` names only when the member shares their habits (or it's you). Null with none due. */
  habits: { done: number; total: number; doneNames: string[] | null } | null;
}

/** A teammate's profile: streaks, personal records, badges, the board and habits — never weight, calories or foods. */
export interface MemberProfileResponse {
  person: PersonRef;
  isMe: boolean;
  /** Member since (their local date). */
  joinedOn: string | null;
  onVacation: boolean;
  /** What they share beyond the summary: meal-by-meal logs, and which habits they keep. */
  shares: { fullLogs: boolean; habits: boolean };
  streaks: { kind: StreakKind; current: number; best: number; status: StreakDto['status'] }[];
  records: { record: PersonalRecord; label: string; value: number; unit: string; date: string }[];
  badges: { kind: string; days: number; name: string; emoji: string; earnedAt: string }[];
  /** Null while the leaderboard is off for the team. */
  board: {
    /** They left themselves off the board (privacy); you always see your own. */
    hidden: boolean;
    week: { number: number; rank: number | null; points: number; status: BoardStatus } | null;
    crown: boolean;
    solid: { solidDays: number; eligibleDays: number } | null;
    weeksRanked: number;
    bestWeek: { points: number; weekStart: string } | null;
    wins: number;
    podiums: number;
    awards: { key: AwardKey; count: number }[];
  } | null;
  /** Their consistency; on someone else's profile the history also carries the viewer's, to compare. */
  consistency: ConsistencyResponse;
  /** Null when they have no habits. Names of today's kept habits only when they share habits. */
  habits: { doneToday: number; totalToday: number; streak: { current: number; best: number }; keptToday: string[] | null } | null;
}

export interface RecapDto {
  weekStart: string;
  highlight: string;
  tryNext: string;
  teamFact: string;
  stats: Record<string, number | string>;
  createdAt: string;
}

export type { Nutrients };
