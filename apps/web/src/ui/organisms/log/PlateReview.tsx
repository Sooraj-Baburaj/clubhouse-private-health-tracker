import { Repeat, SlidersHorizontal, X, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cartTotals, itemNutrition, type CartItem } from '@/features/food';
import { fmt } from '@/features/format';
import { AIBadge } from '@/ui/atoms/Badges';
import { Stepper } from '@/ui/atoms/Stepper';
import { STRIPES } from './CameraCapture';

/** Whole steps above one serving, halves below it (½ roti is real; 2½ usually is not). */
const stepQty = (q: number, up: boolean) => (up ? (q < 1 ? q + 0.5 : Math.floor(q) + 1) : q > 1 ? Math.ceil(q) - 1 : q - 0.5);
const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(1).replace(/\.0$/, ''));

function CartRow({ item, onQty, onSwap, onPortion, onRemove }: { item: CartItem; onQty: (q: number) => void; onSwap?: () => void; onPortion?: () => void; onRemove: () => void }) {
  const kcal = itemNutrition(item).kcal;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, height: 0, marginBottom: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="flex flex-col gap-1.5 rounded-[26px] bg-surface py-3 pl-4 pr-3"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-[15px] font-bold">
            <span className="truncate">{item.name}</span>
            {(item.source === 'ai' || item.aiEstimate) && <AIBadge className="shrink-0" title={item.source === 'ai' ? 'Recognised by AI' : 'AI estimate'} />}
          </span>
          <span className="text-[12px] text-neutral-700 tabular">
            {qtyText(item.qty)} × {item.unitLabel} · {fmt(kcal)} kcal
          </span>
        </span>
        <Stepper value={item.qty} onChange={(v) => onQty(stepQty(item.qty, v > item.qty))} step={1} min={0} max={20} label={`servings of ${item.name}`} format={qtyText} />
      </div>
      <div className="-ml-2 flex flex-wrap gap-1">
        {onPortion && item.foodId && (
          <button type="button" onClick={onPortion} className="flex min-h-10 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold text-neutral-800 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]">
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
            Portion
          </button>
        )}
        {onSwap && (
          <button type="button" onClick={onSwap} className="flex min-h-10 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold text-neutral-800 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]" aria-label={`Swap ${item.name} for something else`}>
            <Repeat className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
            Swap
          </button>
        )}
        <button type="button" onClick={onRemove} className="flex min-h-10 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold text-neutral-800 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]" aria-label={`Remove ${item.name}`}>
          <X className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
          Remove
        </button>
      </div>
    </motion.li>
  );
}

export function TotalsLine({ cart }: { cart: CartItem[] }) {
  const t = cartTotals(cart);
  return (
    <div className="flex items-center justify-between gap-2 px-1.5 text-[14px]" aria-live="polite">
      <span className="text-neutral-700 tabular">
        P {fmt(t.protein)} g · C {fmt(t.carbs)} g · F {fmt(t.fat)} g · Fibre {fmt(t.fibre)} g
      </span>
      <span className="shrink-0 font-extrabold tabular">{fmt(t.kcal)} kcal</span>
    </div>
  );
}

/**
 * The pending log: "Found N things" after a photo or AI parse, or "Your plate" while searching. Rows have a quantity
 * stepper, portion, swap and remove; "Add more" opens search.
 */
export function PlateReview({
  title,
  subtitle,
  photoUrl,
  cart,
  onQty,
  onRemove,
  onSwap,
  onPortion,
  onAddMore,
  footer,
}: {
  title: string;
  subtitle?: string;
  photoUrl?: string | null;
  cart: CartItem[];
  onQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onSwap?: (key: string) => void;
  onPortion?: (key: string) => void;
  onAddMore?: () => void;
  footer?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-center gap-3">
        {photoUrl !== undefined && (
          <motion.div layout className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-full" style={photoUrl ? undefined : STRIPES}>
            {photoUrl && <img src={photoUrl} alt="Your plate" className="h-full w-full object-cover" />}
          </motion.div>
        )}
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-[22px] leading-[1.1]">{title}</h2>
          {subtitle && <span className="text-[13px] text-neutral-700">{subtitle}</span>}
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        <AnimatePresence initial={false}>
          {cart.map((i) => (
            <CartRow
              key={i.key}
              item={i}
              onQty={(q) => (q <= 0 ? onRemove(i.key) : onQty(i.key, q))}
              onRemove={() => onRemove(i.key)}
              onSwap={onSwap ? () => onSwap(i.key) : undefined}
              onPortion={onPortion ? () => onPortion(i.key) : undefined}
            />
          ))}
        </AnimatePresence>
      </ul>
      {onAddMore && (
        <button type="button" onClick={onAddMore} className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-dashed border-divider text-[14px] font-bold text-accent-700">
          <Plus className="h-4 w-4" strokeWidth={3} aria-hidden />
          Add more
        </button>
      )}
      {cart.length > 0 && <TotalsLine cart={cart} />}
      {footer}
    </section>
  );
}
