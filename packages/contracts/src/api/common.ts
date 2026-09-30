import { z } from 'zod';

export const Uuid = z.string().uuid();
export const IsoDateTime = z.string().datetime({ offset: true });
export const LocalDateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const HHmmStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const Nutrients = z.object({
  kcal: z.number().min(0).max(20000),
  protein: z.number().min(0).max(2000),
  carbs: z.number().min(0).max(3000),
  fat: z.number().min(0).max(2000),
  fibre: z.number().min(0).max(500),
});
export type Nutrients = z.infer<typeof Nutrients>;

export const ServingOptionSchema = z.object({ label: z.string().min(1).max(40), grams: z.number().positive().max(5000) });
export type ServingOptionDto = z.infer<typeof ServingOptionSchema>;

export interface ApiError {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  fields?: Record<string, string>;
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

export interface BandDto {
  band: 'green' | 'yellow' | 'red' | 'neutral';
  direction: 'under' | 'ok' | 'over';
  label: string;
  icon: 'check' | 'dash' | 'alert' | 'progress';
  pct: number;
}

export interface PersonRef {
  id: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
}
