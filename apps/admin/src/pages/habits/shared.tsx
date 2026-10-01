import type { AdminHabitDto, HabitKind } from '@clubhouse/contracts';
import { habitScheduleLabel } from '@clubhouse/domain';
import { cn } from '@/lib/cn';

/** Pastel tile behind a habit's emoji (design: oklch 0.93 0.045 hue). */
export const habitTile = (hue: number) => `oklch(0.93 0.045 ${hue})`;
/** Swatch shown in the colour picker. */
export const habitSwatch = (hue: number) => `oklch(0.8 0.1 ${hue})`;

export function HabitIcon({ icon, hue, size = 34, className }: { icon: string; hue: number; size?: number; className?: string }) {
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-[10px]', className)} style={{ width: size, height: size, background: habitTile(hue), fontSize: Math.round(size * 0.5) }}>
      {icon}
    </span>
  );
}

export function kindLabel(h: Pick<AdminHabitDto, 'kind' | 'target' | 'unit'>): string {
  return ({ check: 'Check', count: `Count · ${h.target} ${h.unit}`, duration: `Duration · ${h.target} min`, scale: 'Scale · 1–5' } satisfies Record<HabitKind, string>)[h.kind];
}

export const scheduleLabel = (h: Pick<AdminHabitDto, 'schedule'>) => habitScheduleLabel(h.schedule);

export const KIND_HINT: Record<HabitKind, string> = {
  check: 'Done or not done. One tap for members.',
  count: 'Members tap until they reach the target.',
  duration: 'Members add minutes in steps of ten until they reach the target.',
  scale: 'Members rate 1–5. Any rating completes the habit.',
};

/** Heatmap shades (design): under 40, 40–59, 60–79, 80+. */
export function heatShade(pct: number | null): { bg: string; fg: string } {
  if (pct == null) return { bg: '#F8F7F4', fg: '#6B6B76' };
  if (pct >= 80) return { bg: '#B6316C', fg: '#fff' };
  if (pct >= 60) return { bg: '#DF7FA6', fg: '#fff' };
  if (pct >= 40) return { bg: '#F3BFD4', fg: '#8C1F50' };
  return { bg: '#FBEAF1', fg: '#8C1F50' };
}

export const HEAT_LEGEND: { label: string; bg: string }[] = [
  { label: 'Not assigned', bg: '#F8F7F4' },
  { label: 'Under 40%', bg: '#FBEAF1' },
  { label: '40–59%', bg: '#F3BFD4' },
  { label: '60–79%', bg: '#DF7FA6' },
  { label: '80%+', bg: '#B6316C' },
];
