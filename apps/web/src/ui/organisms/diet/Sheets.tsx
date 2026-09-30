import { Eye, Heart, ThumbsDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DietOptionDto } from '@clubhouse/contracts';
import { AnimatedNumber } from '@clubhouse/ui';
import { dateLabel, fmt } from '@/features/format';
import { optionTotals, useDietPrevious } from '@/features/diet';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { Stepper } from '@/ui/atoms/Stepper';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';
import { ErrorCard } from '@/ui/organisms/progress/Kit';
import { cn } from '@/lib/cn';

const factorLabel = (v: number) => (v === 1 ? 'as planned' : v === 0 ? 'skip' : `×${v}`);

/** "Log this" → adjust each item's portion, then log (APP-DIET-04). */
export function PortionSheet({ option, slotLabel, onClose, onConfirm, busy }: { option: DietOptionDto | null; slotLabel: string; onClose: () => void; onConfirm: (portions: number[] | undefined) => void; busy: boolean }) {
  const [portions, setPortions] = useState<number[]>([]);
  useEffect(() => {
    if (option) setPortions(option.items.map(() => 1));
  }, [option]);
  const changed = portions.some((p) => p !== 1);
  const total = option ? optionTotals(option, portions.length ? portions : undefined) : null;
  return (
    <MemberSheet open={!!option} onClose={onClose} title="Adjust portions">
      {option && total && (
        <>
          <p className="m-0 text-[14px] text-neutral-700">
            {option.name} for {slotLabel.toLowerCase()}. Nudge anything you had more or less of.
          </p>
          <div className="flex flex-col rounded-[28px] bg-surface py-1">
            {option.items.map((it, i) => {
              const k = portions[i] ?? 1;
              return (
                <div key={i} className={cn('flex items-center gap-3 px-4 py-2.5', k === 0 && 'opacity-50')}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[14px] font-bold">{it.name}</span>
                    <span className="text-[12px] text-neutral-700 tabular">
                      {fmt(it.nutrition.kcal * k)} kcal · {factorLabel(k)}
                    </span>
                  </span>
                  <Stepper label={`portion of ${it.name}`} value={k} step={0.25} min={0} max={3} format={(v) => `${v}×`} onChange={(v) => setPortions((p) => p.map((x, j) => (j === i ? v : x)))} />
                </div>
              );
            })}
          </div>
          <div className="flex items-baseline justify-between px-1">
            <span className="text-[14px] text-neutral-700">Total</span>
            <span className="font-heading text-[28px] tabular">
              <AnimatedNumber value={total.kcal} /> <span className="font-body text-[14px] text-neutral-700">kcal</span>
            </span>
          </div>
          <Button size="lg" block loading={busy} disabled={total.kcal <= 0} onClick={() => onConfirm(changed ? portions : undefined)}>
            Log to {slotLabel.toLowerCase()}
          </Button>
        </>
      )}
    </MemberSheet>
  );
}

/** Long-press / overflow on an option: favourite, not for me, view items (APP-DIET-06). */
export function OptionActionsSheet({ option, onClose, onFeedback, onView }: { option: DietOptionDto | null; onClose: () => void; onFeedback: (o: DietOptionDto, r: 'favourite' | 'dislike' | null) => void; onView: (o: DietOptionDto) => void }) {
  return (
    <MemberSheet open={!!option} onClose={onClose} title={option?.name ?? ''}>
      {option && (
        <div className="flex flex-col rounded-[28px] bg-surface py-1">
          <ListRow
            onClick={() => {
              onFeedback(option, option.favourite ? null : 'favourite');
              onClose();
            }}
            title={
              <span className="flex items-center gap-2.5">
                <Heart aria-hidden className={cn('h-5 w-5 text-accent-700', option.favourite && 'fill-current')} strokeWidth={2.75} />
                {option.favourite ? 'Remove from favourites' : 'Favourite'}
              </span>
            }
            sub="Favourites show up first"
          />
          <ListRow
            onClick={() => {
              onFeedback(option, option.notForMe ? null : 'dislike');
              onClose();
            }}
            title={
              <span className="flex items-center gap-2.5">
                <ThumbsDown aria-hidden className="h-5 w-5 text-neutral-700" strokeWidth={2.75} />
                {option.notForMe ? 'Undo “not for me”' : 'Not for me'}
              </span>
            }
            sub="Your admin sees this when they tweak your plan"
          />
          <ListRow
            onClick={() => {
              onView(option);
              onClose();
            }}
            title={
              <span className="flex items-center gap-2.5">
                <Eye aria-hidden className="h-5 w-5 text-neutral-700" strokeWidth={2.75} />
                View items
              </span>
            }
          />
        </div>
      )}
    </MemberSheet>
  );
}

/** Read-only previous version of the plan (only while it is still viewable). */
export function PreviousPlanSheet({ planId, open, onClose, until }: { planId: string | null; open: boolean; onClose: () => void; until: string | null }) {
  const q = useDietPrevious(open ? planId : null);
  const d = q.data;
  return (
    <MemberSheet open={open} onClose={onClose} title={d?.plan ? `${d.plan.name} · v${d.plan.version}` : 'Previous version'}>
      {until && <p className="m-0 text-[13px] text-neutral-700">Read-only. You can look back at it until {dateLabel(until, { day: 'numeric', month: 'short' })}.</p>}
      {!d ? (
        q.isError ? (
          <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="the previous version" />
        ) : (
          <>
            <Skeleton h={120} r={28} />
            <Skeleton h={120} r={28} />
          </>
        )
      ) : (
        d.slots
          .filter((s) => s.options.length)
          .map((s) => (
            <ListGroup key={s.slot} title={s.label}>
              {s.options.map((o) => (
                <ListRow key={o.id} title={o.name} sub={o.items.map((i) => i.name).join(', ')} right={<span className="text-[13px] font-bold tabular">{fmt(o.nutrition.kcal)}</span>} />
              ))}
            </ListGroup>
          ))
      )}
    </MemberSheet>
  );
}
