import { useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { TodayResponse } from '@clubhouse/contracts';
import { displayWeight, kgToLb, lbToKg } from '@clubhouse/domain';
import { toast } from '@clubhouse/ui';
import { useUi } from '@/app/uiStore';
import { fmt1 } from '@/features/format';
import { qk } from '@/features/keys';
import { useSaveWeight } from '@/features/logs';
import { useMeData } from '@/features/me';
import { memberNow } from '@/features/summary';
import { nowIso, uuid } from '@/lib/ids';
import { Button } from '@/ui/atoms/Button';
import { TextField } from '@/ui/atoms/Field';
import { MemberSheet } from '@/ui/molecules/MemberSheet';

const MIN_KG = 25;
const MAX_KG = 350;

/** APP-HOME-32: one field prefilled with the last weight, in the member's units, an optional note, save. */
export function WeightSheet() {
  const open = useUi((s) => s.weightSheet);
  const close = useUi((s) => s.closeWeightSheet);
  const me = useMeData();
  const qc = useQueryClient();
  const save = useSaveWeight();
  const imperial = me.profile.units === 'imperial';
  const unit = imperial ? 'lb' : 'kg';
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [latestKg, setLatestKg] = useState<number | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  // Prefill on open, and again if the profile weight or units change while open (adjust state during render).
  const prefillKey = open ? `${me.profile.weightKg}|${imperial}` : null;
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (prefillKey !== prefilledFor) {
    setPrefilledFor(prefillKey);
    if (open) {
      const t = qc.getQueryData<TodayResponse>(qk.today(undefined));
      const kg = t?.weight && !t.weight.deleted ? t.weight.weightKg : (t?.latestWeightKg ?? me.profile.weightKg);
      setLatestKg(kg ?? null);
      setExistingId(t?.weight && !t.weight.deleted ? t.weight.id : null);
      setValue(kg ? fmt1(imperial ? kgToLb(kg) : kg).replace(/,/g, '') : '');
      setNote(t?.weight?.note ?? '');
      setError(null);
    }
  }

  const num = Number(value.replace(',', '.'));
  const kg = Number.isFinite(num) && value.trim() ? (imperial ? lbToKg(num) : num) : null;
  const nudge = (d: number) => {
    const base = Number.isFinite(num) && value.trim() ? num : imperial ? 150 : 70;
    setValue(String(Math.round((base + d) * 10) / 10));
    setError(null);
  };

  const submit = () => {
    if (kg == null || kg < MIN_KG || kg > MAX_KG) {
      setError(imperial ? 'Use a weight between 55 and 770 lb.' : 'Use a weight between 25 and 350 kg.');
      return;
    }
    const weightKg = Math.round(kg * 10) / 10;
    save.mutate(
      { id: existingId ?? uuid(), data: { date: memberNow(me).date, weightKg, note: note.trim() || null, clientUpdatedAt: nowIso() } },
      {
        onSuccess: (r) => {
          if (!r.queued) toast.success(`Weight logged · ${displayWeight(weightKg, me.profile.units)}`);
          close();
        },
      },
    );
  };

  const delta = kg != null && latestKg != null && !existingId ? kg - latestKg : null;

  return (
    <MemberSheet open={open} onClose={close} title="Log weight">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-center justify-center gap-4 rounded-[32px] bg-surface px-4 py-5">
          <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => nudge(-0.1)} aria-label={`0.1 ${unit} less`} className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full border border-divider">
            <Minus className="h-5 w-5" strokeWidth={3} />
          </motion.button>
          <label className="flex items-baseline gap-1">
            <span className="sr-only">Weight in {unit}</span>
            <input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              inputMode="decimal"
              autoFocus
              aria-invalid={!!error}
              className="w-[4.2ch] border-0 bg-transparent text-center font-heading text-[56px] leading-none text-text outline-none tabular"
            />
            <span className="text-[16px] text-neutral-700">{unit}</span>
          </label>
          <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => nudge(0.1)} aria-label={`0.1 ${unit} more`} className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-accent text-on-accent-fill">
            <Plus className="h-5 w-5" strokeWidth={3} />
          </motion.button>
        </div>
        {error ? (
          <p role="alert" className="m-0 px-2 text-[13px] font-semibold text-band-red-fg">
            {error}
          </p>
        ) : (
          <p className="m-0 px-2 text-center text-[13px] text-neutral-700">
            {existingId ? 'Updating today’s weigh-in.' : delta != null && Math.abs(delta) >= 0.05 ? `${delta > 0 ? '+' : '−'}${fmt1(Math.abs(imperial ? kgToLb(delta) : delta))} ${unit} since last time. Trends matter more than any one day.` : 'Same time of day each time keeps the trend honest.'}
          </p>
        )}
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} placeholder="After a run, new scale…" />
        <Button type="submit" size="lg" block loading={save.isPending}>
          Save weight
        </Button>
      </form>
    </MemberSheet>
  );
}
