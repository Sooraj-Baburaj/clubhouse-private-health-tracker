import { Check, ChevronDown, Minus, Plus, Search } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { FoodSearchResult } from '@clubhouse/contracts';
import { fractionText, portionText } from '@clubhouse/domain';
import { toast } from '@clubhouse/ui';
import { cartTotals, dishItem, itemFromAlternative, itemFromSearch, itemGrams, itemNutrition, type CartItem } from '@/features/food';
import { fmt } from '@/features/format';
import { useMealDraft, type ReadItem, type ReadState } from '@/features/mealDraft';
import { useMealFlow } from '@/pages/log/mealFlow';
import { cn } from '@/lib/cn';
import { AIBadge } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { applyChoice, chipLabel, portionOptions, stepDown, stepUp } from '@/ui/organisms/food/portion';
import { STRIPES } from './PhotoCard';
import { PickFoodSheet } from './PickFoodSheet';
import { ViewShell } from './ViewShell';

const WEIGHT = /^(\d+(?:\.\d+)?)\s*(g|ml)$/;

/** One step more or less of a line: 10 g for a typed weight, else a quarter under one and a half above. */
function stepped(i: CartItem, dir: 1 | -1): CartItem | null {
  const w = WEIGHT.exec(i.unitLabel);
  if (w && i.qty === 1) {
    const grams = Number(w[1]) + dir * 10;
    return grams < 10 ? null : applyChoice(i, { kind: 'weight', grams, unit: w[2] as 'g' | 'ml' });
  }
  if (dir < 0 && i.qty <= 0.25) return null;
  return { ...i, qty: dir > 0 ? stepUp(i.qty) : stepDown(i.qty) };
}

const amountText = (i: CartItem) => (WEIGHT.test(i.unitLabel) && i.qty === 1 ? String(Math.round(itemGrams(i))) : fractionText(i.qty));
const portionOf = (i: CartItem) => portionText(i.qty, i.servingOptions.find((o) => o.label === i.unitLabel) ?? { label: i.unitLabel });

function sourceLine(r: ReadItem): { text: string; isNew: boolean } {
  if (!r.scope) return { text: 'New to Clubhouse · AI estimate', isNew: true };
  return { text: `In our foods ✓${r.scope === 'mine' ? ' Your food' : r.scope === 'team' ? ' Team food' : r.verified ? ' Verified' : ''}`, isNew: false };
}

/** "Portion for Dal": the food's units, and typed grams unless it is only known by its unit. */
function UnitSheet({ item, onClose, onPick }: { item: CartItem | null; onClose: () => void; onPick: (i: CartItem) => void }) {
  const opts = item ? portionOptions(item.servingOptions.length ? item.servingOptions : [{ label: item.unitLabel, grams: item.unitGrams }]) : null;
  return (
    <MemberSheet open={!!item} onClose={onClose} title={item ? `Portion for ${item.name}` : ''}>
      {item && opts && (
        <div role="radiogroup" aria-label="Unit" className="flex flex-col gap-2">
          {opts.options.map((o) => {
            const on = o.label === item.unitLabel && !WEIGHT.test(item.unitLabel);
            return (
              <button key={o.label} type="button" role="radio" aria-checked={on} onClick={() => onPick(applyChoice({ ...item }, { kind: 'unit', option: o, qty: on ? item.qty : 1 }))} className={cn('flex min-h-14 items-center gap-2.5 rounded-[22px] border-2 px-4 text-left text-text', on ? 'border-accent bg-accent-200' : 'border-transparent bg-surface')}>
                <span className="flex-1 text-[15px] font-extrabold">{chipLabel(o)}</span>
                <span className="text-[12px] text-neutral-700">
                  {o.estimated ? '≈' : ''}
                  {Math.round(o.grams)} g each
                </span>
              </button>
            );
          })}
          {opts.typed && (
            <button type="button" role="radio" aria-checked={WEIGHT.test(item.unitLabel)} onClick={() => onPick(applyChoice({ ...item }, { kind: 'weight', grams: Math.max(10, Math.round(itemGrams(item))), unit: opts.typed! }))} className={cn('flex min-h-14 items-center gap-2.5 rounded-[22px] border-2 px-4 text-left text-text', WEIGHT.test(item.unitLabel) ? 'border-accent bg-accent-200' : 'border-transparent bg-surface')}>
              <span className="flex-1 text-[15px] font-extrabold">{opts.typed === 'ml' ? 'ml' : 'grams'}</span>
              <span className="text-[12px] text-neutral-700">type an amount</span>
            </button>
          )}
        </div>
      )}
    </MemberSheet>
  );
}

