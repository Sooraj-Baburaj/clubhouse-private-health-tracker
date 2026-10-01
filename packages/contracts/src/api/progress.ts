import type { Band, Nutrient, PersonalRecord, StreakKind } from '../index';
import type { Nutrients, PersonRef } from './common';
import type { ActivityLogDto, FoodLogDto } from './logs';

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
  weeks: { weekStart: string; sessions: number; planned: number; minutes: number; burn: number }[];
  records: { record: PersonalRecord; label: string; value: number; unit: string; date: string }[];
  hasPlan: boolean;
}

export interface ConsistencyResponse {
  current: { weekStart: string; score: number; word: 'solid' | 'building' | 'rough week'; components: { logging: number; inBand: number; plan: number } };
  history: { weekStart: string; score: number }[];
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

export interface RecapDto {
  weekStart: string;
  highlight: string;
  tryNext: string;
  teamFact: string;
  stats: Record<string, number | string>;
  createdAt: string;
}

export type { Nutrients };
