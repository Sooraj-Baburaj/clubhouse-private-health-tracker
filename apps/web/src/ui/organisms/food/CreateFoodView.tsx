import { ChevronDown, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ApiError, NetworkError } from '@clubhouse/client';
import { FoodDraft, PORTION_UNITS, type FoodDetail, type FoodPortionInput, type FoodTag, type PortionUnit, type ServingOptionDto } from '@clubhouse/contracts';
import { isWeightUnit, nutritionFor, parseServingLabel, portionLabel, portionText, typicalGrams, UNIT_META, weightUnitFor } from '@clubhouse/domain';
import { toast } from '@clubhouse/ui';
import { itemFromSearch, useCreateFood, useFood, useUpdateFood, type CartItem } from '@/features/food';
import { useMealDraft } from '@/features/mealDraft';
import { useMealFlow } from '@/pages/log/mealFlow';
import { cn } from '@/lib/cn';
import { AIBadge } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { Toggle } from '@/ui/atoms/Toggle';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { ViewShell } from '@/ui/organisms/meal/ViewShell';

type Diet = 'veg' | 'egg' | 'nonveg' | 'unsure';
interface PortionRow {
  key: string;
  unit: PortionUnit;
  label?: string;
  amount: number;
  grams: number | null;
  isDefault: boolean;
}
interface Form {
  name: string;
  brand: string;
  diet: Diet | null;
  amount: string;
  unit: PortionUnit;
  unitLabel: string;
  grams: string;
  noWeight: boolean;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  fibre: string;
  portions: PortionRow[];
}

const NUTRIENTS: [keyof Pick<Form, 'kcal' | 'protein' | 'carbs' | 'fat' | 'fibre'>, string, string][] = [
  ['kcal', 'Calories', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['carbs', 'Carbs', 'g'],
  ['fat', 'Fat', 'g'],
  ['fibre', 'Fibre', 'g'],
];
const DIETS: [Diet, string][] = [
  ['veg', 'Veg'],
  ['egg', 'Egg'],
  ['nonveg', 'Non-veg'],
  ['unsure', 'Not sure'],
];
const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};
const r1 = (n: number) => String(Math.round(n * 10) / 10);
const keyOf = () => Math.random().toString(36).slice(2, 10);

/** A known unit from a serving label's noun ("katori", "glasses" → glass), else custom with that name. */
function unitFromNoun(noun: string): { unit: PortionUnit; label?: string } {
  const n = noun.trim().toLowerCase();
  const hit = PORTION_UNITS.find((u) => u !== 'custom' && (UNIT_META[u].one === n || UNIT_META[u].many === n || (u === 'piece' && /^(pcs?|pieces?)$/.test(n))));
  return hit ? { unit: hit } : { unit: 'custom', label: noun.trim().slice(0, 24) || 'serving' };
}

const blank = (name = ''): Form => ({ name, brand: '', diet: null, amount: '1', unit: 'serving', unitLabel: '', grams: '', noWeight: false, kcal: '', protein: '', carbs: '', fat: '', fibre: '', portions: [] });

/** Prefill from an AI-read row ("Save as a food"): its portion and the AI's estimate. */
function fromAiItem(i: CartItem): Form {
  // The basis is one portion as it was read ("1 roti", "2 idlis"): that portion's weight and nutrition.
  const u = unitOfOption(i.servingOptions.find((o) => o.label === i.unitLabel) ?? { label: i.unitLabel, grams: i.unitGrams });
  const weightBasis = isWeightUnit(u.unit);
  const grams = i.unitGrams;
  const n = i.per100g && grams > 0 ? nutritionFor(i.per100g, grams) : i.perUnit;
  const diet: Diet | null = i.tags?.includes('meat') || i.tags?.includes('seafood') ? 'nonveg' : i.tags?.includes('egg') ? 'egg' : null;
  return {
    ...blank(i.name),
    amount: r1(weightBasis ? grams : u.amount),
    unit: u.unit,
    unitLabel: u.label ?? '',
    grams: weightBasis || !grams ? '' : r1(grams),
    diet,
    kcal: n ? r1(n.kcal) : '',
    protein: n ? r1(n.protein) : '',
    carbs: n ? r1(n.carbs) : '',
    fat: n ? r1(n.fat) : '',
    fibre: n ? r1(n.fibre) : '',
  };
}