function Stepper({ item, onStep }: { item: CartItem; onStep: (dir: 1 | -1) => void }) {
  return (
    <div className="flex items-center gap-2">
      <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => onStep(-1)} aria-label={`Less ${item.name}`} className="grid h-11 w-11 place-items-center rounded-full border border-divider bg-transparent text-text">
        <Minus className="h-4 w-4" strokeWidth={2.75} />
      </motion.button>
      <span className="min-w-[30px] text-center font-extrabold tabular" aria-live="polite">
        {amountText(item)}
      </span>
      <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => onStep(1)} aria-label={`More ${item.name}`} className="grid h-11 w-11 place-items-center rounded-full border-0 bg-accent text-on-accent-fill">
        <Plus className="h-4 w-4" strokeWidth={2.75} />
      </motion.button>
    </div>
  );
}

function ReadRow({ r, select, onToggle, onStep, onUnit, onNotRight, onSave }: { r: ReadItem; select: boolean; onToggle: () => void; onStep: (dir: 1 | -1) => void; onUnit: () => void; onNotRight: () => void; onSave: () => void }) {
  const src = sourceLine(r);
  const portion = portionOf(r.item);
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: -8 }} className="flex flex-col gap-2 rounded-[26px] bg-surface pb-1.5 pl-3.5 pr-3 pt-3">
      <div className="flex items-start gap-2.5">
        {select && (
          <button type="button" role="checkbox" aria-checked={r.sel} aria-label={`Select ${r.item.name}`} onClick={onToggle} className="-my-2 -ml-2.5 -mr-1.5 grid h-11 w-11 shrink-0 place-items-center border-0 bg-transparent">
            <span className={cn('grid h-[26px] w-[26px] place-items-center rounded-full border-[2.5px]', r.sel ? 'border-accent bg-accent text-on-accent-fill' : 'border-neutral-500 text-transparent')}>
              <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
            </span>
          </button>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[15px] font-bold">{r.item.name}</span>
          <span className={cn('text-[12px] font-bold', src.isNew ? 'text-accent-700' : 'text-accent-2-700')}>{src.text}</span>
          {src.isNew && (
            <button type="button" onClick={onSave} className="min-h-8 self-start border-0 bg-transparent p-0 py-1 text-[13px] font-extrabold text-accent-700 underline underline-offset-[3px]">
              Save as a food
            </button>
          )}
        </span>
        <span className="whitespace-nowrap font-heading text-[19px] tabular">
          {r.item.estimated ? '≈' : ''}
          {fmt(itemNutrition(r.item).kcal)}
          <span className="font-body text-[12px] text-neutral-700"> kcal</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onUnit} aria-label={`Portion ${portion}, change unit`} className="flex min-h-10 items-center gap-1 rounded-full border border-divider bg-bg pl-3.5 pr-3 text-[13px] font-bold text-text">
          {portion}
          <ChevronDown aria-hidden className="h-3.5 w-3.5" strokeWidth={2.75} />
        </button>
        <span className="flex-1" />
        <Stepper item={r.item} onStep={onStep} />
      </div>
      <button type="button" onClick={onNotRight} className="min-h-9 self-start border-0 bg-transparent p-0 text-[12px] font-bold text-neutral-700">
        Not right?
      </button>
    </motion.li>
  );
}

