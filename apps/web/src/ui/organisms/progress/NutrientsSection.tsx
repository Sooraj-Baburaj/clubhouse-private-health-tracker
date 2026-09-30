import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { addDays, weekStartOf } from '@clubhouse/domain';
import { dateLabel } from '@/features/format';
import { useMeData } from '@/features/me';
import { useNutrientGrid } from '@/features/progress';
import { BandIcon } from '@/ui/atoms/Badges';
import { IconButton } from '@/ui/atoms/IconButton';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { GRID_ROWS, WeekGrid, type GridSelection } from '@/ui/organisms/charts/WeekGrid';
import { ErrorCard, SectionHead } from './Kit';

export function NutrientsSection() {
  const me = useMeData();
  const thisWeek = weekStartOf(me.today);
  const [week, setWeek] = useState(thisWeek);
  const [sel, setSel] = useState<GridSelection | null>(null);
  const q = useNutrientGrid(week === thisWeek ? undefined : week);
  const d = q.data;
  const label = week === thisWeek ? 'This week' : week === addDays(thisWeek, -7) ? 'Last week' : `${dateLabel(week, { day: 'numeric', month: 'short' })} – ${dateLabel(addDays(week, 6), { day: 'numeric', month: 'short' })}`;
  const selDay = sel && d?.days.find((x) => x.date === sel.date);
  const selBand = selDay && sel ? selDay.bands[sel.nutrient] : null;
  const move = (n: number) => {
    setSel(null);
    setWeek((w) => addDays(w, n * 7));
  };
  return (
    <>
      <SectionHead
        eyebrow="Nutrients"
        title={label}
        right={
          <div className="flex gap-1.5">
            <IconButton label="Previous week" onClick={() => move(-1)}>
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.75} />
            </IconButton>
            <IconButton label="Next week" onClick={() => move(1)} disabled={week >= thisWeek}>
              <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.75} />
            </IconButton>
          </div>
        }
      />
      {!d ? (
        q.isError ? (
          <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="your nutrients" />
        ) : (
          <Skeleton h={220} r={30} />
        )
      ) : (
        <div className="flex flex-col gap-3 rounded-[30px] bg-surface p-4">
          <WeekGrid key={d.weekStart} grid={d} selected={sel} onSelect={setSel} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={sel ? `${sel.date}-${sel.nutrient}` : 'hint'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="m-0 flex min-h-5 items-center gap-1.5 text-[13px]" aria-live="polite">
              {sel && selDay ? (
                <>
                  <b>{dateLabel(sel.date, { weekday: 'long' })}</b> · {GRID_ROWS.find((r) => r.key === sel.nutrient)?.label}:{' '}
                  {!selDay.logged ? (
                    'not logged'
                  ) : selBand ? (
                    <span className="inline-flex items-center gap-1 font-bold">
                      <BandIcon icon={selBand.band === 'green' ? 'check' : selBand.band === 'red' ? 'alert' : selBand.band === 'yellow' ? 'dash' : 'progress'} className="h-3 w-3" />
                      {selBand.label}
                    </span>
                  ) : (
                    'no target'
                  )}
                </>
              ) : (
                <span className="text-neutral-700">Tap a square for the details. The number is days on track.</span>
              )}
            </motion.p>
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
