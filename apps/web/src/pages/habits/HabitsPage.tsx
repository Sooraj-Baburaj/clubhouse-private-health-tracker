import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { ArrowUpDown } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { addDays, habitTapValue, isHabitComplete } from '@clubhouse/domain';
import { toast, useOnline } from '@clubhouse/ui';
import type { HabitDayItem } from '@clubhouse/contracts';
import { useHabitDay, useHabitPref, useSetMyHabitOrder, useTickHabit } from '@/features/habits';
import { useMeData } from '@/features/me';
import { memberNow } from '@/features/summary';
import { uuid } from '@/lib/ids';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { Segmented } from '@/ui/atoms/Segmented';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { ArrangeHabits } from '@/ui/organisms/habits/ArrangeHabits';
import { HabitTile, nextLine } from '@/ui/organisms/habits/HabitPieces';
import { shortDay } from '@/ui/organisms/today/dates';
import { useListMotion } from '@/ui/organisms/today/motion';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayChip = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
};

/** Habits 4b "Tap tiles": today's checklist as a fixed 2-column grid, with yesterday open for fixing. */
export function HabitsPage() {
  const me = useMeData();
  const router = useRouter();
  const navigate = useNavigate();
  const online = useOnline();
  const search = useSearch({ from: '/shell/habits' });
  const today = memberNow(me).date;
  const yesterday = addDays(today, -1);
  const date = search.day === 'yesterday' ? yesterday : undefined;
  const day = date ?? today;
  const q = useHabitDay(date);
  const tick = useTickHabit(date);
  const pref = useHabitPref();
  const order = useSetMyHabitOrder();
  const [arranging, setArranging] = useState(false);
  const m = useListMotion(0.03);
  const back = () => (window.history.length > 1 ? router.history.back() : void navigate({ to: '/', search: {} }));
  const setDay = (v: 'today' | 'yesterday') => void navigate({ to: '/habits', search: v === 'today' ? {} : { day: v }, replace: true });

  const d = q.data;
  const tap = (item: HabitDayItem) => {
    if (!d?.editable) return;
    const value = habitTapValue(item.kind, item.value, item.target);
    const nowDone = isHabitComplete(item.kind, value, item.target);
    tick.mutate({ item, value, day, id: item.checkinId ?? uuid() });
    if (!item.done && nowDone) {
      const left = d.total - d.done - 1;
      toast.show(left > 0 ? `${item.name} done · ${left} to go` : date ? 'Yesterday fixed · marked added later' : 'All done today. Nice.');
    }
  };

  return (
    <div className="flex flex-col gap-4 px-5 pb-10 pt-2">
      <StackHeader
        title="Habits"
        onBack={back}
        right={
          d && d.streak.current > 0 ? (
            <button type="button" onClick={() => void navigate({ to: '/momentum' })} className="min-h-10 shrink-0 rounded-full bg-accent-2-200 px-3.5 text-[14px] font-extrabold text-accent-2-800">
              {d.streak.current}-day streak
            </button>
          ) : undefined
        }
      />

      {!d && q.isPending && (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading habits">
          <Skeleton h={88} w={160} r={20} />
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} h={148} r={30} />
            ))}
          </div>
        </div>
      )}
      {!d && q.isError && (
        <EmptyState
          illustration="rings"
          title={online ? 'Couldn’t load your habits' : 'You’re offline'}
          body={online ? 'Give it another go in a moment.' : 'This day isn’t saved on your phone yet. It loads when you’re back online.'}
          action={
            <Button variant="dark" onClick={() => void q.refetch()} loading={q.isFetching}>
              Try again
            </Button>
          }
        />
      )}

      {d && (
        <motion.div key={day} variants={m.container} initial="hidden" animate="show" className="flex flex-col gap-4">
          <motion.div variants={m.item} className="flex flex-col gap-1.5">
            <div className="font-heading text-[80px] leading-[0.9] tracking-[-0.02em] tabular" aria-label={`${d.done} of ${d.total} done`}>
              {d.done}
              <span className="text-neutral-500">/{d.total}</span>
            </div>
            <div className="text-[15px] font-bold">{nextLine(d.items)}</div>
          </motion.div>

          <motion.div variants={m.item} className="flex items-center justify-between gap-3">
            <Segmented
              label="Day"
              size="sm"
              className="border-0 bg-surface p-1"
              value={date ? 'yesterday' : 'today'}
              onChange={setDay}
              options={[
                { value: 'yesterday', label: dayChip(yesterday) },
                { value: 'today', label: 'Today' },
              ]}
            />
            {!date && !arranging && d.arrangement.length > 1 && (
              <Button size="sm" variant="ghost" icon={<ArrowUpDown className="h-4 w-4" strokeWidth={2.75} />} onClick={() => setArranging(true)}>
                Arrange
              </Button>
            )}
          </motion.div>

          {date && (
            <motion.div variants={m.item} className="rounded-[22px] bg-accent-200 px-3.5 py-2.5 text-[13px] leading-[1.45] text-accent-800">
              <b>Fixing {shortDay(yesterday)}.</b> Ticks here are marked added later. Open until midnight tonight.
            </motion.div>
          )}

          {arranging && !date ? (
            <motion.div variants={m.item}>
              <ArrangeHabits
                arrangement={d.arrangement}
                customOrder={d.customOrder}
                saving={order.isPending}
                onCancel={() => setArranging(false)}
                onSave={(ids) => order.mutate(ids, { onSuccess: () => setArranging(false) })}
                onReset={() => order.mutate(null, { onSuccess: () => setArranging(false) })}
              />
            </motion.div>
          ) : d.items.length ? (
            <motion.div variants={m.item} className="grid grid-cols-2 gap-2.5">
              {d.items.map((item) => (
                <HabitTile key={item.id} item={item} disabled={!d.editable} onTap={() => tap(item)} onInfo={() => void navigate({ to: '/habits/$habitId', params: { habitId: item.id } })} />
              ))}
            </motion.div>
          ) : (
            <motion.div variants={m.item}>
              <EmptyState
                illustration="rings"
                title={d.hidden.length ? 'Nothing left on your list' : date ? 'Nothing was due' : 'No habits yet'}
                body={date ? 'No habits were due that day.' : 'When your admin adds habits for you, they show up here as tiles you tick with one tap.'}
              />
            </motion.div>
          )}

          {d.items.length > 0 && !arranging && (
            <motion.p variants={m.item} className="m-0 px-1.5 text-[12px] leading-normal text-neutral-700">
              Tap a tile to tick, add a glass or add 10 minutes. Tiles stay where they are, so your thumb learns the grid
              {d.customOrder ? ', in the order you arranged.' : '.'}
              {d.items[0]?.setBy ? ` Set by ${d.items[0].setBy}. Teammates only see how many you kept, never which ones.` : ' Teammates only see how many you kept, never which ones.'}
            </motion.p>
          )}

          {d.hidden.length > 0 && (
            <motion.div variants={m.item}>
              <ListGroup title="Hidden by you">
                {d.hidden.map((h) => (
                  <ListRow
                    key={h.id}
                    title={`${h.icon} ${h.name}`}
                    sub="Optional, so it’s off your list"
                    right={
                      <Button size="sm" variant="secondary" loading={pref.isPending && pref.variables?.id === h.id} onClick={() => pref.mutate({ id: h.id, patch: { hidden: false } }, { onSuccess: () => toast.show(`${h.name} is back on your list`) })}>
                        Show
                      </Button>
                    }
                  />
                ))}
              </ListGroup>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