/** The photo with "Reading your plate…" and a progress bar that eases towards the 20 s limit. */
function Reading({ url, query }: { url: string | null; query: string | null }) {
  const reduce = useReducedMotion();
  return (
    <div role="status" aria-live="polite" className="relative flex h-[320px] flex-col justify-end gap-2.5 overflow-hidden rounded-[32px] p-[18px]" style={url ? undefined : STRIPES}>
      {url && <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="relative flex flex-col gap-2 rounded-[24px] bg-bg p-3.5">
        <div className="flex justify-between gap-2 text-[14px] font-bold">
          <motion.span animate={reduce ? undefined : { opacity: [1, 0.55, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="truncate">
            {query ? `Reading “${query}”…` : 'Reading your plate…'}
          </motion.span>
          <span className="shrink-0 font-normal text-neutral-700">up to 20 s</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-300">
          <motion.div className="h-full rounded-full bg-accent-2" initial={{ width: '6%' }} animate={{ width: reduce ? '60%' : '92%' }} transition={{ duration: reduce ? 0 : 18, ease: [0.1, 0.7, 0.3, 1] }} />
        </div>
      </div>
    </div>
  );
}

type Picking = { mode: 'replace'; key: string } | { mode: 'readadd' };

/**
 * What the AI read (design 6b): the foods it found with where their numbers come from, portions to adjust, "Not right?"
 * swaps, select-and-group into a dish (or its own "looks like one dish" hint), a few guesses when it isn't sure, and
 * "that's not food". Nothing goes on the meal until "Add to …".
 */
export function ReadView() {
  const flow = useMealFlow();
  const read = flow.draft.read;
  const patchRead = useMealDraft((s) => s.patchRead);
  const [unitKey, setUnitKey] = useState<string | null>(null);
  const [pick, setPick] = useState<Picking | null>(null);
  const reduce = useReducedMotion();
  const totals = useMemo(() => (read ? cartTotals([...read.items.map((r) => r.item), ...(read.dish?.items.map((r) => r.item) ?? [])]) : null), [read]);
  if (!read || !totals) return null;

  const slot = flow.slotLabel(flow.draft.slot);
  const photoUrl = read.from === 'photo' ? (flow.draft.photo?.previewUrl ?? null) : null;
  const count = read.items.length + (read.dish ? 1 : 0);
  const selected = read.items.filter((r) => r.sel);
  const unitItem = unitKey ? (read.items.find((r) => r.item.key === unitKey)?.item ?? null) : null;
  const replacing = pick?.mode === 'replace' ? read.items.find((r) => r.item.key === pick.key) : undefined;
  const dishKcal = read.dish ? cartTotals(read.dish.items.map((r) => r.item)).kcal : 0;

  const setItem = (key: string, fn: (r: ReadItem) => ReadItem | null) =>
    patchRead((r) => ({ items: r.items.flatMap((x) => (x.item.key === key ? (fn(x) ?? []) : [x])) }));
  const step = (r: ReadItem, dir: 1 | -1) => {
    const next = stepped(r.item, dir);
    if (next) return setItem(r.item.key, (x) => ({ ...x, item: next }));
    const index = read.items.findIndex((x) => x.item.key === r.item.key);
    setItem(r.item.key, () => null);
    toast.show(`${r.item.name} removed`, { action: { label: 'Undo', onClick: () => patchRead((s) => ({ items: [...s.items.slice(0, index), r, ...s.items.slice(index)] })) } });
  };
  const group = (name: string, rows: ReadItem[]): Partial<ReadState> => {
    const keys = new Set(rows.map((r) => r.item.key));
    return { dish: { name: read.dish?.name ?? name, items: [...(read.dish?.items ?? []), ...rows.map((r) => ({ ...r, sel: false }))] }, items: read.items.filter((r) => !keys.has(r.item.key)), select: false, naming: false, dishHint: null };
  };
  const swap = (key: string, item: CartItem, from: Pick<ReadItem, 'scope' | 'verified'>) => {
    setItem(key, (x) => ({ ...x, item, scope: from.scope, verified: from.verified, alternatives: [] }));
    toast.show(`Swapped for ${item.name}`);
  };
  const addFound = (r: FoodSearchResult) => {
    const row: ReadItem = { item: itemFromSearch(r), sel: false, scope: r.scope, verified: r.verified, alternatives: [] };
    // A guess list becomes the plate with this food; an OK read gets one more.
    patchRead((s) => ({ kind: 'ok', items: s.kind === 'ok' ? [...s.items, row] : [row], message: null }));
  };
  const addToMeal = () => {
    const lines = read.items.map((r) => r.item);
    if (read.dish) lines.push({ ...dishItem(read.dish.name, read.dish.items.map((r) => r.item)), source: 'ai' });
    if (!lines.length) return;
    flow.addItems(lines, { toast: `${count} thing${count === 1 ? '' : 's'} on your plate` });
    if (read.from === 'photo') useMealDraft.getState().patch((d) => ({ photo: d.photo && { ...d.photo, ai: true, aiCount: count }, read: null }));
    else {
      useMealDraft.getState().patch({ read: null });
      flow.clearSearch();
    }
    flow.closeView();
  };
  const leave = (keepPhoto: boolean) => {
    if (!keepPhoto) flow.removePhoto();
    useMealDraft.getState().patch({ read: null });
    flow.closeView();
  };
  const retake = () => {
    useMealDraft.getState().patch({ read: null });
    if (read.from === 'photo') flow.replaceView('snap');
    else flow.closeView();
  };

  const primary =
    read.kind === 'ok'
      ? { label: `Add to ${slot.toLowerCase()}`, go: addToMeal, off: count === 0 }
      : read.kind === 'low'
        ? read.from === 'photo'
          ? { label: 'Keep photo, add foods', go: () => leave(true), off: false }
          : { label: 'Search instead', go: () => leave(true), off: false }
        : { label: 'Search instead', go: () => leave(false), off: false };

  // Guesses when the AI isn't sure: what it saw, then its near matches.
  const guesses = read.kind === 'low' ? read.items.flatMap((r) => [{ key: r.item.key, name: r.item.name, row: r }, ...r.alternatives.map((a) => ({ key: a.foodId, name: a.name, row: { ...r, item: itemFromAlternative(a, r.item), scope: a.scope, verified: a.verified, alternatives: [] } }))]).filter((g, i, all) => all.findIndex((x) => x.name.toLowerCase() === g.name.toLowerCase()) === i).slice(0, 5) : [];

  return (
    <ViewShell
      label={`${slot}: what the AI read`}
      title={slot}
      onBack={flow.closeView}
      right={<AIBadge />}
      footer={
        read.kind === 'reading' ? undefined : (
          <>
            <Button variant="secondary" size="lg" className="shrink-0 whitespace-nowrap px-4! text-[15px]!" onClick={retake}>
              {read.from === 'photo' ? 'Retake' : 'Start over'}
            </Button>
            <Button size="lg" className="min-w-0 flex-1 px-4! text-[16px]! [&>span]:min-w-0 [&>span]:truncate" disabled={primary.off} onClick={primary.go}>
              {primary.label}
            </Button>
          </>
        )
      }
    >
      {read.kind === 'reading' && <Reading url={photoUrl} query={read.query} />}

      {read.kind === 'ok' && (
        <>
          <div className="flex items-center gap-3">
            {read.from === 'photo' && (
              <span aria-hidden className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-full" style={photoUrl ? undefined : STRIPES}>
                {photoUrl && <img src={photoUrl} alt="" className="h-full w-full object-cover" />}
              </span>
            )}
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-[24px] leading-[1.1]">
                Found {count} thing{count === 1 ? '' : 's'}
              </h2>
              <span className="text-[13px] leading-snug text-neutral-700">{read.query ? `From “${read.query}” — check the portions.` : 'Check portions — numbers come from our food database.'}</span>
            </div>
          </div>
          <AnimatePresence initial={false}>
            {read.dishHint && !read.dish && read.items.length > 1 && (
              <motion.button
                key="hint"
                type="button"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                onClick={() => patchRead(group(read.dishHint!, read.items))}
                className="flex min-h-[52px] items-center gap-2.5 rounded-[24px] border-0 bg-accent-2-200 px-3.5 py-3 text-left text-accent-2-900"
              >
                <AIBadge className="shrink-0" />
                <span className="flex-1 text-[14px] font-bold leading-snug">These look like a {read.dishHint.toLowerCase()} — group them?</span>
                <span className="text-[13px] font-extrabold text-accent-2-800">Group</span>
              </motion.button>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2">
            <span className="eyebrow flex-1">On the plate</span>
            {read.items.length > 1 && (
              <button type="button" onClick={() => patchRead((r) => ({ select: !r.select, naming: false, items: r.items.map((x) => ({ ...x, sel: false })) }))} aria-pressed={read.select} className="min-h-10 rounded-full border-0 bg-surface px-4 text-[13px] font-bold text-text">
                {read.select ? 'Done' : 'Select'}
              </button>
            )}
          </div>
          {read.dish && (
            <div className="flex flex-col gap-2 rounded-[26px] bg-accent-2-200 p-3.5 text-accent-2-900">
              <div className="flex items-center gap-2">
                <span className="flex flex-1 flex-col">
                  <span className="text-[15px] font-extrabold">{read.dish.name}</span>
                  <span className="text-[12px] font-semibold text-accent-2-800">
                    {read.dish.items.length} ingredient{read.dish.items.length === 1 ? '' : 's'} · {fmt(dishKcal)} kcal
                  </span>
                </span>
                <button type="button" onClick={() => patchRead((r) => ({ items: [...r.items, ...(r.dish?.items ?? [])], dish: null }))} className="min-h-10 rounded-full border-0 bg-bg px-3.5 text-[13px] font-bold text-text">
                  Split up
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {read.dish.items.map((r) => (
                  <span key={r.item.key} className="rounded-full bg-bg px-2.5 py-[3px] text-[11px] font-bold text-text">
                    {r.item.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            <AnimatePresence initial={false}>
              {read.items.map((r) => (
                <ReadRow
                  key={r.item.key}
                  r={r}
                  select={read.select}
                  onToggle={() => setItem(r.item.key, (x) => ({ ...x, sel: !x.sel }))}
                  onStep={(dir) => step(r, dir)}
                  onUnit={() => setUnitKey(r.item.key)}
                  onNotRight={() => setPick({ mode: 'replace', key: r.item.key })}
                  onSave={() => flow.openView('create', { into: 'read', row: r.item.key })}
                />
              ))}
            </AnimatePresence>
          </ul>
          {read.select && selected.length >= (read.dish ? 1 : 2) && !read.naming && (
            <Button variant="dark" size="lg" block onClick={() => (read.dish ? patchRead(group(read.dish.name, selected)) : patchRead({ naming: true, dishName: '' }))}>
              {read.dish ? `Add ${selected.length} to ${read.dish.name}` : `Group ${selected.length} into a dish`}
            </Button>
          )}
          {read.naming && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                patchRead(group(read.dishName.trim().slice(0, 80) || 'My dish', selected));
              }}
              className="flex flex-col gap-2.5 rounded-[28px] bg-surface p-3.5"
            >
              <label className="flex flex-col gap-1.5 text-[13px] font-bold text-neutral-700">
                Name the dish
                <input value={read.dishName} onChange={(e) => patchRead({ dishName: e.target.value })} autoFocus placeholder="Thali, fruit bowl…" maxLength={80} className="min-h-[52px] rounded-full border border-divider bg-bg px-[18px] text-[16px] font-normal text-text outline-none focus:border-accent" />
              </label>
              <Button type="submit" block>
                Make it one dish
              </Button>
            </form>
          )}
          <div aria-live="polite" className="flex justify-between gap-2 px-1.5 text-[14px]">
            <span className="text-neutral-700 tabular">
              P {fmt(totals.protein)} g · C {fmt(totals.carbs)} g · F {fmt(totals.fat)} g · Fibre {fmt(totals.fibre)} g
            </span>
            <span className="whitespace-nowrap font-extrabold tabular">{fmt(totals.kcal)} kcal</span>
          </div>
        </>
      )}

      {(read.kind === 'low' || read.kind === 'notfood') && (
        <>
          {read.from === 'photo' && (
            <div aria-hidden className="relative h-40 overflow-hidden rounded-[28px]" style={photoUrl ? undefined : STRIPES}>
              {photoUrl && <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            </div>
          )}
          {read.kind === 'notfood' ? (
            <div className="flex flex-col gap-1.5">
              <h2 className="font-heading text-[24px]">That doesn’t look like food</h2>
              <span className="text-[14px] leading-normal text-neutral-700">Maybe the plate was out of frame. Try another photo, or search for what you ate.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <h2 className="font-heading text-[24px] leading-[1.15]">{guesses.length ? 'Couldn’t quite tell — is it one of these?' : 'Couldn’t quite tell what’s on the plate'}</h2>
              {!guesses.length && read.message && <span className="text-[14px] leading-normal text-neutral-700">{read.message}</span>}
              {guesses.length > 0 && (
                <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-2">
                  {guesses.map((g) => (
                    <button key={g.key} type="button" onClick={() => patchRead({ kind: 'ok', items: [{ ...g.row, sel: false }], message: null, dishHint: null })} className="min-h-11 rounded-full border-0 bg-accent-2-200 px-4 text-[14px] font-extrabold text-accent-2-800">
                      {g.name}
                    </button>
                  ))}
                </motion.div>
              )}
              <button type="button" onClick={() => setPick({ mode: 'readadd' })} className="flex min-h-[52px] items-center gap-2.5 rounded-full border border-divider bg-surface px-[18px] text-[15px] text-neutral-700">
                <Search aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.75} />
                Search for it
              </button>
              {read.from === 'photo' && <span className="text-[13px] leading-normal text-neutral-700">The photo stays on your meal either way.</span>}
            </div>
          )}
        </>
      )}

      <UnitSheet
        item={unitItem}
        onClose={() => setUnitKey(null)}
        onPick={(next) => {
          setItem(next.key, (x) => ({ ...x, item: next }));
          setUnitKey(null);
        }}
      />
      <PickFoodSheet
        open={!!pick}
        mode={pick?.mode ?? 'readadd'}
        title={replacing ? `Not ${replacing.item.name}?` : 'Search foods'}
        slot={flow.draft.slot}
        near={replacing?.alternatives ?? []}
        onClose={() => setPick(null)}
        onPick={(r) => {
          if (pick?.mode === 'replace' && replacing) swap(replacing.item.key, { ...itemFromSearch(r), key: replacing.item.key }, r);
          else addFound(r);
          setPick(null);
        }}
        onPickAlternative={(a) => {
          if (replacing) swap(replacing.item.key, itemFromAlternative(a, replacing.item), a);
          setPick(null);
        }}
        onCreate={(name) => {
          setPick(null);
          flow.openView('create', { into: 'read', name, row: replacing?.item.key });
        }}
      />
    </ViewShell>
  );
}
