import { Heart } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { FoodDetail, ServingOptionDto } from '@clubhouse/contracts';
import { portionText, weightUnitFor } from '@clubhouse/domain';
import { useOnline } from '@clubhouse/ui';
import { itemFromSearch, itemGrams, itemNutrition, useFood, useToggleFavourite, type CartItem } from '@/features/food';
import { fmt } from '@/features/format';
import { useMealDraft } from '@/features/mealDraft';
import { useMealFlow } from '@/pages/log/mealFlow';
import { Button } from '@/ui/atoms/Button';
import { IconButton } from '@/ui/atoms/IconButton';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { ViewShell } from '@/ui/organisms/meal/ViewShell';
import { applyChoice, choiceOf, type PortionChoice } from './portion';
import { PortionPicker } from './PortionPicker';

type Badge = { label: string; cls: string };
function badgesOf(d: FoodDetail | null, item: CartItem): Badge[] {
  if (item.aiEstimate || d?.aiEstimate) return [{ label: 'AI estimate', cls: 'bg-accent-2-200 text-accent-2-800' }];
  if (!d) return [];
  if (d.scope === 'mine') return [{ label: d.recipeId ? 'My recipe' : 'Mine', cls: 'bg-neutral-300 text-neutral-900' }];
  if (d.verified) return [{ label: d.scope === 'team' ? 'Team' : 'Verified', cls: d.scope === 'team' ? 'bg-accent-200 text-accent-800' : 'bg-accent-2-200 text-accent-2-800' }];
  return [];
}

