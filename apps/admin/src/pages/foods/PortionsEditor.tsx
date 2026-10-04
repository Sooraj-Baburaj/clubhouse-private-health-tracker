import { Plus, Star, X } from 'lucide-react';
import { PORTION_UNITS, type AdminFoodRow, type PortionUnit, type ServingOptionDto } from '@clubhouse/contracts';
import { isWeightUnit, parseServingLabel, portionLabel, portionText, typicalGrams, UNIT_META, weightUnitFor } from '@clubhouse/domain';
import { cn } from '@/lib/cn';
import { Button, IconButton, Input, NumberInput, Select } from '@/ui';

export const MAX_PORTIONS = 12;

/** One way to measure a food, as the admin edits it: amount × unit weighs `weight` g (ml for volume units). */
export interface PortionRow {
  key: string;
  unit: PortionUnit;
  /** The unit's name when `unit` is custom (ladle, roti…). */
  custom: string;
  amount: number | null;
  weight: number | null;
  estimated: boolean;
  isDefault: boolean;
  /** The label it was saved with, kept while the measure is unchanged so logs and usuals still match it. */
  saved: string | null;
  /** The option as stored; an untouched row is saved back exactly as it was. */
  original: ServingOptionDto | null;
  touched: boolean;
}

let seq = 0;
const nextKey = () => `p${++seq}`;

/**
 * A saved label's unit and amount: a known unit ("2 pcs" → piece × 2, "1/3 cup" → cup × ⅓), else a custom one named in
 * the singular ("2 idlis" → idli × 2), so an edited portion reads "1 idli".
 */
function unitOfLabel(label: string): { unit: PortionUnit; custom: string; amount: number } {
  const p = parseServingLabel(label);
  if (!p?.noun) return { unit: 'custom', custom: label.slice(0, 24), amount: 1 };
  const noun = (parseServingLabel(portionText(1 / p.amount, { label }))?.noun || p.noun).trim();
  const lower = noun.toLowerCase();
  if (lower === 'g' || lower === 'ml') return { unit: lower, custom: '', amount: p.amount };
  if (/^(pcs?|pieces?)$/.test(lower)) return { unit: 'piece', custom: '', amount: p.amount };
  const known = PORTION_UNITS.find((u) => u !== 'custom' && (UNIT_META[u].one === lower || UNIT_META[u].many === lower));
  return known ? { unit: known, custom: '', amount: p.amount } : { unit: 'custom', custom: noun.slice(0, 24), amount: p.amount };
}

export function portionRowsOf(food: Pick<AdminFoodRow, 'servingOptions' | 'defaultServing'>): PortionRow[] {
  const def = food.defaultServing ?? food.servingOptions[0]?.label ?? null;
  return food.servingOptions.map((o) => {
    const u = o.unit ? { unit: o.unit, custom: o.unit === 'custom' ? (parseServingLabel(o.label)?.noun ?? o.label) : '', amount: o.amount ?? 1 } : unitOfLabel(o.label);
    return { key: nextKey(), ...u, amount: Math.round(u.amount * 1000) / 1000, weight: o.grams, estimated: !!o.estimated, isDefault: o.label === def, saved: o.label, original: o, touched: false };
  });
}

export const blankPortion = (): PortionRow => ({ key: nextKey(), unit: 'piece', custom: '', amount: 1, weight: null, estimated: true, isDefault: false, saved: null, original: null, touched: true });

/**
 * Rows → serving options and the default label. A weight left empty becomes the unit's typical weight, flagged as an
 * estimate (members then log it by the unit only). Errors are keyed `portions.<i>.<field>`.
 */
