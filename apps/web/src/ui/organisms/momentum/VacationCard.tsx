import { Palmtree } from 'lucide-react';
import { useState } from 'react';
import type { MomentumResponse } from '@clubhouse/contracts';
import { addDays, daysBetween } from '@clubhouse/domain';
import { toast } from '@clubhouse/ui';
import { useEndVacation, useSetVacation } from '@/features/momentum';
import { Button } from '@/ui/atoms/Button';
import { TextField } from '@/ui/atoms/Field';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { dayMonth } from '@/ui/organisms/today/dates';

type Vacation = MomentumResponse['vacation'];

/** Vacation status with "Take a break" (date range sheet) or "End vacation", and the quarter's quota. */
export function VacationCard({ v, today }: { v: Vacation; today: string }) {
  const [open, setOpen] = useState(false);
  const end = useEndVacation();
  return (
    <div className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-2-200 text-accent-2-800">
          <Palmtree className="h-5 w-5" strokeWidth={2.75} aria-hidden />
        </span>
        <div className="flex flex-1 flex-col">
          <span className="font-heading text-[18px] leading-tight">{v.active ? `On a break${v.until ? ` until ${dayMonth(v.until)}` : ''}` : 'Going away?'}</span>
          <span className="text-[13px] text-neutral-700">
            {v.active ? 'Your streaks are frozen, not broken. Log anything and they pick up.' : 'Take a break and your streaks freeze while you’re gone.'} {v.daysLeftThisQuarter} of {v.quota} days left this quarter.
          </span>
        </div>
      </div>
      {v.active ? (
        <Button variant="secondary" onClick={() => end.mutate()} loading={end.isPending}>
          End vacation
        </Button>
      ) : (
        <Button variant="dark" onClick={() => setOpen(true)} disabled={v.daysLeftThisQuarter <= 0}>
          {v.daysLeftThisQuarter > 0 ? 'Take a break' : 'No break days left this quarter'}
        </Button>
      )}
      <VacationSheet open={open} onClose={() => setOpen(false)} today={today} daysLeft={v.daysLeftThisQuarter} />
    </div>
  );
}

function VacationSheet({ open, onClose, today, daysLeft }: { open: boolean; onClose: () => void; today: string; daysLeft: number }) {
  const set = useSetVacation();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));
  const [error, setError] = useState<string | null>(null);
  // Fresh range on open, or if today / the quota change while open (adjust state during render).
  const resetKey = open ? `${today}|${daysLeft}` : null;
  const [resetFor, setResetFor] = useState<string | null>(null);
  if (resetKey !== resetFor) {
    setResetFor(resetKey);
    if (open) {
      setFrom(today);
      setTo(addDays(today, Math.min(6, Math.max(0, daysLeft - 1))));
      setError(null);
    }
  }
  const len = from && to ? daysBetween(from, to) + 1 : 0;
  const submit = () => {
    if (!from || !to || to < from) return setError('The last day needs to be on or after the first.');
    if (from < today) return setError('Breaks start today or later.');
    if (len > daysLeft) return setError(`That’s ${len} days — you have ${daysLeft} left this quarter.`);
    set.mutate(
      { from, to },
      {
        onSuccess: () => {
          toast.success(`Enjoy the break — back on ${dayMonth(addDays(to, 1))}`);
          onClose();
        },
      },
    );
  };
  return (
    <MemberSheet open={open} onClose={onClose} title="Take a break">
      <p className="m-0 text-[14px] text-neutral-700">Streaks freeze for these days. Reminders go quiet too.</p>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="First day" type="date" min={today} value={from} onChange={(e) => (setFrom(e.target.value), setError(null))} />
        <TextField label="Last day" type="date" min={from || today} value={to} onChange={(e) => (setTo(e.target.value), setError(null))} />
      </div>
      <p className={error ? 'm-0 px-2 text-[13px] font-semibold text-band-red-fg' : 'm-0 px-2 text-[13px] text-neutral-700'} role={error ? 'alert' : undefined}>
        {error ?? `${len > 0 ? len : 0} ${len === 1 ? 'day' : 'days'} · ${Math.max(0, daysLeft - Math.max(0, len))} left after this`}
      </p>
      <Button size="lg" block onClick={submit} loading={set.isPending}>
        Start the break
      </Button>
    </MemberSheet>
  );
}