/** The calories, rolling to the new number when the portion changes. */
function RollingKcal({ value, approx }: { value: number; approx: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span className="inline-block overflow-hidden font-heading text-[64px] leading-none tabular">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} className="inline-block" initial={reduce ? { opacity: 0 } : { y: '45%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: [0.2, 0.9, 0.3, 1] }}>
          {approx ? '≈' : ''}
          {fmt(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Food detail (design 7a): nutrition for the chosen portion, the portion picker, your usual, favourite, and "Edit food"
 * on your own foods. It edits a plate line, a dish ingredient or an AI-read row in place, or adds a new one.
 */
export function FoodDetailView() {
  const flow = useMealFlow();
  const online = useOnline();
  const { params, draft } = flow;
  const into = params.into ?? 'plate';
  const existing: CartItem | null = useMemo(() => {
    if (!params.row) return null;
    if (into === 'dish') return draft.dish?.components.find((c) => c.key === params.row) ?? null;
    if (into === 'read') return draft.read?.items.find((r) => r.item.key === params.row)?.item ?? draft.read?.dish?.items.find((r) => r.item.key === params.row)?.item ?? null;
    return draft.plate.find((i) => i.key === params.row) ?? null;
  }, [params.row, into, draft]);
  const foodId = params.food ?? existing?.foodId ?? null;
  const food = useFood(foodId);
  const fav = useToggleFavourite();
  const d = food.data ?? null;
  const base: CartItem | null = existing ?? (d ? itemFromSearch(d) : null);
  const options: ServingOptionDto[] = useMemo(() => {
    const list = d?.servingOptions.length ? d.servingOptions : base?.servingOptions ?? [];
    return list.length ? list : base ? [{ label: base.unitLabel, grams: base.unitGrams }] : [];
  }, [d, base]);
  const [choice, setChoice] = useState<PortionChoice | null>(null);
  const value = choice ?? (base ? choiceOf(base, options) : null);

  if (!base || !value) {
    return (
      <ViewShell label="Food" onBack={flow.closeView}>
        {!foodId ? (
          <EmptyState title="That food isn’t on your plate any more" action={<Button variant="dark" onClick={flow.closeView}>Back to the meal</Button>} />
        ) : food.isError ? (
          <EmptyState title="Couldn’t open that food" body={online ? 'It may have been removed.' : 'You’re offline and it isn’t saved on your phone yet.'} action={<Button variant="dark" onClick={() => void food.refetch()}>Try again</Button>} />
        ) : (
          <div className="flex flex-col gap-4" aria-busy>
            <Skeleton h={36} w="60%" r={14} />
            <Skeleton h={170} r={32} />
            <Skeleton h={44} r={999} />
          </div>
        )}
      </ViewShell>
    );
  }

  const item = { ...applyChoice({ ...base, servingOptions: options }, value), per100g: base.per100g ?? d?.per100g ?? null };
  const n = itemNutrition(item);
  const grams = itemGrams(item);
  const approx = !!item.estimated || item.aiEstimate;
  const unit = value.kind === 'weight' ? value.unit : weightUnitFor(value.option.unit ?? null);
  const slot = flow.slotLabel(flow.draft.slot).toLowerCase();
  const cta = existing ? 'Update' : into === 'dish' ? 'Add to the dish' : `Add to ${slot}`;
  const usual = d?.usual ? options.find((o) => o.label === d.usual!.label) : undefined;

  const commit = () => {
    const out = { ...item, key: existing?.key ?? item.key };
    const store = useMealDraft.getState();
    if (into === 'dish') store.patchDish((x) => ({ components: existing ? x.components.map((c) => (c.key === existing.key ? out : c)) : [...x.components, out] }));
    else if (into === 'read') store.patchRead((r) => ({ items: r.items.map((x) => (x.item.key === out.key ? { ...x, item: out } : x)), dish: r.dish && { ...r.dish, items: r.dish.items.map((x) => (x.item.key === out.key ? { ...x, item: out } : x)) } }));
    else if (existing) flow.replaceItem(existing.key, out);
    else flow.addItems([out]);
    flow.closeView();
  };

  return (
    <ViewShell
      label={item.name}
      onBack={flow.closeView}
      right={
        d && foodId ? (
          <IconButton label={d.favourite ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={d.favourite} disabled={!online || fav.isPending} onClick={() => fav.mutate({ id: foodId, on: !d.favourite })} className={d.favourite ? 'text-accent-700' : undefined}>
            <Heart className="h-[18px] w-[18px]" strokeWidth={2.75} fill={d.favourite ? 'currentColor' : 'none'} />
          </IconButton>
        ) : undefined
      }
      footer={
        <Button size="lg" block className="text-[17px]" disabled={itemGrams(item) <= 0 && !item.perUnit} onClick={commit}>
          {cta}
        </Button>
      }
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="font-heading text-[28px] leading-[1.1]">{item.name}</h2>
        {d?.brand && <span className="text-[14px] text-neutral-700">{d.brand}</span>}
        <div className="flex flex-wrap gap-1.5">
          {badgesOf(d, item).map((b) => (
            <span key={b.label} className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${b.cls}`}>
              {b.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3.5 rounded-[32px] bg-surface p-[18px]">
        <div className="flex items-baseline gap-2" aria-live="polite" aria-label={`${Math.round(n.kcal)} kilocalories for ${portionText(value.kind === 'unit' ? value.qty : 1, value.kind === 'unit' ? value.option : { label: `${value.grams} ${value.unit}` })}`}>
          <RollingKcal value={Math.round(n.kcal)} approx={approx} />
          <span className="text-[16px] font-bold">kcal</span>
          {value.kind === 'unit' && grams > 0 && (
            <span className="ml-auto text-[13px] font-bold text-neutral-700">
              {approx ? '≈' : ''}
              {Math.round(grams)} {unit}
            </span>
          )}
        </div>
        {approx && <span className="text-[12px] font-bold text-accent-700">≈ weight is approximate — {item.aiEstimate ? 'the AI estimated this portion' : 'this food is measured by its portion'}</span>}
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              ['Protein', n.protein],
              ['Carbs', n.carbs],
              ['Fat', n.fat],
              ['Fibre', n.fibre],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5 rounded-[20px] bg-bg px-2 py-2.5">
              <span className="text-[11px] font-bold text-neutral-700">{k}</span>
              <span className="font-heading text-[17px] tabular">{Math.round(v * 10) / 10} g</span>
            </div>
          ))}
        </div>
      </div>
      <span className="eyebrow">Portion</span>
      <PortionPicker options={options} value={value} onChange={setChoice} />
      {(usual || d?.editable) && (
        <div className="flex flex-wrap gap-2">
          {usual && d?.usual && (
            <button type="button" onClick={() => setChoice({ kind: 'unit', option: usual, qty: Math.max(0.25, Math.round((d.usual!.grams / usual.grams) * 4) / 4) })} className="min-h-10 rounded-full border-0 bg-accent-2-200 px-3.5 text-[13px] font-extrabold text-accent-2-800">
              Your usual: {portionText(Math.max(0.25, Math.round((d.usual.grams / usual.grams) * 4) / 4), usual)}
            </button>
          )}
          {d?.editable && (
            <button type="button" onClick={() => flow.openView('create', { food: d.id, into, row: existing?.key })} className="min-h-10 rounded-full border border-divider bg-transparent px-3.5 text-[13px] font-bold text-text">
              Edit food
            </button>
          )}
        </div>
      )}
    </ViewShell>
  );
}