export function toServingOptions(rows: PortionRow[]): { options: ServingOptionDto[]; defaultServing: string | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const options: ServingOptionDto[] = [];
  let defaultServing: string | null = null;
  rows.forEach((r, i) => {
    if (!r.touched && r.original) {
      options.push(r.original);
      if (r.isDefault) defaultServing = r.original.label;
      return;
    }
    const amount = isWeightUnit(r.unit) ? (r.amount ?? r.weight) : r.amount;
    if (!amount || amount <= 0) errors[`portions.${i}.amount`] = 'Above 0';
    if (r.unit === 'custom' && !r.custom.trim()) errors[`portions.${i}.custom`] = 'Name the unit';
    if (r.weight != null && (r.weight <= 0 || r.weight > 5000)) errors[`portions.${i}.weight`] = '1–5000';
    if (errors[`portions.${i}.amount`] || errors[`portions.${i}.custom`] || errors[`portions.${i}.weight`]) return;
    const grams = isWeightUnit(r.unit) ? amount! : (r.weight ?? (typicalGrams(r.unit) ?? 100) * amount!);
    const label = r.saved ?? portionLabel(amount!, r.unit, r.custom.trim()).slice(0, 40);
    if (options.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
      errors[`portions.${i}.amount`] = 'Same as another portion';
      return;
    }
    options.push({ label, grams: Math.round(grams * 10) / 10, unit: r.unit, amount: amount!, ...(r.estimated || (r.weight == null && !isWeightUnit(r.unit)) ? { estimated: true } : {}) });
    if (r.isDefault) defaultServing = label;
  });
  if (!rows.length) errors.portions = 'Add at least one portion.';
  return { options, defaultServing: defaultServing ?? options[0]?.label ?? null, errors };
}

const UNIT_LABEL: Record<PortionUnit, string> = { ...Object.fromEntries(PORTION_UNITS.map((u) => [u, u])), custom: 'custom…' } as Record<PortionUnit, string>;

/**
 * Portions (admin design: Foods drawer): unit, amount, weight in g (ml for volume units), estimated or exact, and the
 * default ★ members see first. Up to 12.
 */
