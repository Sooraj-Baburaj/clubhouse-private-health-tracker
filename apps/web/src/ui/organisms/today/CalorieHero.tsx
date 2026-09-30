import type { Nutrient, TodayResponse } from '@clubhouse/contracts';
import { AnimatedNumber, Bar } from '@clubhouse/ui';
import { fmt } from '@/features/format';
import { BandPill } from '@/ui/atoms/Badges';
import { NutrientBar } from '@/ui/molecules/NutrientBar';

/** 1b hero: 96 px remaining kcal (count-up), "kcal left to fuel of {budget}", the 22 px bar and eaten / burned / band. */
export function CalorieHero({ t, onDetails }: { t: TodayResponse; onDetails: () => void }) {
  const over = t.remainingKcal < 0;
  const left = Math.abs(t.remainingKcal);
  const pct = t.budgetKcal > 0 ? t.eaten.kcal / t.budgetKcal : 0;
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <div className="font-heading text-[96px] leading-[0.9] tracking-[-0.03em] tabular" aria-hidden>
          <AnimatedNumber value={left} />
        </div>
        <div className="text-[18px] font-bold" aria-hidden>
          {over ? 'kcal past today’s budget' : 'kcal left to fuel'} <span className="font-normal text-neutral-700">of {fmt(t.budgetKcal)}</span>
        </div>
        <span className="sr-only" role="status">
          {fmt(left)} kcal {over ? 'past' : 'left of'} your {fmt(t.budgetKcal)} kcal budget
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onDetails} aria-label={`Calories: ${fmt(t.eaten.kcal)} eaten of ${fmt(t.budgetKcal)}, ${Math.round(pct * 100)} percent, ${t.bands.kcal.label}. Show details`} className="rounded-full">
          <Bar value={pct} height={22} className="bg-neutral-300" fillClassName="bg-accent" pulseKey={Math.round(t.eaten.kcal)} />
        </button>
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span>
            <b className="tabular">
              <AnimatedNumber value={t.eaten.kcal} />
            </b>{' '}
            eaten
          </span>
          <span>
            <b className="tabular">
              +<AnimatedNumber value={t.burned} />
            </b>{' '}
            burned
          </span>
          <BandPill band={t.bands.kcal} className="py-0.5" />
        </div>
      </div>
    </div>
  );
}

const MACROS: { key: Exclude<Nutrient, 'kcal'>; label: string }[] = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
  { key: 'fibre', label: 'Fibre' },
];

/** Four macro tiles (APP-HOME-11); tapping one opens its detail sheet. */
export function MacroTiles({ t, onOpen }: { t: TodayResponse; onOpen: (n: Nutrient) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {MACROS.map((m) => (
        <NutrientBar key={m.key} compact label={m.label} eaten={t.eaten[m.key]} target={t.targets[m.key]} band={t.bands[m.key]} pulseKey={Math.round(t.eaten[m.key])} onClick={() => onOpen(m.key)} />
      ))}
    </div>
  );
}