/**
 * A saved portion as a unit and an amount: "1 scoop" → scoop × 1, "2 idlis" → idli × 2 (the unit named in the
 * singular, so it reads "1 idli"), "1/3 cup" → cup × ⅓; a label without a number is one of itself.
 */
function unitOfOption(o: ServingOptionDto): { unit: PortionUnit; label?: string; amount: number } {
  const parsed = parseServingLabel(o.label);
  if (o.unit) return { unit: o.unit, label: o.unit === 'custom' ? parsed?.noun || o.label : undefined, amount: o.amount ?? parsed?.amount ?? 1 };
  if (!parsed?.noun) return { unit: 'custom', label: o.label.slice(0, 24), amount: 1 };
  const one = parseServingLabel(portionText(1 / parsed.amount, { label: o.label }));
  return { ...unitFromNoun(one?.noun || parsed.noun), amount: parsed.amount };
}

/** Edit: the default portion becomes the basis; the other portions follow. */
function fromFood(f: FoodDetail): Form {
  const def = f.servingOptions.find((o) => o.label === f.servingLabel) ?? f.servingOptions[0] ?? { label: '100 g', grams: 100 };
  const u = unitOfOption(def);
  const n = nutritionFor(f.per100g, def.grams);
  const weightBasis = isWeightUnit(u.unit);
  return {
    name: f.name,
    brand: f.brand ?? '',
    diet: null,
    amount: weightBasis ? r1(def.grams) : r1(u.amount),
    unit: u.unit,
    unitLabel: u.label ?? '',
    grams: weightBasis ? '' : r1(def.grams),
    noWeight: !!def.estimated,
    kcal: r1(n.kcal),
    protein: r1(n.protein),
    carbs: r1(n.carbs),
    fat: r1(n.fat),
    fibre: r1(n.fibre),
    portions: f.servingOptions
      .filter((o) => o !== def && !/^\d+(\.\d+)? (g|ml)$/.test(o.label))
      .map((o) => {
        const ou = unitOfOption(o);
        return { key: keyOf(), unit: ou.unit, label: ou.label, amount: ou.amount, grams: o.grams, isDefault: false };
      }),
  };
}

function toDraft(f: Form): ReturnType<typeof FoodDraft.safeParse> {
  const weightBasis = isWeightUnit(f.unit);
  const amount = num(f.amount) ?? 0;
  return FoodDraft.safeParse({
    name: f.name,
    brand: f.brand.trim() || null,
    veg: f.diet === 'veg' ? true : f.diet === 'egg' || f.diet === 'nonveg' ? false : null,
    tags: f.diet === 'egg' ? (['egg'] as FoodTag[]) : undefined,
    basis: { unit: f.unit, ...(f.unit === 'custom' ? { label: f.unitLabel.trim() } : {}), amount, grams: weightBasis ? amount : f.noWeight ? null : (num(f.grams) ?? null) },
    nutrients: { kcal: num(f.kcal) ?? 0, protein: num(f.protein) ?? 0, carbs: num(f.carbs) ?? 0, fat: num(f.fat) ?? 0, fibre: num(f.fibre) ?? 0 },
    portions: f.noWeight ? [] : f.portions.map(({ unit, label, amount: a, grams, isDefault }) => ({ unit, ...(label ? { label } : {}), amount: a, grams, isDefault })),
  });
}

type UnitPick = { target: 'basis' } | { target: 'portion'; unit?: PortionUnit; label: string; amount: string; grams: string };

