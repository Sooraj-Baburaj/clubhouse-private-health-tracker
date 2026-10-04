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

/** How a food is measured. Volume units (ml, cup, glass) count 1 ml as 1 g for nutrition. */
export const PORTION_UNITS = ['g', 'ml', 'piece', 'scoop', 'cup', 'glass', 'katori', 'bowl', 'plate', 'tbsp', 'tsp', 'slice', 'packet', 'serving', 'custom'] as const;
export const PortionUnit = z.enum(PORTION_UNITS);
export type PortionUnit = z.infer<typeof PortionUnit>;

/**
 * One way to measure a food. `label` and `grams` are what logs and older clients use; foods made with portions carry
 * the structured `amount` × `unit` too. `estimated` marks a nominal weight (the member didn't know it): shown with ≈.
 */
export const ServingOptionSchema = z.object({
  label: z.string().min(1).max(40),
  grams: z.number().positive().max(5000),
  unit: PortionUnit.optional(),
  amount: z.number().positive().max(1000).optional(),
  estimated: z.boolean().optional(),
});
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
