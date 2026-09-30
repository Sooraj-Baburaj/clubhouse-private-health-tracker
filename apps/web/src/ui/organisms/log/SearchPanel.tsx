import { BookOpen, Camera, ChevronRight, Flame, Plus, PlusCircle, Search, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { useState, type ReactNode } from 'react';
import type { FoodSearchResult, MealSlot, UsualFood } from '@clubhouse/contracts';
import { useOnline } from '@clubhouse/ui';
import { looksLikeMeal, useFoodSearch, useUsuals } from '@/features/food';
import { fmt } from '@/features/format';
import { AIBadge, Tag } from '@/ui/atoms/Badges';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { Spinner } from '@/ui/atoms/Spinner';
import { useListMotion } from '@/ui/organisms/today/motion';

const GROUP_TAG: Partial<Record<FoodSearchResult['group'], string>> = { recent: 'Recent', favourite: 'Favourite', mine: 'Mine', team: 'Team' };

function ResultRow({ r, onAdd, onOpen, variants }: { r: FoodSearchResult; onAdd: () => void; onOpen: () => void; variants: Variants }) {
  const tag = GROUP_TAG[r.group];
  return (
    <motion.li variants={variants} className="flex items-center gap-2.5 border-b border-divider py-2 last:border-0">
      <button type="button" onClick={onOpen} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center text-left" aria-label={`${r.name}, ${r.servingLabel}, ${fmt(r.perServing.kcal)} kcal. Choose portion`}>
        <span className="flex items-center gap-1.5 text-[15px] font-bold">
          <span className="truncate">{r.name}</span>
          {r.aiEstimate && <AIBadge className="shrink-0" title="AI estimate" />}
          {tag && <Tag className="shrink-0 px-2 py-0 text-[10px]">{tag}</Tag>}
        </span>
        <span className="truncate text-[12px] text-neutral-700 tabular">
          {r.servingLabel} · P {fmt(r.perServing.protein)} · C {fmt(r.perServing.carbs)} · F {fmt(r.perServing.fat)}
        </span>
      </button>
      <span className="text-[14px] font-extrabold tabular">{fmt(r.perServing.kcal)}</span>
      <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={onAdd} aria-label={`Add ${r.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent-fill">
        <Plus className="h-4 w-4" strokeWidth={2.75} aria-hidden />
      </motion.button>
    </motion.li>
  );
}

function ExtraRow({ icon, title, sub, onClick, right }: { icon: ReactNode; title: ReactNode; sub?: string; onClick: () => void; right?: ReactNode }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onClick} className="flex min-h-14 w-full items-center gap-3 rounded-[22px] bg-surface px-4 py-3 text-left">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg text-accent-700">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 text-[15px] font-bold">{title}</span>
        {sub && <span className="text-[12px] text-neutral-700">{sub}</span>}
      </span>
      {right ?? <ChevronRight className="h-4 w-4 text-neutral-600" strokeWidth={2.75} aria-hidden />}
    </motion.button>
  );
}

export interface SearchPanelProps {
  slot: MealSlot;
  onAdd: (r: FoodSearchResult) => void;
  onAddUsual: (u: UsualFood) => void;
  onOpen: (r: FoodSearchResult) => void;
  /** Natural-language parse; omitted when the food.text AI feature is off. */
  onParse?: (text: string) => void;
  parsing?: boolean;
  onQuickAdd?: () => void;
  onCreate?: () => void;
  onMyFoods?: () => void;
  onCamera?: () => void;
  autoFocus?: boolean;
  showUsuals?: boolean;
}

/** Search-first food logging (design 2b): debounced, abortable search with usuals, AI parse, quick add and my foods. */
export function SearchPanel({ slot, onAdd, onAddUsual, onOpen, onParse, parsing, onQuickAdd, onCreate, onMyFoods, onCamera, autoFocus, showUsuals = true }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const online = useOnline();
  const search = useFoodSearch(query, slot);
  const usuals = useUsuals();
  const m = useListMotion(0.025);
  const results = search.data?.results ?? [];
  const typed = query.trim();
  const showParse = !!onParse && looksLikeMeal(typed);
  const loading = (search.isPending || search.settling) && !search.data;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex min-h-[54px] items-center gap-2 rounded-full border border-divider bg-surface py-1 pl-[18px] pr-1.5 focus-within:border-accent">
        <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2.75} aria-hidden />
        <input
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
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-700">
            <X className="h-4 w-4" strokeWidth={2.75} />
          </button>
        )}
        {onCamera && (
          <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={onCamera} aria-label="Snap a photo instead" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent-fill">
            <Camera className="h-[18px] w-[18px]" strokeWidth={2.75} />
          </motion.button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {showUsuals && !typed && !!usuals.data?.length && (
          <motion.div key="usuals" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Your usuals</span>
            <motion.div variants={m.container} initial="hidden" animate="show" className="flex flex-wrap gap-2">
              {usuals.data.slice(0, 8).map((u) => (
                <motion.button key={u.id} variants={m.item} type="button" whileTap={{ scale: 0.94 }} onClick={() => onAddUsual(u)} aria-label={`Add ${u.name}, ${u.servingLabel}, ${fmt(u.kcal)} kcal`} className="min-h-10 rounded-full bg-accent-200 px-3.5 text-[13px] font-bold text-accent-800">
                  + {u.name}
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showParse && (
          <motion.div key="parse" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <ExtraRow
              icon={parsing ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" strokeWidth={2.75} aria-hidden />}
              title={
                <>
                  <span className="truncate">Parse “{typed}” with AI</span>
                  <AIBadge className="shrink-0" />
                </>
              }
              sub="We split it into foods and portions for you to check"
              onClick={() => !parsing && onParse?.(typed)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div aria-live="polite">
        {!typed && results.length > 0 && <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Recent and favourites</span>}
        {loading ? (
          <div className="flex flex-col gap-3 py-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={44} r={14} />
            ))}
          </div>
        ) : search.isError && !results.length ? (
          <p className="m-0 py-3 text-[14px] text-neutral-700">
            {online ? 'Search didn’t answer. ' : 'You’re offline — search needs a connection. Your usuals and quick add still work. '}
            {online && (
              <button type="button" onClick={() => void search.refetch()} className="font-bold text-accent-700 underline underline-offset-2">
                Try again
              </button>
            )}
          </p>
        ) : typed && !results.length && !search.settling ? (
          <p className="m-0 py-3 text-[14px] text-neutral-700">Nothing matches “{typed}” yet. Quick-add the calories or create it below — or ask your admin to add it.</p>
        ) : (
          <motion.ul key={search.debouncedQuery} variants={m.container} initial="hidden" animate="show" className="m-0 flex list-none flex-col p-0">
            {results.map((r) => (
              <ResultRow key={r.id} variants={m.item} r={r} onAdd={() => onAdd(r)} onOpen={() => onOpen(r)} />
            ))}
          </motion.ul>
        )}
      </div>

      {(onQuickAdd || onCreate || onMyFoods) && (
        <div className="flex flex-col gap-2">
          {onQuickAdd && <ExtraRow icon={<Flame className="h-4 w-4" strokeWidth={2.75} aria-hidden />} title="Quick add calories" sub="Just the number — macros optional" onClick={onQuickAdd} />}
          {onCreate && <ExtraRow icon={<PlusCircle className="h-4 w-4" strokeWidth={2.75} aria-hidden />} title="Create a food" sub="Save it once, find it every time" onClick={onCreate} />}
          {onMyFoods && <ExtraRow icon={<BookOpen className="h-4 w-4" strokeWidth={2.75} aria-hidden />} title="My foods & recipes" onClick={onMyFoods} />}
        </div>
      )}
    </div>
  );
}
