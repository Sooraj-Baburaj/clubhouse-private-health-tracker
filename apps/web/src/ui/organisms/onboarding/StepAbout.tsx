import { motion } from 'motion/react';
import { useId, useMemo } from 'react';
import { ACTIVITY_LEVELS, type ActivityLevel, type Sex } from '@clubhouse/contracts';
import { ACTIVITY_LEVEL_LABELS, addDays } from '@clubhouse/domain';
import { timezoneList } from '@/features/onboarding';
import { cn } from '@/lib/cn';
import { Chip } from '@/ui/atoms/Chip';
import { TextField } from '@/ui/atoms/Field';
import { Segmented } from '@/ui/atoms/Segmented';
import { switchUnits, type AboutDraft, type AboutErrors } from './model';

const SEXES: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

function FieldLabel({ children, id }: { children: string; id?: string }) {
  return (
    <div id={id} className="text-[13px] text-neutral-700">
      {children}
    </div>
  );
}

function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <div className="px-2 text-[13px] font-semibold text-band-red-fg">{children}</div>;
}

/** Step 1 "About you": units, height, weight, date of birth, sex, activity level and timezone. */
export function StepAbout({ value, onChange, errors, today }: { value: AboutDraft; onChange: (d: AboutDraft) => void; errors: AboutErrors; today: string }) {
  const set = (patch: Partial<AboutDraft>) => onChange({ ...value, ...patch });
  const imperial = value.units === 'imperial';
  const zones = useMemo(() => timezoneList(), []);
  const tzListId = useId();
  const sexId = useId();
  const levelId = useId();
  const numeric = { inputMode: 'decimal' as const, type: 'text' };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <FieldLabel>Units</FieldLabel>
        <Segmented
          label="Units"
          value={value.units}
          onChange={(u) => onChange(switchUnits(value, u))}
          options={[
            { value: 'metric', label: 'Metric' },
            { value: 'imperial', label: 'Imperial' },
          ]}
          className="self-start"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {imperial ? (
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <TextField label="Height (ft)" {...numeric} value={value.ft} onChange={(e) => set({ ft: e.target.value })} suffix={<span className="text-neutral-700">ft</span>} error={errors.height} />
            <TextField label="and inches" {...numeric} value={value.inch} onChange={(e) => set({ inch: e.target.value })} suffix={<span className="text-neutral-700">in</span>} />
          </div>
        ) : (
          <TextField label="Height" {...numeric} value={value.cm} onChange={(e) => set({ cm: e.target.value })} suffix={<span className="text-neutral-700">cm</span>} error={errors.height} autoComplete="off" />
        )}
        <TextField label="Weight" {...numeric} value={value.weight} onChange={(e) => set({ weight: e.target.value })} suffix={<span className="text-neutral-700">{imperial ? 'lb' : 'kg'}</span>} error={errors.weight} className={imperial ? 'col-span-2' : undefined} />
      </div>

      <TextField label="Date of birth" type="date" value={value.dob} max={addDays(today, -13 * 365)} min="1910-01-01" onChange={(e) => set({ dob: e.target.value })} error={errors.dob} autoComplete="bday" />

      <div className="flex flex-col gap-2">
        <FieldLabel id={sexId}>Sex (for the calorie formula)</FieldLabel>
        <div role="radiogroup" aria-labelledby={sexId} className="flex flex-wrap gap-2">
          {SEXES.map((s) => (
            <Chip key={s.value} selected={value.sex === s.value} onClick={() => set({ sex: s.value })} className="min-h-11 px-4">
              {s.label}
            </Chip>
          ))}
        </div>
        <ErrorText>{errors.sex}</ErrorText>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel id={levelId}>How active is a normal week?</FieldLabel>
        <div role="radiogroup" aria-labelledby={levelId} className="flex flex-col gap-2">
          {ACTIVITY_LEVELS.map((lvl: ActivityLevel) => {
            const on = value.activityLevel === lvl;
            return (
              <motion.button
                key={lvl}
                type="button"
                role="radio"
                aria-checked={on}
                whileTap={{ scale: 0.98 }}
                onClick={() => set({ activityLevel: lvl })}
                className={cn('flex min-h-14 flex-col rounded-[24px] border-2 px-[18px] py-3 text-left transition-colors', on ? 'border-accent bg-accent-200' : 'border-transparent bg-surface')}
              >
                <span className="font-heading text-[17px] leading-tight">{ACTIVITY_LEVEL_LABELS[lvl].label}</span>
                <span className="text-[13px] text-neutral-700">{ACTIVITY_LEVEL_LABELS[lvl].hint}</span>
              </motion.button>
            );
          })}
        </div>
        <ErrorText>{errors.activityLevel}</ErrorText>
      </div>

      <TextField label="Timezone" list={tzListId} value={value.timezone} onChange={(e) => set({ timezone: e.target.value })} error={errors.timezone} hint="Taken from this phone. Reminders and your day follow it." autoComplete="off" autoCapitalize="none" />
      <datalist id={tzListId}>
        {zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
    </div>
  );
}
