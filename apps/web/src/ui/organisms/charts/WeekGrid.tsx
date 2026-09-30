import { motion, useReducedMotion } from 'motion/react';
import type { Band, NutrientGridResponse } from '@clubhouse/contracts';
import { BandIcon } from '@/ui/atoms/Badges';
import { cn } from '@/lib/cn';
import { dateLabel } from '@/features/format';

export type GridNutrient = 'protein' | 'carbs' | 'fat' | 'fibre';
export const GRID_ROWS: { key: GridNutrient; label: string }[] = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
  { key: 'fibre', label: 'Fibre' },
];

const CELL: Record<Band, string> = {
  green: 'bg-band-green-bg text-band-green-fg',
  yellow: 'bg-band-yellow-bg text-band-yellow-fg',
  red: 'bg-band-red-bg text-band-red-fg',
  neutral: 'bg-band-neutral-bg text-band-neutral-fg',
};
const ICON: Record<Band, 'check' | 'dash' | 'alert' | 'progress'> = { green: 'check', yellow: 'dash', red: 'alert', neutral: 'progress' };

export interface GridSelection {
  date: string;
  nutrient: GridNutrient;
}

/** Week-by-day nutrient grid coloured by band, each cell with an icon; green-day counts per row (APP-PROG-04). */
export function WeekGrid({ grid, selected, onSelect }: { grid: NutrientGridResponse; selected: GridSelection | null; onSelect: (s: GridSelection) => void }) {
  const reduce = useReducedMotion();
  return (
    <div role="grid" aria-label="Nutrients by day this week" className="flex flex-col gap-1.5">
      <div role="row" className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))_34px] items-center gap-1">
        <span />
        {grid.days.map((d) => (
          <span role="columnheader" key={d.date} className="text-center text-[11px] font-bold text-neutral-700">
            {dateLabel(d.date, { weekday: 'narrow' })}
          </span>
        ))}
        <span className="text-center text-[10px] font-bold text-neutral-700" title="Days on track">
          <BandIcon icon="check" className="mx-auto h-3 w-3" />
        </span>
      </div>
      {GRID_ROWS.map((row, r) => (
        <div role="row" key={row.key} className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))_34px] items-center gap-1">
          <span role="rowheader" className="text-[12px] font-bold">
            {row.label}
          </span>
          {grid.days.map((d, c) => {
            const b = d.bands[row.key];
            const on = selected?.date === d.date && selected.nutrient === row.key;
            const spoken = `${dateLabel(d.date)}, ${row.label}: ${!d.logged ? 'not logged' : b ? b.label : 'no target'}`;
            return (
              <motion.button
                role="gridcell"
                key={d.date}
                type="button"
                aria-label={spoken}
                aria-pressed={on}
                onClick={() => onSelect({ date: d.date, nutrient: row.key })}
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileTap={{ scale: 0.9 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 24, delay: (r * 7 + c) * 0.012 }}
                className={cn(
                  'grid h-10 w-full min-w-0 place-items-center rounded-[12px] border-2',
                  !d.logged || !b ? 'border-dashed border-neutral-300 bg-transparent text-neutral-500' : cn(CELL[b.band], 'border-transparent'),
                  on && 'ring-2 ring-text ring-offset-1 ring-offset-surface',
                )}
              >
                {d.logged && b ? <BandIcon icon={ICON[b.band]} className="h-3.5 w-3.5" /> : null}
              </motion.button>
            );
          })}
          <span className="text-center text-[13px] font-extrabold tabular" aria-label={`${grid.greenCounts[row.key]} days on track`}>
            {grid.greenCounts[row.key]}
          </span>
        </div>
      ))}
    </div>
  );
}
