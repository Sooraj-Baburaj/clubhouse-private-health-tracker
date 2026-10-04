import { Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import type { ServingOptionDto } from '@clubhouse/contracts';
import { fractionText, portionText } from '@clubhouse/domain';
import { cn } from '@/lib/cn';
import { chipLabel, FRACTIONS, portionOptions, stepDown, stepUp, type PortionChoice } from './portion';

function Step({ label, onClick, plus }: { label: string; onClick: () => void; plus?: boolean }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label={label}
      className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full', plus ? 'border-0 bg-accent text-on-accent-fill' : 'border border-divider bg-transparent text-text')}
    >
      {plus ? <Plus className="h-4 w-4" strokeWidth={2.75} /> : <Minus className="h-4 w-4" strokeWidth={2.75} />}
    </motion.button>
  );
}

/** "2 scoops" as a big amount and a small unit. */
function AmountText({ text }: { text: string }) {
  const [amount, ...rest] = text.split(' ');
  return (
    <span className="min-w-[140px] text-center font-heading text-[34px] leading-tight" aria-live="polite">
      {amount} <span className="font-body text-[16px] text-neutral-700">{rest.join(' ')}</span>
    </span>
  );
}

/**
 * The portion of a food: its units as chips (plus a typed weight unless the food is only known by its unit), then a
 * − amount + stepper with quick fractions, or the typed amount. `compact` is the dish ingredient editor.
 */
export function PortionPicker({ options, value, onChange, compact }: { options: ServingOptionDto[]; value: PortionChoice; onChange: (c: PortionChoice) => void; compact?: boolean }) {
  const { options: units, typed } = portionOptions(options);
  const shown = value.kind === 'unit' && !units.some((o) => o.label === value.option.label) ? [value.option, ...units] : units;
  const pickUnit = (o: ServingOptionDto) => onChange({ kind: 'unit', option: o, qty: value.kind === 'unit' && value.option.label === o.label ? value.qty : 1 });
  const pickTyped = () => typed && onChange({ kind: 'weight', grams: value.kind === 'weight' ? value.grams : Math.round(value.option.grams * value.qty), unit: typed });
  const chip = (on: boolean) => cn('min-h-11 shrink-0 rounded-full border-0 px-4 text-[14px] font-bold', compact && 'min-h-10 px-3.5 text-[13px]', on ? 'bg-text text-bg' : compact ? 'bg-bg text-text' : 'bg-surface text-text');
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Unit" className="flex flex-wrap gap-1.5">
        {shown.map((o) => (
          <button key={o.label} type="button" role="radio" aria-checked={value.kind === 'unit' && value.option.label === o.label} onClick={() => pickUnit(o)} className={chip(value.kind === 'unit' && value.option.label === o.label)}>
            {chipLabel(o)}
          </button>
        ))}
        {typed && (
          <button type="button" role="radio" aria-checked={value.kind === 'weight'} onClick={pickTyped} className={chip(value.kind === 'weight')}>
            {typed}
          </button>
        )}
      </div>
      {value.kind === 'unit' ? (
        compact ? (
          <div className="flex items-center gap-2.5">
            <Step label="Less" onClick={() => onChange({ ...value, qty: stepDown(value.qty) })} />
            <span className="min-w-9 text-center text-[16px] font-extrabold tabular">{fractionText(value.qty)}</span>
            <Step label="More" plus onClick={() => onChange({ ...value, qty: stepUp(value.qty) })} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-[18px]">
              <Step label="Less" onClick={() => onChange({ ...value, qty: stepDown(value.qty) })} />
              <AmountText text={portionText(value.qty, value.option)} />
              <Step label="More" plus onClick={() => onChange({ ...value, qty: stepUp(value.qty) })} />
            </div>
            <div role="radiogroup" aria-label="Quick amounts" className="grid grid-cols-6 gap-1.5">
              {FRACTIONS.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={value.qty === a} onClick={() => onChange({ ...value, qty: a })} className={cn('min-h-11 rounded-full border-0 text-[15px] font-extrabold', value.qty === a ? 'bg-accent text-on-accent-fill' : 'bg-surface text-text')}>
                  {fractionText(a)}
                </button>
              ))}
            </div>
          </>
        )
      ) : (
        <label className={cn('flex items-center gap-2.5 rounded-full border border-divider px-5 focus-within:border-accent', compact ? 'min-h-12 bg-bg' : 'min-h-14 bg-surface')}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={5000}
            value={value.grams || ''}
            onChange={(e) => onChange({ ...value, grams: Math.max(0, Math.min(5000, Number(e.target.value) || 0)) })}
            aria-label={`Amount in ${value.unit}`}
            className={cn('min-w-0 flex-1 border-0 bg-transparent outline-none tabular', compact ? 'text-[18px] font-bold' : 'font-heading text-[26px]')}
          />
          <span className="font-bold text-neutral-700">{value.unit}</span>
        </label>
      )}
    </div>
  );
}