export function PortionsEditor({ rows, onChange, errors, hint, readOnly }: { rows: PortionRow[]; onChange: (rows: PortionRow[]) => void; errors: Record<string, string>; hint: string; readOnly?: boolean }) {
  // Editing the measure makes a fresh label; the ★ alone doesn't touch the portion itself.
  const patch = (i: number, p: Partial<PortionRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...p, touched: r.touched || Object.keys(p).some((k) => k !== 'isDefault'), saved: 'unit' in p || 'amount' in p || 'custom' in p ? null : r.saved } : p.isDefault ? { ...r, isDefault: false } : r)));
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    if (next.length && !next.some((r) => r.isDefault)) next[0] = { ...next[0]!, isDefault: true };
    onChange(next);
  };
  const grid = 'grid items-center gap-2 [grid-template-columns:36px_minmax(96px,130px)_64px_minmax(84px,100px)_minmax(0,1fr)_32px]';
  return (
    <section aria-labelledby="portions-h" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="portions-h" className="h3">
          Portions
        </h3>
        <span className="font-mono text-[12px] text-muted">
          {rows.length} of {MAX_PORTIONS}
        </span>
      </div>
      <p className="m-0 text-[12px] leading-relaxed text-muted">{hint}</p>
      {errors.portions && (
        <p role="alert" className="m-0 text-[12px] font-semibold text-accent-dark">
          {errors.portions}
        </p>
      )}
      <div className="overflow-x-auto">
        <div className="flex min-w-[460px] flex-col gap-2">
          <div className={cn(grid, 'font-mono text-[10px] uppercase tracking-[0.12em] text-muted')} aria-hidden>
            <span>Def.</span>
            <span>Unit</span>
            <span>Amount</span>
            <span>Weight</span>
            <span>Estimated</span>
            <span />
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {rows.map((r, i) => {
              const wUnit = isWeightUnit(r.unit) ? r.unit : weightUnitFor(r.unit);
              const name = r.unit === 'custom' ? r.custom || 'custom unit' : r.unit;
              return (
                <li key={r.key} className="flex flex-col gap-1">
                  <div className={grid}>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => patch(i, { isDefault: true })}
                      aria-pressed={r.isDefault}
                      aria-label={`Make ${name} the default portion`}
                      className={cn('grid h-9 w-9 place-items-center rounded-[10px] border', r.isDefault ? 'border-accent-border bg-accent-tint text-accent' : 'border-border bg-white text-border')}
                    >
                      <Star aria-hidden className="h-4 w-4" fill={r.isDefault ? 'currentColor' : 'none'} />
                    </button>
                    <Select aria-label={`Unit for portion ${i + 1}`} value={r.unit} disabled={readOnly} onChange={(e) => patch(i, { unit: e.target.value as PortionUnit, ...(isWeightUnit(e.target.value as PortionUnit) ? { amount: 100, weight: null, estimated: false } : {}) })} className="[&>select]:h-9 [&>select]:text-[13px]">
                      {PORTION_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {UNIT_LABEL[u]}
                        </option>
                      ))}
                    </Select>
                    <NumberInput aria-label={`Amount for portion ${i + 1}`} value={r.amount} min={0} step={isWeightUnit(r.unit) ? 10 : 0.5} disabled={readOnly} onValue={(v) => patch(i, { amount: v })} invalid={!!errors[`portions.${i}.amount`]} className="h-9 px-2" />
                    {isWeightUnit(r.unit) ? (
                      <span className="text-[12px] text-muted">= {r.amount ?? '—'} {r.unit}</span>
                    ) : (
                      <label className="flex h-9 min-w-0 items-center gap-1 rounded-[10px] border border-border bg-white px-2 focus-within:border-accent">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          aria-label={`Weight in ${wUnit} for portion ${i + 1}`}
                          aria-invalid={!!errors[`portions.${i}.weight`] || undefined}
                          value={r.weight ?? ''}
                          disabled={readOnly}
                          placeholder={typicalGrams(r.unit) ? String(Math.round((typicalGrams(r.unit) ?? 0) * (r.amount ?? 1))) : '—'}
                          onChange={(e) => patch(i, { weight: e.target.value === '' ? null : Number(e.target.value) })}
                          className="w-full min-w-0 border-0 bg-transparent font-mono text-[13px] outline-none"
                        />
                        <span className="text-[12px] text-muted">{wUnit}</span>
                      </label>
                    )}
                    {isWeightUnit(r.unit) ? (
                      <span className="text-[12px] text-muted">Exact</span>
                    ) : (
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => patch(i, { estimated: !r.estimated })}
                        aria-pressed={r.estimated}
                        className={cn('h-[30px] justify-self-start rounded-full border px-2.5 text-[12px] font-semibold', r.estimated ? 'border-under-border bg-under-bg text-under-fg' : 'border-border bg-white text-muted')}
                      >
                        {r.estimated ? '≈ Estimated' : 'Exact'}
                      </button>
                    )}
                    {!readOnly && (
                      <IconButton label={`Remove portion ${name}`} size={32} onClick={() => remove(i)} disabled={rows.length <= 1}>
                        <X className="h-4 w-4" />
                      </IconButton>
                    )}
                  </div>
                  {r.unit === 'custom' && (
                    <div className="pl-11">
                      <Input aria-label={`Name of the custom unit for portion ${i + 1}`} value={r.custom} maxLength={24} placeholder="ladle, handful, roti…" disabled={readOnly} onChange={(e) => patch(i, { custom: e.target.value })} invalid={!!errors[`portions.${i}.custom`]} className="h-9 max-w-[240px] text-[13px]" />
                    </div>
                  )}
                  {(errors[`portions.${i}.amount`] || errors[`portions.${i}.custom`] || errors[`portions.${i}.weight`]) && (
                    <span role="alert" className="pl-11 text-[12px] font-semibold text-accent-dark">
                      {errors[`portions.${i}.amount`] ?? errors[`portions.${i}.custom`] ?? errors[`portions.${i}.weight`]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {!readOnly && rows.length < MAX_PORTIONS && (
        <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([...rows, blankPortion()])} className="self-start">
          Add a portion
        </Button>
      )}
    </section>
  );
}