/** The unit grid, then (for a portion) "How much is 1 scoop?". */
function UnitPicker({ pick, onClose, onBasis, onPortion, setPick }: { pick: UnitPick | null; onClose: () => void; onBasis: (u: PortionUnit, label?: string) => void; onPortion: (p: FoodPortionInput) => void; setPick: (p: UnitPick) => void }) {
  const [custom, setCustom] = useState('');
  const grid = !pick || pick.target === 'basis' || !pick.unit;
  const title = pick?.target === 'basis' ? 'Nutrition is for…' : pick?.unit ? `How much is 1 ${pick.unit === 'custom' ? pick.label || 'unit' : UNIT_META[pick.unit].one}?` : 'Add a portion';
  const choose = (u: PortionUnit) => {
    if (u === 'custom' && !custom.trim()) return;
    const label = u === 'custom' ? custom.trim().slice(0, 24) : undefined;
    if (pick?.target === 'basis') onBasis(u, label);
    else if (isWeightUnit(u)) onPortion({ unit: u, amount: 100, grams: 100 });
    else setPick({ target: 'portion', unit: u, label: label ?? '', amount: '1', grams: typicalGrams(u) ? String(typicalGrams(u)) : '' });
  };
  return (
    <MemberSheet open={!!pick} onClose={onClose} title={title}>
      {pick && grid && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {PORTION_UNITS.filter((u) => u !== 'custom' && (pick.target === 'basis' || !isWeightUnit(u) || u === 'ml')).map((u) => {
              const t = typicalGrams(u);
              return (
                <button key={u} type="button" onClick={() => choose(u)} className="flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[22px] border-0 bg-surface text-text">
                  <span className="text-[15px] font-extrabold">{u}</span>
                  <span className="text-[11px] text-neutral-700">{isWeightUnit(u) ? `1 ${u}` : t ? `≈ ${t} ${weightUnitFor(u)}` : ' '}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Your own: ladle, handful…" aria-label="Your own unit" maxLength={24} className="min-h-12 min-w-0 flex-1 rounded-full border border-divider bg-surface px-4 text-[16px] outline-none focus:border-accent" />
            <Button variant="dark" disabled={!custom.trim()} onClick={() => choose('custom')}>
              Use
            </Button>
          </div>
        </>
      )}
      {pick?.target === 'portion' && pick.unit && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input value={pick.amount} onChange={(e) => setPick({ ...pick, amount: e.target.value })} inputMode="decimal" aria-label="Amount" className="min-h-[52px] w-[72px] rounded-full border border-divider bg-surface text-center text-[18px] font-extrabold outline-none focus:border-accent" />
            <span className="grid min-h-[52px] place-items-center rounded-full bg-text px-[18px] text-[15px] font-extrabold text-bg">{pick.unit === 'custom' ? pick.label : pick.unit}</span>
            <span className="font-bold text-neutral-700">=</span>
            <label className="flex min-h-[52px] items-center gap-1.5 rounded-full border border-divider bg-surface px-4 focus-within:border-accent">
              <input value={pick.grams} onChange={(e) => setPick({ ...pick, grams: e.target.value })} inputMode="decimal" aria-label={`Weight in ${weightUnitFor(pick.unit)}`} className="w-16 border-0 bg-transparent text-[18px] font-extrabold outline-none" />
              <span className="font-bold text-neutral-700">{weightUnitFor(pick.unit)}</span>
            </label>
          </div>
          {typicalGrams(pick.unit) && (
            <span className="text-[13px] font-bold text-accent-2-700">
              Typical: 1 {UNIT_META[pick.unit].one} ≈ {typicalGrams(pick.unit)} {weightUnitFor(pick.unit)}
            </span>
          )}
          <Button
            size="lg"
            block
            disabled={!(num(pick.amount) && num(pick.grams))}
            onClick={() => {
              const amount = num(pick.amount)!;
              onPortion({ unit: pick.unit!, ...(pick.unit === 'custom' ? { label: pick.label } : {}), amount, grams: num(pick.grams)! });
            }}
          >
            Done
          </Button>
        </>
      )}
    </MemberSheet>
  );
}

/**
 * Create (or edit) a food (design 8): what the nutrition is for — any unit, with its weight or "not sure" — the
 * numbers, and more ways to measure it (scoop, piece, katori…). Saved to My foods and added where it was asked for.
 */
export function CreateFoodView() {
  const flow = useMealFlow();
  const { params, draft } = flow;
  const editId = params.food ?? null;
  const into = params.into ?? 'plate';
  const editing = useFood(editId);
  const create = useCreateFood();
  const update = useUpdateFood();
  const readItem = into === 'read' && params.row ? draft.read?.items.find((r) => r.item.key === params.row)?.item : undefined;
  // "Save as a food" starts from the AI's estimate; a name typed in "Not right?" starts fresh.
  const prefill = readItem && !params.name ? readItem : undefined;
  const initial = useMemo<Form | null>(() => {
    if (editId) return editing.data ? fromFood(editing.data) : null;
    if (prefill) return fromAiItem(prefill);
    return blank(params.name ?? '');
  }, [editId, editing.data, prefill, params.name]);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<UnitPick | null>(null);
  const f = form ?? initial;

  if (!f) {
    return (
      <ViewShell label="Edit food" title="Edit food" onBack={flow.closeView}>
        <Skeleton h={52} r={999} />
        <Skeleton h={160} r={28} />
      </ViewShell>
    );
  }
  const set = (p: Partial<Form>) => {
    setForm({ ...f, ...p });
    setErrors({});
  };
  const weightBasis = isWeightUnit(f.unit);
  const unitText = f.unit === 'custom' ? f.unitLabel || 'unit' : f.unit;
  const amount = num(f.amount) ?? 1;
  const basisText = portionLabel(amount, f.unit, f.unitLabel);
  const kcal = num(f.kcal);
  const preview = kcal ? `${portionLabel(2 * amount, f.unit, f.unitLabel)} = ${Math.round(kcal * 2)} kcal · ${Math.round((num(f.protein) ?? 0) * 2)} g protein` : 'Add the calories to see a preview';
  const busy = create.isPending || update.isPending;

  const save = () => {
    const parsed = toDraft(f);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path.join('.');
        errs[k] ??= k === 'nutrients.kcal' ? `Add the calories for ${basisText}` : k === 'name' ? 'Give it a name (2+ letters).' : k === 'basis.amount' ? 'How much is the nutrition for?' : k === 'basis.label' ? 'Name the unit.' : i.message;
      }
      setErrors(errs);
      return;
    }
    const onError = (e: Error) => toast.error(e instanceof NetworkError ? 'Saving a food needs a connection — quick add works offline.' : e instanceof ApiError ? e.message : 'Couldn’t save that food.');
    if (editId) {
      update.mutate(
        { id: editId, draft: parsed.data },
        {
          onSuccess: (food) => {
            toast.success(`${food.name} updated`);
            flow.closeView();
          },
          onError,
        },
      );
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: (food) => {
        const item = itemFromSearch(food);
        const store = useMealDraft.getState();
        const row = { item, sel: false, scope: 'mine' as const, verified: false, alternatives: [] };
        if (into === 'dish') store.patchDish((d) => ({ components: [...d.components, item] }));
        else if (into === 'read' && readItem) store.patchRead((r) => ({ items: r.items.map((x) => (x.item.key === readItem.key ? { ...row, item: { ...item, key: readItem.key } } : x)) }));
        else if (into === 'read') store.patchRead((r) => ({ kind: 'ok', items: r.kind === 'ok' ? [...r.items, row] : [row], message: null }));
        else flow.addItems([item], { toast: false });
        toast.success(`${food.name} saved to My foods`);
        flow.closeView();
      },
      onError,
    });
  };

  return (
    <ViewShell
      label={editId ? 'Edit food' : 'Create a food'}
      title={editId ? 'Edit food' : 'Create a food'}
      onBack={flow.closeView}
      footer={
        <Button size="lg" block className="text-[17px]" loading={busy} onClick={save}>
          {editId ? 'Save changes' : into === 'dish' ? 'Save and add to the dish' : into === 'read' ? 'Save as a food' : `Save and add to ${flow.slotLabel(draft.slot).toLowerCase()}`}
        </Button>
      }
    >
      {prefill && (
        <div className="flex items-start gap-2 rounded-[22px] bg-accent-2-200 px-3.5 py-2.5 text-[13px] leading-snug text-accent-2-900">
          <AIBadge className="mt-px shrink-0" />
          <span>Prefilled from the AI estimate. Check it against the packet or recipe before saving.</span>
        </div>
      )}
      <label className="flex flex-col gap-1.5 text-[13px] font-bold text-neutral-700">
        Name
        <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Whey protein, homemade chikki…" maxLength={80} autoFocus={!f.name} aria-invalid={!!errors.name} className={cn('min-h-[52px] rounded-full border bg-surface px-[18px] text-[16px] font-normal text-text outline-none focus:border-accent', errors.name ? 'border-band-red' : 'border-divider')} />
        {errors.name && <span className="px-2 text-band-red-fg">{errors.name}</span>}
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-bold text-neutral-700">
        Brand (optional)
        <input value={f.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="e.g. Amul" maxLength={60} className="min-h-[52px] rounded-full border border-divider bg-surface px-[18px] text-[16px] font-normal text-text outline-none focus:border-accent" />
      </label>
      {!editId && (
        <div role="radiogroup" aria-label="Diet" className="flex flex-wrap gap-1.5">
          {DIETS.map(([d, label]) => (
            <button key={d} type="button" role="radio" aria-checked={f.diet === d} onClick={() => set({ diet: d })} className={cn('min-h-11 rounded-full border-0 px-4 text-[14px] font-bold', f.diet === d ? 'bg-text text-bg' : 'bg-surface text-text')}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
        <span className="eyebrow">Nutrition is for</span>
        <div className="flex flex-wrap items-center gap-2">
          <input value={f.amount} onChange={(e) => set({ amount: e.target.value })} inputMode="decimal" aria-label="Amount" aria-invalid={!!errors['basis.amount']} className="min-h-12 w-[72px] rounded-full border border-divider bg-bg text-center text-[16px] font-extrabold text-text outline-none focus:border-accent" />
          <button type="button" onClick={() => setPick({ target: 'basis' })} className="flex min-h-12 items-center gap-1 rounded-full border-0 bg-text pl-4 pr-3 text-[14px] font-extrabold text-bg">
            {unitText}
            <ChevronDown aria-hidden className="h-3.5 w-3.5" strokeWidth={2.75} />
          </button>
          {!weightBasis && !f.noWeight && (
            <>
              <span className="text-[14px] font-bold text-neutral-700">=</span>
              <label className="flex min-h-12 items-center gap-1.5 rounded-full border border-divider bg-bg px-3.5 focus-within:border-accent">
                <input value={f.grams} onChange={(e) => set({ grams: e.target.value })} inputMode="decimal" aria-label={`Weight in ${weightUnitFor(f.unit)}`} className="w-12 border-0 bg-transparent text-[16px] font-extrabold text-text outline-none" />
                <span className="font-bold text-neutral-700">{weightUnitFor(f.unit)}</span>
              </label>
            </>
          )}
        </div>
        {!weightBasis && (
          <label className="flex min-h-12 items-center gap-3">
            <span className="flex flex-1 flex-col">
              <span className="text-[14px] font-bold">Not sure of the weight</span>
              <span className="text-[12px] text-neutral-700">Then it’s logged by the {unitText} only</span>
            </span>
            <Toggle label="Not sure of the weight" checked={f.noWeight} onChange={(v) => set({ noWeight: v })} />
          </label>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {NUTRIENTS.map(([k, label, u]) => {
          const err = k === 'kcal' ? errors['nutrients.kcal'] : undefined;
          return (
            <label key={k} className={cn('flex flex-col gap-1.5 text-[13px] font-bold text-neutral-700', k === 'kcal' && 'col-span-2')}>
              {label}
              {k === 'kcal' ? ' *' : ''}
              <span className={cn('flex min-h-[52px] items-center gap-1.5 rounded-full border-2 bg-surface px-4', err ? 'border-accent-700' : 'border-divider')}>
                <input value={f[k]} onChange={(e) => set({ [k]: e.target.value })} inputMode="decimal" aria-invalid={!!err} className="min-w-0 flex-1 border-0 bg-transparent text-[16px] font-bold text-text outline-none" />
                <span className="font-normal text-neutral-700">{u}</span>
              </span>
            </label>
          );
        })}
      </div>
      {errors['nutrients.kcal'] && (
        <div role="alert" className="text-[14px] font-bold text-accent-700">
          {errors['nutrients.kcal']}
        </div>
      )}
      {!f.noWeight && (
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Portions</span>
          <span className="text-[13px] leading-snug text-neutral-700">The ways you measure it. The default is what we suggest first.</span>
          {f.portions.map((p, i) => (
            <div key={p.key} className="flex min-h-[52px] items-center gap-1.5 rounded-[22px] bg-surface py-1 pl-4 pr-1">
              <span className="flex-1 text-[14px] font-bold">
                {portionLabel(1, p.unit, p.label)}
                {p.grams ? ` · ${Math.round((p.grams / p.amount) * 10) / 10} ${weightUnitFor(p.unit)}` : ''}
              </span>
              <button type="button" onClick={() => set({ portions: f.portions.map((x, j) => ({ ...x, isDefault: j === i ? !x.isDefault : false })) })} aria-pressed={p.isDefault} aria-label={`Make 1 ${p.label ?? p.unit} the default`} className={cn('min-h-11 border-0 bg-transparent px-2 text-[13px] font-extrabold', p.isDefault ? 'text-accent-700' : 'text-neutral-700')}>
                {p.isDefault ? '★ default' : '☆ make default'}
              </button>
              <button type="button" onClick={() => set({ portions: f.portions.filter((_, j) => j !== i) })} aria-label="Remove portion" className="grid h-11 w-11 place-items-center rounded-full border-0 bg-transparent text-neutral-700">
                <X className="h-4 w-4" strokeWidth={2.75} />
              </button>
            </div>
          ))}
          {f.portions.length < 10 && (
            <Button variant="surface" className="self-start bg-accent-200 text-accent-800" icon={<Plus className="h-4 w-4" strokeWidth={2.75} aria-hidden />} onClick={() => setPick({ target: 'portion', label: '', amount: '1', grams: '' })}>
              Add a portion
            </Button>
          )}
        </div>
      )}
      <div aria-live="polite" className="rounded-[24px] bg-accent-2-200 px-4 py-3.5 font-heading text-[18px] text-accent-2-900">
        {preview}
      </div>
      {!editId && <span className="px-1.5 text-[12px] leading-snug text-neutral-700">It’s saved to My foods. Your admin may check new foods before the whole team sees them.</span>}
      <UnitPicker
        pick={pick}
        setPick={setPick}
        onClose={() => setPick(null)}
        onBasis={(u, label) => {
          set({ unit: u, unitLabel: label ?? '', amount: isWeightUnit(u) ? '100' : f.amount === '100' ? '1' : f.amount, grams: isWeightUnit(u) ? '' : f.grams || (typicalGrams(u) ? String(typicalGrams(u)) : '') });
          setPick(null);
        }}
        onPortion={(p) => {
          set({ portions: [...f.portions, { key: keyOf(), unit: p.unit, label: p.label, amount: p.amount, grams: p.grams, isDefault: false }] });
          setPick(null);
          toast.show(`Portion added · ${portionLabel(1, p.unit, p.label)}`);
        }}
      />
    </ViewShell>
  );
}
