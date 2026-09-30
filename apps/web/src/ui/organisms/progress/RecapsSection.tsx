import { ChevronDown, Download } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { api } from '@clubhouse/client';
import type { RecapDto } from '@clubhouse/contracts';
import { dateLabel } from '@/features/format';
import { useRecaps } from '@/features/progress';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { cn } from '@/lib/cn';
import { ErrorCard, SectionHead } from './Kit';

export function RecapsSection() {
  const q = useRecaps();
  const [open, setOpen] = useState<string | null>(null);
  const list = (q.data ?? []).slice(0, 8);
  return (
    <>
      <SectionHead eyebrow="Weekly recaps" title="Your last 8 weeks" />
      {!q.data ? (
        q.isError ? (
          <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="your recaps" />
        ) : (
          <Skeleton h={120} r={28} />
        )
      ) : !list.length ? (
        <EmptyState illustration="chart" title="Your first recap lands Sunday" body="Every week we sum up your highlight, one thing to try next and a fun team fact." />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((r, i) => (
            <RecapCard key={r.weekStart} r={r} open={open === r.weekStart || (open === null && i === 0)} onToggle={() => setOpen((o) => (o === r.weekStart || (o === null && i === 0) ? '' : r.weekStart))} />
          ))}
        </div>
      )}
    </>
  );
}

function RecapCard({ r, open, onToggle }: { r: RecapDto; open: boolean; onToggle: () => void }) {
  const id = `recap-${r.weekStart}`;
  return (
    <div className="rounded-[28px] bg-surface">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex min-h-14 w-full items-center gap-3 border-0 bg-transparent px-4 py-3 text-left">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12px] font-bold text-neutral-700">Week of {dateLabel(r.weekStart, { day: 'numeric', month: 'short' })}</span>
          <span className={cn('text-[15px] font-bold', !open && 'line-clamp-1')}>{r.highlight}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-neutral-700">
          <ChevronDown aria-hidden className="h-5 w-5" strokeWidth={2.75} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden">
            <div className="flex flex-col gap-2.5 px-4 pb-4">
              <p className="m-0 text-[14px]">
                <b>Try next:</b> {r.tryNext}
              </p>
              <p className="m-0 text-[14px] text-neutral-700">
                <b className="text-text">Team fact:</b> {r.teamFact}
              </p>
              {Object.keys(r.stats).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(r.stats).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-bold">
                      {humanize(k)}: {typeof v === 'number' ? Math.round(v).toLocaleString('en-IN') : v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function ExportCard() {
  return (
    <div className="flex flex-col gap-2">
      <SectionHead eyebrow="Your data" />
      <div className="flex gap-2">
        {(['csv', 'json'] as const).map((f) => (
          <a
            key={f}
            href={api.profile.exportUrl(f)}
            download
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-divider text-[14px] font-bold text-text no-underline active:scale-[0.97]"
          >
            <Download aria-hidden className="h-4 w-4" strokeWidth={2.75} />
            Export {f.toUpperCase()}
          </a>
        ))}
      </div>
    </div>
  );
}
