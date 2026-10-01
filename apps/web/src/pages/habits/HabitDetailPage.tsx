import { useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { HabitCellState, HabitDto, HabitKind } from '@clubhouse/contracts';
import { toast, useOnline } from '@clubhouse/ui';
import { useHabitDetail, useHabitPref } from '@/features/habits';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { HabitChip } from '@/ui/organisms/habits/HabitPieces';
import { TimeInput } from '@/ui/organisms/settings/Kit';
import { dayMonth } from '@/ui/organisms/today/dates';
import { useListMotion } from '@/ui/organisms/today/motion';

const KIND: Record<HabitKind, string> = { check: 'Tick', count: 'Count', duration: 'Minutes', scale: '1–5 rating' };

function targetLine(h: HabitDto): string {
  if (h.kind === 'count') return `${h.target} ${h.unit} a day`;
  if (h.kind === 'duration') return `${h.target} min a day`;
  if (h.kind === 'scale') return 'Rate 1 to 5';
  return h.schedule.type === 'weekly' ? `${h.schedule.perWeek} ticks a week` : 'Tick when done';
}

/** Dot styles (design CS): done filled, missed ring, not scheduled small, today outlined. */
const CELL: Record<HabitCellState, { bg: string; border: string; scale: number; label: string }> = {
  done: { bg: 'var(--color-accent)', border: 'var(--color-accent)', scale: 1, label: 'done' },
  miss: { bg: 'transparent', border: 'var(--color-neutral-400)', scale: 1, label: 'missed' },
  off: { bg: 'var(--color-neutral-300)', border: 'transparent', scale: 0.4, label: 'not scheduled' },
  today: { bg: 'transparent', border: 'var(--color-text)', scale: 1, label: 'today, not yet' },
  future: { bg: 'transparent', border: 'transparent', scale: 1, label: '' },
};

/** Habit detail: streaks, five weeks of dots, the admin's how-to, the member's reminder, and hide (optional only). */
export function HabitDetailPage() {
  const { habitId } = useParams({ from: '/shell/habits/$habitId' });
  const router = useRouter();
  const navigate = useNavigate();
  const online = useOnline();
  const q = useHabitDetail(habitId);
  const pref = useHabitPref();
  const [remOpen, setRemOpen] = useState(false);
  const m = useListMotion(0.04);
  const back = () => (window.history.length > 1 ? router.history.back() : void navigate({ to: '/habits', search: {} }));

  const d = q.data;
  const h = d?.habit;
  const hide = () => {
    if (!h) return;
    pref.mutate(
      { id: h.id, patch: { hidden: true } },
      {
        onSuccess: () => {
          toast.show(`${h.name} hidden`, { action: { label: 'Undo', onClick: () => pref.mutate({ id: h.id, patch: { hidden: false } }) } });
          void navigate({ to: '/habits', search: {}, replace: true });
        },
      },
    );
  };
  const setReminder = (patch: { reminderTime?: string | null; reminderOff?: boolean }, msg: string) => pref.mutate({ id: habitId, patch }, { onSuccess: () => toast.show(msg) });

  return (
    <div className="flex flex-col gap-4 px-5 pb-10 pt-2">
      <StackHeader title={h ? <span className="font-body text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">{`${h.group} · ${KIND[h.kind]}`}</span> : ''} onBack={back} />

      {!d && q.isPending && (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading habit">
          <Skeleton h={64} r={32} w={240} />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton h={84} r={26} />
            <Skeleton h={84} r={26} />
            <Skeleton h={84} r={26} />
          </div>
          <Skeleton h={300} r={30} />
        </div>
      )}
      {!d && q.isError && (
        <EmptyState
          illustration="rings"
          title={online ? 'Couldn’t load this habit' : 'You’re offline'}
          body={online ? 'It may have been switched off by your admin.' : 'It loads when you’re back online.'}
          action={
            <Button variant="dark" onClick={() => void navigate({ to: '/habits', search: {} })}>
              Back to habits
            </Button>
          }
        />
      )}

      {d && h && (
        <motion.div variants={m.container} initial="hidden" animate="show" className="flex flex-col gap-4">
          <motion.div variants={m.item} className="flex items-center gap-3.5">
            <HabitChip icon={h.icon} group={h.group} size={64} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="font-heading text-[30px] leading-[1.05]">{h.name}</h2>
              <span className="text-[13px] text-neutral-700">
                {h.scheduleLabel} · {targetLine(h)}
              </span>
            </div>
          </motion.div>

          <motion.div variants={m.item} className="grid grid-cols-3 gap-2">
            <Stat label="Current" value={String(d.current)} accent />
            <Stat label="Best" value={String(Math.max(d.best, d.current))} />
            <Stat label="14 days" value={d.adherence14 == null ? '—' : `${d.adherence14}%`} />
          </motion.div>

          <motion.section variants={m.item} aria-label="Last 5 weeks" className="flex flex-col gap-2.5 rounded-[30px] bg-surface p-4">
            <div className="flex justify-between text-[13px]">
              <span className="font-bold">Last 5 weeks</span>
              <span className="text-neutral-700">{h.schedule.type === 'weekly' ? 'weeks count, not days' : h.schedule.type === 'days' ? 'scheduled days only' : 'every day'}</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
                <span key={i} aria-hidden className="text-center text-[11px] font-bold text-neutral-700">
                  {w}
                </span>
              ))}
              {d.cells.map((c) => {
                const s = CELL[c.state];
                return (
                  <span
                    key={c.date}
                    title={s.label ? `${dayMonth(c.date)}: ${s.label}` : undefined}
                    aria-label={s.label ? `${dayMonth(c.date)}: ${s.label}` : undefined}
                    role={s.label ? 'img' : undefined}
                    className="aspect-square rounded-full border-2"
                    style={{ background: s.bg, borderColor: s.border, transform: `scale(${s.scale})` }}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-neutral-700">
              <span>● done</span>
              <span>○ missed</span>
              <span>· not scheduled</span>
            </div>
          </motion.section>

          {h.note && (
            <motion.div variants={m.item} className="flex flex-col gap-1 rounded-[28px] bg-accent-2-200 px-4 py-3.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent-2-800">How to{h.setBy ? ` · from ${h.setBy}` : ''}</span>
              <span className="text-[15px] leading-normal text-accent-2-900">{h.note}</span>
            </motion.div>
          )}

          <motion.button variants={m.item} type="button" whileTap={{ scale: 0.98 }} onClick={() => setRemOpen(true)} className="flex min-h-16 w-full items-center gap-3 rounded-[28px] bg-surface py-3 pl-[18px] pr-3 text-left">
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-bold">Reminder</span>
              <span className="text-[12px] text-neutral-700">{h.defaultReminderTime ? `Admin default ${h.defaultReminderTime}` : 'No admin default'} · skipped if already done</span>
            </span>
            <span className="grid min-h-10 place-items-center rounded-full bg-accent-200 px-4 text-[14px] font-extrabold text-accent-800">{h.reminderOff || !h.reminderTime ? 'Off' : h.reminderTime}</span>
          </motion.button>

          {h.required ? (
            <motion.p variants={m.item} className="m-0 px-1.5 text-[12px] text-neutral-700">
              Required{h.setBy ? ` by ${h.setBy}` : ''}, so it counts toward your habits streak and can’t be hidden.
            </motion.p>
          ) : (
            <motion.div variants={m.item}>
              <Button variant="secondary" block onClick={hide} loading={pref.isPending && pref.variables?.patch.hidden === true}>
                Hide from my list
              </Button>
            </motion.div>
          )}
        </motion.div>
      )}

      {h && (
        <MemberSheet open={remOpen} onClose={() => setRemOpen(false)} title="Reminder">
          <ReminderOptions
            habit={h}
            onPick={(patch, msg) => {
              setRemOpen(false);
              setReminder(patch, msg);
            }}
          />
        </MemberSheet>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn('flex flex-col rounded-[26px] p-3.5', accent ? 'bg-accent text-on-accent' : 'bg-surface')}>
      <span className={cn('text-[12px] font-bold', accent ? 'text-on-accent-sub' : 'text-neutral-700')}>{label}</span>
      <span className="font-heading text-[30px] leading-tight tabular">{value}</span>
    </div>
  );
}

function ReminderOptions({ habit, onPick }: { habit: HabitDto; onPick: (patch: { reminderTime?: string | null; reminderOff?: boolean }, msg: string) => void }) {
  const usingDefault = !habit.reminderOff && habit.reminderTime === habit.defaultReminderTime;
  const [custom, setCustom] = useState(habit.reminderTime ?? habit.defaultReminderTime ?? '21:00');
  const row = (on: boolean, title: string, sub: string, run: () => void) => (
    <button type="button" onClick={run} className="flex min-h-14 w-full items-center gap-3 rounded-[22px] bg-surface px-4 py-3 text-left">
      <span className="flex flex-1 flex-col">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-[12px] text-neutral-700">{sub}</span>
      </span>
      {on && <Check className="h-5 w-5 text-accent-700" strokeWidth={3} aria-label="Selected" />}
    </button>
  );
  return (
    <>
      {habit.defaultReminderTime && row(usingDefault, `Admin default · ${habit.defaultReminderTime}`, 'Bundled with other habits at the same time', () => onPick({ reminderTime: null, reminderOff: false }, `${habit.name} reminder · ${habit.defaultReminderTime}`))}
      <div className="flex min-h-14 items-center gap-3 rounded-[22px] bg-surface px-4 py-3">
        <span className="flex flex-1 flex-col">
          <span className="text-[15px] font-bold">My own time</span>
          <span className="text-[12px] text-neutral-700">Only for you</span>
        </span>
        <TimeInput label="Reminder time" value={custom} onChange={setCustom} />
        <Button size="sm" variant="dark" onClick={() => onPick({ reminderTime: custom, reminderOff: false }, `${habit.name} reminder · ${custom}`)}>
          Set
        </Button>
      </div>
      {row(habit.reminderOff || !habit.reminderTime, 'Off', 'No reminder for this habit', () => onPick({ reminderOff: true }, `${habit.name} reminder off`))}
    </>
  );
}
