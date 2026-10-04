import { Check, Heart, MoreHorizontal, ThumbsDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, type KeyboardEvent } from 'react';
import type { DietOptionDto, DietResponse } from '@clubhouse/contracts';
import { fmt, fmtG } from '@/features/format';
import { AIBadge, Tag } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';
import { IconButton } from '@/ui/atoms/IconButton';
import { cn } from '@/lib/cn';
import { LONG_PRESS_CLASS, useLongPress } from '@/ui/organisms/chat/useLongPress';

type Slot = DietResponse['slots'][number];

export interface SlotCardProps {
  slot: Slot;
  options: DietOptionDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLog: (o: DietOptionDto) => void;
  onActions: (o: DietOptionDto) => void;
  highlight?: boolean;
  /** Details open only after the member picks an option (or asks to view items). */
  expanded: boolean;
  aiOn: boolean;
}

/** One meal slot with radio options (best fit first); the picked option expands with its items (APP-DIET-02/03). */
export const SlotCard = forwardRef<HTMLElement, SlotCardProps>(function SlotCard({ slot, options, selectedId, onSelect, onLog, onActions, highlight, expanded, aiOn }, ref) {
  const selected = options.find((o) => o.id === selectedId) ?? null;
  const onKey = (e: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key) || !options.length) return;
    e.preventDefault();
    const i = Math.max(0, options.findIndex((o) => o.id === selectedId));
    const n = (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    onSelect(options[n]!.id);
    (e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')[n] ?? null)?.focus();
  };
  return (
    <motion.section
      ref={ref}
      id={`slot-${slot.slot}`}
      layout
      aria-label={slot.label}
      className={cn('flex scroll-mt-4 flex-col gap-2.5 rounded-[30px] bg-surface p-4 transition-shadow', highlight && 'ring-2 ring-accent')}
    >
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-heading text-[19px]">{slot.label}</h2>
        {slot.logged && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-2-200 px-2.5 py-[3px] text-[12px] font-bold text-accent-2-800">
            <Check aria-hidden className="h-3 w-3" strokeWidth={3} />
            Logged
          </span>
        )}
      </div>
      <div role="radiogroup" aria-label={`${slot.label} options`} onKeyDown={onKey} className="flex flex-col gap-1.5">
        {options.map((o) => (
          <OptionRow key={o.id} o={o} on={o.id === selectedId} onPick={() => onSelect(o.id)} onActions={() => onActions(o)} />
        ))}
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {selected && expanded && (
          <motion.div key={selected.id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden">
            <OptionDetails o={selected} aiOn={aiOn} />
          </motion.div>
        )}
      </AnimatePresence>
      {selected && (
        <Button size="sm" className="min-h-11 self-start px-[18px] text-[14px]" onClick={() => onLog(selected)}>
          {slot.logged ? 'Log another' : 'Log this'}
        </Button>
      )}
    </motion.section>
  );
});

function OptionRow({ o, on, onPick, onActions }: { o: DietOptionDto; on: boolean; onPick: () => void; onActions: () => void }) {
  const lp = useLongPress(onActions);
  const spoken = `${o.name}, ${fmt(o.nutrition.kcal)} kcal${o.fits ? ', fits today' : ''}${o.bestFit ? ', best fit' : ''}${o.favourite ? ', favourite' : ''}${o.notForMe ? ', marked not for me' : ''}`;
  return (
    <div className={cn('flex items-center rounded-[22px] border-2 transition-colors', on ? 'border-accent bg-neutral-100' : 'border-transparent', o.notForMe && !on && 'opacity-60')}>
      <button
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={spoken}
        tabIndex={on ? 0 : -1}
        {...lp.handlers}
        onClick={() => !lp.consumed() && onPick()}
        className={cn('flex min-h-12 min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent py-2.5 pl-3.5 pr-1 text-left [&_*]:pointer-events-none', LONG_PRESS_CLASS)}
      >
        <span aria-hidden className={cn('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors', on ? 'border-accent bg-accent' : 'border-neutral-500 bg-transparent')}>
          {on && <motion.span layoutId={`dot-${o.mealSlot}`} className="h-1.5 w-1.5 rounded-full bg-on-accent-fill" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-semibold leading-snug">{o.name}</span>
          {(o.fits || o.bestFit || o.favourite || o.notForMe) && (
            <span className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold">
              {o.bestFit ? (
                <span className="inline-flex items-center gap-0.5 text-accent-2-700">
                  <Check aria-hidden className="h-3 w-3" strokeWidth={3} />
                  Best fit today
                </span>
              ) : o.fits ? (
                <span className="inline-flex items-center gap-0.5 text-accent-2-700">
                  <Check aria-hidden className="h-3 w-3" strokeWidth={3} />
                  Fits today
                </span>
              ) : null}
              {o.favourite && (
                <span className="inline-flex items-center gap-0.5 text-accent-700">
                  <Heart aria-hidden className="h-3 w-3 fill-current" strokeWidth={2.75} />
                  Favourite
                </span>
              )}
              {o.notForMe && (
                <span className="inline-flex items-center gap-0.5 text-neutral-700">
                  <ThumbsDown aria-hidden className="h-3 w-3" strokeWidth={2.75} />
                  Not for me
                </span>
              )}
            </span>
          )}
        </span>
        <span className="text-[13px] font-bold text-neutral-700 tabular">{fmt(o.nutrition.kcal)}</span>
      </button>
      <IconButton label={`More for ${o.name}`} tone="ghost" size={44} onClick={onActions}>
        <MoreHorizontal className="h-[18px] w-[18px] text-neutral-700" strokeWidth={2.75} />
      </IconButton>
    </div>
  );
}

export function OptionDetails({ o, aiOn }: { o: DietOptionDto; aiOn: boolean }) {
  const n = o.nutrition;
  return (
    <div className="flex flex-col gap-2 rounded-[22px] bg-bg p-3.5">
      {o.imageUrl && <img src={o.imageUrl} alt={o.name} loading="lazy" className="aspect-[16/9] w-full rounded-[18px] object-cover saturate-[0.85]" />}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {o.items.map((it, i) => (
          <li key={i} className="flex items-baseline gap-2 text-[13px]">
            <span className="min-w-0 flex-1">
              <b className="font-bold">{it.name}</b>{' '}
              <span className="text-neutral-700">· {it.servingLabel ? `${fmtServ(it.servings)} ${it.servingLabel}` : fmtG(it.grams)}</span>
              {it.aiEstimate && aiOn && <AIBadge className="ml-1" title="Estimated with AI" />}
            </span>
            <span className="font-bold tabular">{fmt(it.nutrition.kcal)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5 text-[12px]">
        <Tag>P {fmtG(n.protein)}</Tag>
        <Tag>C {fmtG(n.carbs)}</Tag>
        <Tag>F {fmtG(n.fat)}</Tag>
        <Tag>Fibre {fmtG(n.fibre)}</Tag>
      </div>
      {o.prepNote && <p className="m-0 text-[13px] leading-snug text-neutral-700">{o.prepNote}</p>}
    </div>
  );
}

const fmtServ = (s: number) => (Math.round(s * 100) / 100).toString().replace(/\.5$/, '½').replace(/^0½$/, '½');
