import { motion } from 'motion/react';
import type { Nutrient, TodayResponse } from '@clubhouse/contracts';
import { fmt, SLOT_LABEL } from '@/features/format';
import { BandPill } from '@/ui/atoms/Badges';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { NutrientBar } from '@/ui/molecules/NutrientBar';
import { useListMotion } from './motion';

const LABEL: Record<Nutrient, string> = { kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fibre: 'Fibre' };

/** Numbers behind a macro tile or the calorie bar, plus which meals contributed (APP-HOME-12). */
export function NutrientSheet({ t, nutrient, onClose }: { t: TodayResponse; nutrient: Nutrient | null; onClose: () => void }) {
  const m = useListMotion();
  const n = nutrient ?? 'kcal';
  const unit = n === 'kcal' ? 'kcal' : 'g';
  const eaten = t.eaten[n];
  const target = n === 'kcal' ? t.budgetKcal : t.targets[n];
  const gap = target - eaten;
  const meals = t.foodLogs
    .filter((f) => f.totals[n] > 0)
    .sort((a, b) => b.totals[n] - a.totals[n])
    .map((f) => ({ id: f.id, slot: SLOT_LABEL[f.mealSlot], name: f.items.map((i) => i.name).join(', '), value: f.totals[n] }));
  return (
    <MemberSheet open={!!nutrient} onClose={onClose} title={LABEL[n]}>
      <div className="flex items-end justify-between gap-3">
        <div className="font-heading text-[46px] leading-none tabular">
          {fmt(eaten)}
          <span className="font-body text-[16px] text-neutral-700">
            {' '}
            / {fmt(target)} {unit}
          </span>
        </div>
        <BandPill band={t.bands[n]} />
      </div>
      <NutrientBar label={LABEL[n]} eaten={eaten} target={target} unit={unit} band={t.bands[n]} />
      <p className="m-0 text-[14px] text-neutral-700">
        {gap >= 0 ? `${fmt(gap)} ${unit} to go${n === 'kcal' && t.burned ? `, including ${fmt(t.burned)} kcal you burned` : ''}.` : `${fmt(-gap)} ${unit} past the target — no stress, tomorrow resets.`}
      </p>
      <h3 className="mt-2 font-heading text-[18px]">Where it came from</h3>
      {meals.length ? (
        <motion.ul variants={m.container} initial="hidden" animate="show" className="m-0 flex list-none flex-col p-0">
          {meals.map((x) => (
            <motion.li key={x.id} variants={m.item} className="flex items-center gap-3 border-b border-divider py-2.5 text-[14px] last:border-0">
              <span className="w-[92px] shrink-0 text-[12px] text-neutral-700">{x.slot}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{x.name}</span>
              <span className="font-bold tabular">
                {fmt(x.value)} {unit}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      ) : (
        <p className="m-0 text-[14px] text-neutral-700">Nothing logged yet adds {LABEL[n].toLowerCase()}. Your next meal will show up here.</p>
      )}
    </MemberSheet>
  );
}
