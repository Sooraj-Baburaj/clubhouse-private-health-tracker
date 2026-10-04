import { ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { weightUnitFor } from '@clubhouse/domain';
import { cartTotals, isDish, itemGrams, itemNutrition, itemPortion, type CartItem } from '@/features/food';
import { fmt } from '@/features/format';
import { AIBadge } from '@/ui/atoms/Badges';

/** "2 scoops · 64 g", "≈150 g" for estimated weights, a dish's ingredients and share. */
export function itemSub(i: CartItem): string {
  if (isDish(i)) return `${i.components!.length} ingredient${i.components!.length === 1 ? '' : 's'} · you had ${itemPortion(i)}`;
  const portion = itemPortion(i);
  const grams = itemGrams(i);
  const unit = weightUnitFor(i.servingOptions.find((o) => o.label === i.unitLabel)?.unit ?? null);
  if (!grams || /^\d+(\.\d+)? (g|ml)$/.test(portion) || i.unitLabel === 'quick add') return i.unitLabel === 'quick add' ? 'Quick add' : portion;
  return `${portion} · ${i.estimated ? '≈' : ''}${Math.round(grams)} ${unit}`;
}

function PlateRow({ item, onOpen, onRemove }: { item: CartItem; onOpen?: () => void; onRemove: () => void }) {
  const kcal = itemNutrition(item).kcal;
  const ai = item.source === 'ai' || item.aiEstimate;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, height: 0, marginBottom: -8 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="flex items-center gap-1.5 rounded-[24px] bg-surface py-1.5 pl-4 pr-1"
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={`${item.name}, ${itemSub(item)}, ${fmt(kcal)} kcal${onOpen ? '. Change portion' : ''}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 border-0 bg-transparent py-1.5 text-left text-text disabled:cursor-default"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[15px] font-bold">
            <span className="truncate">{item.name}</span>
            {ai && <AIBadge className="shrink-0" title={item.source === 'ai' ? 'Recognised by AI' : 'AI estimate'} />}
          </span>
          <span className="text-[12px] text-neutral-700 tabular">{itemSub(item)}</span>
          {isDish(item) && (
            <span className="flex flex-wrap gap-1">
              {item.components!.slice(0, 6).map((c) => (
                <span key={c.key} className="rounded-full bg-accent-2-200 px-2 py-0.5 text-[11px] font-bold text-accent-2-800">
                  {c.name}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="whitespace-nowrap text-[14px] font-extrabold tabular">{fmt(kcal)}</span>
        {isDish(item) && <ChevronRight aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.75} />}
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remove ${item.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-0 bg-transparent text-neutral-700">
        <X className="h-4 w-4" strokeWidth={2.75} />
      </button>
    </motion.li>
  );
}

/** The plate total: big kcal and the macros line (announced as it changes). */
export function PlateTotals({ plate }: { plate: CartItem[] }) {
  const t = cartTotals(plate);
  return (
    <div aria-live="polite" className="flex flex-wrap items-baseline gap-2 px-1.5 py-0.5">
      <span className="font-heading text-[44px] leading-none tabular">{fmt(t.kcal)}</span>
      <span className="text-[16px] font-bold">kcal</span>
      <span className="basis-full text-[13px] font-semibold text-neutral-700 tabular">
        P {fmt(t.protein)} g · C {fmt(t.carbs)} g · F {fmt(t.fat)} g · Fibre {fmt(t.fibre)} g
      </span>
    </div>
  );
}

/** "On your plate": each line opens its portion (or the dish); ✕ removes it with an undo. */
export function PlateList({ plate, onOpen, onRemove }: { plate: CartItem[]; onOpen: (i: CartItem) => void; onRemove: (key: string) => void }) {
  return (
    <section aria-labelledby="plate-title" className="flex flex-col gap-2">
      <span id="plate-title" className="eyebrow">
        On your plate
      </span>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        <AnimatePresence initial={false}>
          {plate.map((i) => (
            <PlateRow key={i.key} item={i} onOpen={i.unitLabel === 'quick add' ? undefined : () => onOpen(i)} onRemove={() => onRemove(i.key)} />
          ))}
        </AnimatePresence>
      </ul>
      <PlateTotals plate={plate} />
    </section>
  );
}
