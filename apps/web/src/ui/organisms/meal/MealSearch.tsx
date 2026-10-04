import { Bookmark, ChevronRight, CookingPot, Plus, Search, Sparkles, X, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode, type Ref } from 'react';
import type { FoodSearchResult, MealSlot, UsualFood } from '@clubhouse/contracts';
import { portionText } from '@clubhouse/domain';
import { useOnline } from '@clubhouse/ui';
import { looksLikeMeal, useFoodSearch, useUsuals } from '@/features/food';
import { fmt } from '@/features/format';
import { AIBadge, Tag } from '@/ui/atoms/Badges';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { Spinner } from '@/ui/atoms/Spinner';
import { useListMotion } from '@/ui/organisms/today/motion';

const GROUP_TAG: Partial<Record<FoodSearchResult['group'], string>> = { recent: 'Recent', favourite: 'Favourite', mine: 'Mine', team: 'Team' };

/** "1 katori · 180 kcal". */
export const resultSub = (r: FoodSearchResult) => `${portionText(1, r.servingOptions.find((o) => o.label === r.servingLabel) ?? { label: r.servingLabel })} · ${fmt(r.perServing.kcal)} kcal`;

export function ResultRow({ r, onOpen, onAdd, addLabel }: { r: FoodSearchResult; onOpen: () => void; onAdd?: () => void; addLabel?: string }) {
  const tag = r.recipeId ? 'Recipe' : GROUP_TAG[r.group];
  return (
    <li className="flex items-center gap-2.5 border-b border-divider py-1.5 last:border-0">
      <button type="button" onClick={onOpen} aria-label={`${r.name}, ${resultSub(r)}. Choose portion`} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center gap-0.5 border-0 bg-transparent p-0 text-left text-text">
        <span className="flex items-center gap-1.5 text-[15px] font-bold">
          <span className="truncate">{r.name}</span>
          {r.aiEstimate && <AIBadge className="shrink-0" title="AI estimate" />}
          {tag && <Tag className="shrink-0 px-2 py-0 text-[10px]">{tag}</Tag>}
        </span>
        <span className="truncate text-[12px] text-neutral-700 tabular">{resultSub(r)}</span>
      </button>
      {onAdd && (
        <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={onAdd} aria-label={addLabel ?? `Add ${r.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent-fill">
          <Plus className="h-4 w-4" strokeWidth={2.75} aria-hidden />
        </motion.button>
      )}
    </li>
  );
}

function AddRow({ icon, label, sub, onClick, right }: { icon: ReactNode; label: ReactNode; sub: string; onClick: () => void; right?: ReactNode }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onClick} className="flex min-h-[60px] w-full items-center gap-3 rounded-[24px] border-0 bg-surface py-2 pl-2.5 pr-3.5 text-left text-text">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg text-accent-700">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex items-center gap-1.5 text-[15px] font-bold">{label}</span>
        <span className="text-[12px] text-neutral-700">{sub}</span>
      </span>
      {right ?? <ChevronRight aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.75} />}
    </motion.button>
  );
}

export interface MealSearchProps {
  slot: MealSlot;
  title: string | null;
  autoFocus?: boolean;
  /** "Recent" chips (the empty photo state: the quickest way to fill a snapped meal). */
  showRecents?: boolean;
  initialQuery?: string;
  onOpen: (r: FoodSearchResult) => void;
  onAdd: (r: FoodSearchResult) => void;
  onAddUsual: (u: UsualFood) => void;
  onMakeDish: () => void;
  onCreate: (name?: string) => void;
  onQuick: () => void;
  onMine: () => void;
  /** Natural-language parse ("2 rotis and dal"); omitted when the food.text AI feature is off. */
  onParse?: (text: string) => void;
  parsing?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Adding to the meal (design 2c): search (local-first, offline-capable), Recent and Your usuals chips, and the ways to
 * add something new — make a dish, create a food, quick add, my foods & recipes.
 */
export function MealSearch({ slot, title, autoFocus, showRecents, initialQuery = '', onOpen, onAdd, onAddUsual, onMakeDish, onCreate, onQuick, onMine, onParse, parsing, inputRef }: MealSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const online = useOnline();
  const search = useFoodSearch(query, slot);
  const usuals = useUsuals();
  const m = useListMotion(0.025);
  const typed = query.trim();
  const results = search.data?.results ?? [];
  const recents = !typed ? results.slice(0, 3) : [];
  // Hearted foods, so a favourite is always one tap away (the server's empty-query answer marks them).
  const favourites = !typed ? results.filter((r) => r.group === 'favourite').slice(0, 8) : [];
  const loading = (search.isPending || search.settling) && !search.data;
  return (
    <div className="flex flex-col gap-3.5">
      {title && <span className="eyebrow mt-1">{title}</span>}
      <div className="flex min-h-[54px] items-center gap-2.5 rounded-full border border-divider bg-surface py-1 pl-[18px] pr-1.5 focus-within:border-accent">
        <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2.75} aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Roti, dosa, dal…"
          aria-label="Search food"
          type="search"
          enterKeyHint="search"
          autoFocus={autoFocus}
          autoComplete="off"
          className="min-w-0 flex-1 border-0 bg-transparent text-[16px] outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {search.isFetching && typed && <Spinner className="h-4 w-4 shrink-0 text-neutral-600" />}
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-0 bg-transparent text-neutral-700">
            <X className="h-4 w-4" strokeWidth={2.75} />
          </button>
        )}
      </div>

      {!typed ? (
        <>
          {showRecents && recents.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Recent</span>
              <div className="flex flex-wrap gap-2">
                {recents.map((r) => (
                  <motion.button key={r.id} type="button" whileTap={{ scale: 0.94 }} onClick={() => onAdd(r)} aria-label={`Add ${r.name}, ${resultSub(r)}`} className="min-h-10 rounded-full border border-divider bg-transparent px-3.5 text-[13px] font-bold text-text">
                    + {r.name}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
          {!!usuals.data?.length && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Your usuals</span>
              <motion.div variants={m.container} initial="hidden" animate="show" className="flex flex-wrap gap-2">
                {usuals.data.slice(0, 8).map((u) => (
                  <motion.button key={u.id} variants={m.item} type="button" whileTap={{ scale: 0.94 }} onClick={() => onAddUsual(u)} aria-label={`Add ${u.name}, ${u.servingLabel}, ${fmt(u.kcal)} kcal`} className="min-h-10 rounded-full border-0 bg-accent-200 px-3.5 text-[13px] font-bold text-accent-800">
                    + {u.name} · {u.servingLabel}
                  </motion.button>
                ))}
              </motion.div>
            </div>
          )}
          {favourites.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Favourites</span>
              <div className="flex flex-wrap gap-2">
                {favourites.map((r) => (
                  <motion.button key={r.id} type="button" whileTap={{ scale: 0.94 }} onClick={() => onAdd(r)} aria-label={`Add ${r.name}, ${resultSub(r)}`} className="min-h-10 rounded-full border border-divider bg-transparent px-3.5 text-[13px] font-bold text-text">
                    ♥ {r.name}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <AddRow icon={<CookingPot className="h-[18px] w-[18px]" strokeWidth={2.75} aria-hidden />} label="Make a dish" sub="Mix ingredients — fruit salad, poha, a smoothie" onClick={onMakeDish} />
            <AddRow icon={<Plus className="h-[18px] w-[18px]" strokeWidth={2.75} aria-hidden />} label="Create a food" sub="Something new, with your own portions" onClick={() => onCreate()} />
            <AddRow icon={<Zap className="h-[18px] w-[18px]" strokeWidth={2.75} aria-hidden />} label="Quick add" sub="Just the calories, when you know them" onClick={onQuick} />
            <AddRow icon={<Bookmark className="h-[18px] w-[18px]" strokeWidth={2.75} aria-hidden />} label="My foods & recipes" sub="Your own foods and saved dishes" onClick={onMine} />
          </div>
        </>
      ) : (
        <>
          <AnimatePresence initial={false}>
            {onParse && looksLikeMeal(typed) && (
              <motion.div key="parse" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <AddRow
                  icon={parsing ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" strokeWidth={2.75} aria-hidden />}
                  label={
                    <>
                      <span className="truncate">Read “{typed}” with AI</span>
                      <AIBadge className="shrink-0" />
                    </>
                  }
                  sub="We split it into foods and portions for you to check"
                  onClick={() => !parsing && onParse(typed)}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <div aria-live="polite">
            {loading ? (
              <div className="flex flex-col gap-3 py-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} h={44} r={14} />
                ))}
              </div>
            ) : search.isError && !results.length ? (
              <p className="m-0 py-3 text-[14px] text-neutral-700">
                {online ? 'Search didn’t answer. ' : 'You’re offline — your usuals and quick add still work. '}
                {online && (
                  <button type="button" onClick={() => void search.refetch()} className="border-0 bg-transparent p-0 font-bold text-accent-700 underline underline-offset-2">
                    Try again
                  </button>
                )}
              </p>
            ) : !results.length && !search.settling ? (
              <div className="flex flex-col items-start gap-2 py-3.5">
                <span className="text-[14px] text-neutral-700">Nothing matches yet.</span>
                <button type="button" onClick={() => onCreate(typed)} className="min-h-11 rounded-full border-0 bg-accent-200 px-4 text-[14px] font-extrabold text-accent-800">
                  Create “{typed}”
                </button>
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {results.map((r) => (
                  <ResultRow key={r.id} r={r} onOpen={() => onOpen(r)} onAdd={() => onAdd(r)} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
