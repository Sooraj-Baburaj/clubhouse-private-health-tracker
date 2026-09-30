import { z } from 'zod';
import { HHmmStr, LocalDateStr } from './common';

export interface PlanItemDto {
  itemId: string;
  typeId: string;
  typeKey: string;
  typeName: string;
  icon: string;
  perWeek: number | null;
  perMonth: number | null;
  targetMin: number | null;
  note: string | null;
  done: number;
  target: number;
  days: { weekday: number; time: string }[];
  suggestedDays: number[];
}

export interface WeekStripDay {
  date: string;
  weekday: number;
  planned: { itemId: string; typeName: string; time: string }[];
  done: { typeName: string; durationMin: number }[];
  status: 'done' | 'missed' | 'upcoming' | 'today' | 'rest' | 'none';
}

export interface MyPlanResponse {
  hasPlan: boolean;
  note: string | null;
  items: PlanItemDto[];
  weekStart: string;
  week: WeekStripDay[];
  anyDayStillCounts: boolean;
  proposals: { id: string; text: string; status: string; adminReply: string | null; createdAt: string }[];
  restWeek: { weekStart: string; status: string } | null;
}

export const SetPlanDaysRequest = z.object({
  items: z.array(z.object({ itemId: z.string().uuid(), days: z.array(z.object({ weekday: z.number().int().min(0).max(6), time: HHmmStr })).max(7) })).max(20),
});
export type SetPlanDaysRequest = z.infer<typeof SetPlanDaysRequest>;
export const ProposalRequest = z.object({ text: z.string().trim().min(3).max(500) });
export const RestWeekRequest = z.object({ weekStart: LocalDateStr, reason: z.string().trim().max(200).optional() });
