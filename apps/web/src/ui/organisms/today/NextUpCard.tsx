import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { ApiError, NetworkError } from '@clubhouse/client';
import type { TodayResponse } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { dietOptionUpsert, foodLogToUpsert, optimisticFoodLog, useLogDietOption } from '@/features/food';
import { fmt } from '@/features/format';
import { useSaveFoodLog } from '@/features/logs';
import { uuid } from '@/lib/ids';

type NextUp = NonNullable<TodayResponse['nextUp']>;

/** "Next up" accent card: the best-fitting plan option for the next slot, logged in one tap with undo. */
export function NextUpCard({ next, date }: { next: NextUp; date: string }) {
  const logOption = useLogDietOption();
  const saveFood = useSaveFoodLog();
  const option = next.option;

  if (!option) {
    return (
      <Link to="/diet" search={{ slot: next.slot }} className="flex min-h-14 items-center gap-3 rounded-[28px] bg-accent-200 px-5 py-4 text-accent-900 no-underline">
        <span className="flex-1 font-heading text-[18px]">Next: {next.slotLabel.toLowerCase()} options</span>
        <ChevronRight className="h-5 w-5" strokeWidth={2.75} aria-hidden />
      </Link>
    );
  }

  const undoDelete = (id: string, entity: ReturnType<typeof optimisticFoodLog>) =>
    saveFood.mutate({ id, data: foodLogToUpsert(entity, { deleted: true }), optimistic: { ...entity, deleted: true } });

  const logIt = () =>
    logOption.mutate(
      { optionId: option.id, date, slot: next.slot },
      {
        onSuccess: (entity) => toast.success(`${next.slotLabel} logged · ${fmt(option.nutrition.kcal)} kcal`, { action: { label: 'Undo', onClick: () => undoDelete(entity.id, entity) } }),
        onError: (e) => {
          if (e instanceof NetworkError || (e instanceof ApiError && e.status >= 500)) {
            const id = uuid();
            const data = dietOptionUpsert(option, date, next.slot);
            const optimistic = optimisticFoodLog(id, data);
            saveFood.mutate({ id, data, optimistic }, { onSuccess: () => toast.show(`${next.slotLabel} saved on your phone`, { action: { label: 'Undo', onClick: () => undoDelete(id, optimistic) } }) });
          } else toast.error(e instanceof ApiError ? e.message : 'Couldn’t log that option.');
        },
      },
    );

  return (
    <motion.div layout className="flex flex-col gap-2.5 rounded-[32px] bg-accent px-5 py-[18px] text-on-accent-fill">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-on-accent-sub">Next up · {next.slotLabel} from your plan</div>
      <div className="font-heading text-[26px] leading-[1.1] text-on-accent">{option.name}</div>
      <div className="flex items-center gap-2.5">
        <span className="flex-1 font-bold text-on-accent-sub tabular">
          {fmt(option.nutrition.kcal)} kcal{next.afterKcal != null ? ` · leaves ${fmt(next.afterKcal)}` : ''}
        </span>
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={logIt}
          disabled={logOption.isPending}
          aria-label={`Log ${option.name} for ${next.slotLabel}`}
          className="min-h-11 rounded-full bg-text px-[18px] font-heading text-[15px] text-bg disabled:opacity-60"
        >
          {logOption.isPending ? 'Logging…' : 'Log it'}
        </motion.button>
      </div>
    </motion.div>
  );
}
