import { useMemo, useState } from 'react';
import type { FoodSearchResult, Nutrients } from '@clubhouse/contracts';
import { nutritionFor } from '@clubhouse/domain';
import { AnimatedNumber } from '@clubhouse/ui';
import { fmt } from '@/features/format';
import { AIBadge } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';
import { Chip, ChipRow } from '@/ui/atoms/Chip';
import { TextField } from '@/ui/atoms/Field';
import { Stepper } from '@/ui/atoms/Stepper';
import { MemberSheet } from '@/ui/molecules/MemberSheet';

export interface Portion {
  label: string;
  grams: number;
  qty: number;
}

const CUSTOM = '__grams';

function MacroGrid({ n }: { n: Nutrients }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      {(
        [
          ['Protein', n.protein],
          ['Carbs', n.carbs],
          ['Fat', n.fat],
          ['Fibre', n.fibre],
        ] as const
      ).map(([k, v]) => (
        <div key={k} className="rounded-[18px] bg-surface px-1 py-2">
          <div className="font-heading text-[18px] leading-none tabular">{fmt(v)} g</div>
          <div className="text-[11px] font-bold text-neutral-700">{k}</div>
        </div>
      ))}
    </div>
  );
}

/** Portion picker for a food: serving options, grams/ml, servings stepper and a live per-portion preview. */
export function PortionSheet({ food, initial, confirmLabel = 'Add', onClose, onConfirm }: { food: FoodSearchResult | null; initial?: Portion; confirmLabel?: string; onClose: () => void; onConfirm: (p: Portion) => void }) {
  const options = useMemo(() => {
    if (!food) return [];
    const list = [...food.servingOptions];
    if (!list.some((o) => o.label === food.servingLabel)) list.unshift({ label: food.servingLabel, grams: food.servingGrams });
    if (!list.some((o) => o.grams === 100)) list.push({ label: '100 g', grams: 100 });
    return list;
  }, [food]);
  const [choice, setChoice] = useState<string>('');
  const [grams, setGrams] = useState('');
  const [qty, setQty] = useState(1);

  // Start from `initial` (or the first serving) whenever a food opens (adjust state during render on change).
  const [initFor, setInitFor] = useState<{ food: FoodSearchResult | null; initial?: Portion }>({ food: null });
  if (food !== initFor.food || initial !== initFor.initial) {
    setInitFor({ food, initial });
    if (food) {
      const match = initial && options.find((o) => o.label === initial.label);
      setChoice(match ? match.label : initial ? CUSTOM : (options[0]?.label ?? CUSTOM));
      setGrams(initial && !match ? String(Math.round(initial.grams * initial.qty)) : '');
      setQty(initial && match ? initial.qty : 1);
    }
  }

  if (!food) return <MemberSheet open={false} onClose={onClose}>{null}</MemberSheet>;
  const opt = options.find((o) => o.label === choice);
  const customG = Number(grams);
  const portion: Portion | null = opt ? { label: opt.label, grams: opt.grams, qty } : customG > 0 && customG <= 5000 ? { label: `${Math.round(customG)} g`, grams: customG, qty: 1 } : null;
  const n = portion ? nutritionFor(food.per100g, portion.grams * portion.qty) : null;

  return (
    <MemberSheet open={!!food} onClose={onClose} title={food.name}>
      <div className="flex items-center gap-2 text-[13px] text-neutral-700">
        {food.brand && <span>{food.brand}</span>}
        {food.aiEstimate && <AIBadge title="AI estimate" />}
        <span>{fmt(food.per100g.kcal)} kcal per 100 g</span>
      </div>
      <ChipRow label="Portion">
        {options.map((o) => (
          <Chip key={o.label} selected={choice === o.label} onClick={() => setChoice(o.label)}>
            {o.label}
          </Chip>
        ))}
        <Chip selected={choice === CUSTOM} onClick={() => setChoice(CUSTOM)}>
          Grams / ml
        </Chip>
      </ChipRow>
      {choice === CUSTOM ? (
        <TextField label="Amount" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value.replace(/[^\d.]/g, ''))} suffix={<span className="text-neutral-700">g / ml</span>} autoFocus />
      ) : (
        <div className="flex items-center justify-between rounded-[26px] bg-surface px-4 py-3">
          <span className="text-[14px] font-bold">How many?</span>
          <Stepper value={qty} onChange={setQty} step={0.5} min={0.5} max={20} label="servings" format={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))} />
        </div>
      )}
      <div className="flex items-baseline justify-between rounded-[26px] bg-accent-200 px-5 py-3.5 text-accent-900">
        <span className="text-[13px] font-bold">{portion ? `${portion.qty !== 1 ? `${portion.qty} × ` : ''}${portion.label} · ${fmt(portion.grams * portion.qty)} g` : 'Pick a portion'}</span>
        <span className="font-heading text-[28px] leading-none tabular">
          <AnimatedNumber value={n?.kcal ?? 0} /> <span className="font-body text-[14px]">kcal</span>
        </span>
      </div>
      {n && <MacroGrid n={n} />}
      <Button size="lg" block disabled={!portion} onClick={() => portion && onConfirm(portion)}>
        {confirmLabel}
      </Button>
    </MemberSheet>
  );
}
