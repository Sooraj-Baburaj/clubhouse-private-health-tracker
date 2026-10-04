import { ChevronRight, Search, X } from 'lucide-react';
import { useState } from 'react';
import type { FoodAlternativeDto, FoodSearchResult, MealSlot, RecipeDto } from '@clubhouse/contracts';
import { useFoodSearch, useMyFoods } from '@/features/food';
import { fmt } from '@/features/format';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { ResultRow } from './MealSearch';

export type PickMode = 'ing' | 'replace' | 'readadd' | 'mine';

/**
 * Pick a food in a sheet: an ingredient for a dish, a swap for something the AI got wrong ("Did you mean" first),
 * something the photo missed, or one of My foods & recipes.
 */
export function PickFoodSheet({
  open,
  mode,
  title,
  slot,
  near = [],
  onClose,
  onPick,
  onPickAlternative,
  onPickRecipe,
  onCreate,
}: {
  open: boolean;
  mode: PickMode;
  title: string;
  slot: MealSlot;
  near?: FoodAlternativeDto[];
  onClose: () => void;
  onPick: (r: FoodSearchResult) => void;
  onPickAlternative?: (a: FoodAlternativeDto) => void;
  onPickRecipe?: (r: RecipeDto) => void;
  onCreate?: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQ('');
  }
  const mine = mode === 'mine';
  const search = useFoodSearch(mine ? '' : q, slot);
  const my = useMyFoods(open && mine);
  const typed = q.trim().toLowerCase();
  const recipes = (my.data?.recipes ?? []).filter((r) => !typed || r.name.toLowerCase().includes(typed));
  const foods = mine ? (my.data?.foods ?? []).filter((f) => !typed || f.name.toLowerCase().includes(typed)) : typed ? (search.data?.results ?? []) : [];
  const loading = mine ? my.isPending : !!typed && (search.isPending || search.settling) && !search.data;
  return (
    <MemberSheet open={open} onClose={onClose} title={title}>
      <div className="flex min-h-[50dvh] flex-col gap-3">
        <div className="flex min-h-[52px] items-center gap-2.5 rounded-full border border-divider bg-surface py-1 pl-[18px] pr-1.5 focus-within:border-accent">
          <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2.75} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={mine ? 'Search your foods' : 'Roti, dosa, dal…'} aria-label="Search food" type="search" autoComplete="off" className="min-w-0 flex-1 border-0 bg-transparent text-[16px] outline-none [&::-webkit-search-cancel-button]:hidden" />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-0 bg-transparent text-neutral-700">
              <X className="h-4 w-4" strokeWidth={2.75} />
            </button>
          )}
        </div>
        {mode === 'replace' && !typed && near.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Did you mean</span>
            <div className="flex flex-wrap gap-2">
              {near.map((a) => (
                <button key={a.foodId} type="button" onClick={() => onPickAlternative?.(a)} className="min-h-11 rounded-full border-0 bg-accent-200 px-4 text-[14px] font-extrabold text-accent-800">
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {mine && recipes.length > 0 && (
          <div className="flex flex-col gap-2">
            {recipes.map((r) => (
              <button key={r.id} type="button" onClick={() => onPickRecipe?.(r)} className="flex min-h-[60px] items-center gap-2.5 rounded-[22px] border-0 bg-accent-2-200 px-4 text-left text-accent-2-900">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-extrabold">{r.name}</span>
                  <span className="text-[12px] text-accent-2-800">
                    Recipe · {r.components.length} ingredient{r.components.length === 1 ? '' : 's'} · {fmt(r.perServing.kcal)} kcal a serving
                  </span>
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.75} />
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <div className="flex flex-col gap-3 py-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={44} r={14} />
            ))}
          </div>
        ) : mine && my.isError ? (
          <EmptyState title="Couldn’t load your foods" body="Check your connection and try again." action={<Button variant="dark" onClick={() => void my.refetch()}>Try again</Button>} />
        ) : mine && !foods.length && !recipes.length ? (
          <EmptyState title={typed ? 'Nothing matches' : 'Nothing saved yet'} body="Create a food once, or save a dish, and it’s here every time." action={onCreate ? <Button onClick={() => onCreate(q.trim())}>Create a food</Button> : undefined} />
        ) : !mine && typed && !foods.length && !search.settling ? (
          <div className="flex flex-col items-start gap-2 py-2">
            <span className="text-[14px] text-neutral-700">Nothing matches yet.</span>
            {onCreate && (
              <button type="button" onClick={() => onCreate(q.trim())} className="min-h-11 rounded-full border-0 bg-accent-200 px-4 text-[14px] font-extrabold text-accent-800">
                Create “{q.trim()}”
              </button>
            )}
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {foods.map((r) => (
              <ResultRow key={r.id} r={r} onOpen={() => onPick(r)} onAdd={() => onPick(r)} addLabel={mode === 'ing' ? `Add ${r.name} to the dish` : `Pick ${r.name}`} />
            ))}
          </ul>
        )}
      </div>
    </MemberSheet>
  );
}
