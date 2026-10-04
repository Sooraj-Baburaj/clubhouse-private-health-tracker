import { ChevronDown, Minus, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { ApiError, NetworkError } from '@clubhouse/client';
import { dishNutrition, fractionText } from '@clubhouse/domain';
import { toast } from '@clubhouse/ui';
import { dishItem, itemFromSearch, itemGrams, itemNutrition, recipeBody, useFoodDetail, useSaveRecipe, type CartItem } from '@/features/food';
import { fmt } from '@/features/format';
import { useMealDraft } from '@/features/mealDraft';
import { useMealFlow } from '@/pages/log/mealFlow';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/atoms/Button';
import { Toggle } from '@/ui/atoms/Toggle';
import { itemSub } from '@/ui/organisms/meal/PlateList';
import { PickFoodSheet } from '@/ui/organisms/meal/PickFoodSheet';
import { ViewShell } from '@/ui/organisms/meal/ViewShell';
import { applyChoice, choiceOf } from './portion';
import { PortionPicker } from './PortionPicker';

function Counter({ label, value, text, onDown, onUp, downLabel, upLabel }: { label: string; value: number; text: string; onDown: () => void; onUp: () => void; downLabel: string; upLabel: string }) {
  return (
    <div className="flex items-center gap-2.5" role="group" aria-label={`${label}: ${text}`}>
      <span className="flex-1 text-[15px] font-bold">{label}</span>
      <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={onDown} aria-label={downLabel} disabled={value <= 0} className="grid h-11 w-11 place-items-center rounded-full border border-divider bg-transparent text-text disabled:opacity-40">
        <Minus className="h-4 w-4" strokeWidth={2.75} />
      </motion.button>
      <span className="min-w-[72px] text-center font-extrabold tabular" aria-live="polite">
        {text}
      </span>
      <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={onUp} aria-label={upLabel} className="grid h-11 w-11 place-items-center rounded-full border-0 bg-accent text-on-accent-fill">
        <Plus className="h-4 w-4" strokeWidth={2.75} />
      </motion.button>
    </div>
  );
}

function Ingredient({ c, open, onToggle, onChange, onRemove }: { c: CartItem; open: boolean; onToggle: () => void; onChange: (c: CartItem) => void; onRemove: () => void }) {
  const options = c.servingOptions.length ? c.servingOptions : [{ label: c.unitLabel, grams: c.unitGrams }];
  return (
    <li className="flex flex-col rounded-[24px] bg-surface">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-14 items-center gap-2.5 border-0 bg-transparent px-4 py-2 text-left text-text">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-bold">{c.name}</span>
          <span className="text-[12px] text-neutral-700 tabular">{itemSub(c)}</span>
        </span>
        <span className="text-[14px] font-extrabold tabular">{fmt(itemNutrition(c).kcal)}</span>
        <ChevronDown aria-hidden className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} strokeWidth={2.75} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-2.5 pb-3 pl-4 pr-3">
              {c.unitLabel === 'quick add' ? null : <PortionPicker compact options={options} value={choiceOf(c, options)} onChange={(v) => onChange(applyChoice({ ...c, servingOptions: options }, v))} />}
              <button type="button" onClick={onRemove} className="min-h-11 self-end border-0 bg-transparent px-1 text-[13px] font-extrabold text-accent-700">
                Remove
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/**
 * A dish (design 7b): a name, ingredients each with its own portion, how many servings the batch makes and how much of
 * it you had. It goes on the plate as one line and can be saved to My recipes (or, from a recipe, update it).
 */
export function DishView() {
  const flow = useMealFlow();
  const dish = flow.draft.dish;
  const patch = useMealDraft((s) => s.patchDish);
  const foodDetail = useFoodDetail();
  const saveRecipe = useSaveRecipe();
  const [picking, setPicking] = useState(false);
  if (!dish) return null;

  const parts = dish.components.map((c) => ({ nutrition: itemNutrition(c), grams: itemGrams(c) }));
  const share = dishNutrition(parts, dish.makes, dish.had);
  const canAdd = !!dish.name.trim() && dish.components.length > 0;
  const slot = flow.slotLabel(flow.draft.slot).toLowerCase();
  const kcal = Math.round(share.nutrition.kcal);
  const cta = dish.rowKey ? `Update · ${fmt(kcal)} kcal` : canAdd ? `Add to ${slot} · ${fmt(kcal)} kcal` : `Add to ${slot}`;

  const addIngredient = async (foodId: string) => {
    setPicking(false);
    try {
      const f = await foodDetail(foodId);
      patch((d) => ({ components: [...d.components, itemFromSearch(f)] }));
      toast.show(`${f.name} added to the dish`);
    } catch {
      toast.error('Couldn’t load that food.');
    }
  };

  const commit = async () => {
    if (!canAdd) return;
    let recipeId = dish.recipeId;
    const body = recipeBody(dish.name, dish.components, dish.makes);
    let note = `${dish.name.trim()} added`;
    // Saving the recipe is a bonus: if it fails, the dish still goes on the plate.
    if ((!recipeId && dish.save) || (recipeId && dish.updateRecipe)) {
      try {
        const r = await saveRecipe.mutateAsync({ id: recipeId, body });
        recipeId = r.id;
        note = dish.recipeId ? 'Added · your recipe is updated too' : `${dish.name.trim()} added · saved to My recipes`;
      } catch (e) {
        toast.error(e instanceof NetworkError ? 'You’re offline — the dish is on your plate, but not saved as a recipe.' : e instanceof ApiError ? e.message : 'Couldn’t save the recipe.');
        note = '';
      }
    } else if (recipeId) note = 'Added · your recipe stays as it was';
    const line = dishItem(dish.name.trim(), dish.components, dish.makes, dish.had, recipeId);
    if (dish.rowKey) flow.replaceItem(dish.rowKey, { ...line, key: dish.rowKey });
    else flow.addItems([line], { toast: note || false });
    flow.closeView();
  };

  return (
    <ViewShell
      label={dish.name || 'New dish'}
      onBack={flow.closeView}
      eyebrow={dish.recipeId ? 'Dish · from My recipes' : 'Dish'}
      footer={
        <Button size="lg" block className="text-[17px]" disabled={!canAdd} loading={saveRecipe.isPending} onClick={() => void commit()}>
          {cta}
        </Button>
      }
    >
      <input
        value={dish.name}
        onChange={(e) => patch({ name: e.target.value.slice(0, 80) })}
        placeholder="Name your dish"
        aria-label="Dish name"
        autoFocus={!dish.name}
        className="min-h-[52px] border-0 border-b-2 border-divider bg-transparent pb-2 pt-1 font-heading text-[30px] text-text outline-none focus:border-accent"
      />
      {!dish.components.length ? (
        <div className="flex flex-col gap-1 rounded-[28px] bg-surface p-5">
          <span className="font-heading text-[20px]">Name it, then add what went in.</span>
          <span className="text-[13px] leading-snug text-neutral-700">Each ingredient keeps its own portion, so the totals stay honest.</span>
        </div>
      ) : (
        <>
          <span className="eyebrow">Ingredients</span>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {dish.components.map((c) => (
              <Ingredient
                key={c.key}
                c={c}
                open={dish.open === c.key}
                onToggle={() => patch((d) => ({ open: d.open === c.key ? null : c.key }))}
                onChange={(next) => patch((d) => ({ components: d.components.map((x) => (x.key === c.key ? next : x)) }))}
                onRemove={() => patch((d) => ({ components: d.components.filter((x) => x.key !== c.key), open: null }))}
              />
            ))}
          </ul>
        </>
      )}
      <Button variant="surface" className="self-start bg-accent-200 text-accent-800" icon={<Plus className="h-4 w-4" strokeWidth={2.75} aria-hidden />} onClick={() => setPicking(true)}>
        Add ingredient
      </Button>
      {dish.components.length > 0 && (
        <div className="flex flex-col gap-3 rounded-[28px] bg-surface px-4 py-3.5">
          <Counter
            label="Makes"
            value={dish.makes - 1}
            text={`${dish.makes} serving${dish.makes === 1 ? '' : 's'}`}
            downLabel="Fewer servings"
            upLabel="More servings"
            onDown={() => patch((d) => ({ makes: Math.max(1, d.makes - 1), had: Math.min(d.had, Math.max(1, d.makes - 1)) }))}
            onUp={() => patch((d) => ({ makes: Math.min(50, d.makes + 1) }))}
          />
          <Counter label="You had" value={dish.had - 0.5} text={fractionText(dish.had)} downLabel="Less" upLabel="More" onDown={() => patch((d) => ({ had: Math.max(0.5, d.had - 0.5) }))} onUp={() => patch((d) => ({ had: Math.min(d.makes, d.had + 0.5) }))} />
          <div aria-live="polite" className="flex flex-col gap-0.5 pt-1">
            <span className="font-heading text-[22px]">
              Your share: {fmt(kcal)} kcal of {fmt(share.total.kcal)}
            </span>
            <span className="text-[12px] font-semibold text-neutral-700 tabular">
              P {fmt(share.nutrition.protein)} g · C {fmt(share.nutrition.carbs)} g · F {fmt(share.nutrition.fat)} g · Fibre {fmt(share.nutrition.fibre)} g
            </span>
          </div>
        </div>
      )}
      {dish.recipeId ? (
        <>
          <span className="px-1.5 text-[13px] leading-snug text-neutral-700">Tweak portions for this meal — your saved recipe stays as it is unless you say so.</span>
          <label className="flex min-h-[60px] items-center gap-3 rounded-[26px] bg-surface py-3 pl-4 pr-3">
            <span className="flex-1 text-[15px] font-bold">Update my recipe too</span>
            <Toggle label="Update my recipe too" checked={dish.updateRecipe} onChange={(v) => patch({ updateRecipe: v })} />
          </label>
        </>
      ) : (
        <label className="flex min-h-[60px] items-center gap-3 rounded-[26px] bg-surface py-3 pl-4 pr-3">
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-bold">Save to My recipes</span>
            <span className="text-[12px] text-neutral-700">Next time it’s one tap</span>
          </span>
          <Toggle label="Save to My recipes" checked={dish.save} onChange={(v) => patch({ save: v })} />
        </label>
      )}
      <PickFoodSheet open={picking} mode="ing" title="Add an ingredient" slot={flow.draft.slot} onClose={() => setPicking(false)} onPick={(r) => void addIngredient(r.id)} onCreate={(name) => {
        setPicking(false);
        flow.openView('create', { into: 'dish', name });
      }} />
    </ViewShell>
  );
}
