import { MEAL_SLOTS, type MealSlot } from '@clubhouse/contracts';
import { Chip, ChipRow } from '@/ui/atoms/Chip';

/** Meal slot chips, pre-selected by the time of day (APP-HOME-24). */
export function SlotChips({ value, onChange, labels }: { value: MealSlot; onChange: (s: MealSlot) => void; labels: Record<MealSlot, string> }) {
  return (
    <ChipRow label="Meal">
      {MEAL_SLOTS.map((s) => (
        <Chip key={s} selected={value === s} onClick={() => onChange(s)}>
          {labels[s]}
        </Chip>
      ))}
    </ChipRow>
  );
}
