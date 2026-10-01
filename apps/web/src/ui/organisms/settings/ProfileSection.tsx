import { Camera, Scale } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { ACTIVITY_LEVELS, type ActivityLevel, type ProfileUpdateRequest, type Sex } from '@clubhouse/contracts';
import { cmToFtIn, ftInToCm, kgToLb } from '@clubhouse/domain';
import { useDebounced } from '@clubhouse/ui';
import { useUi } from '@/app/uiStore';
import { fmt1 } from '@/features/format';
import { useMeData } from '@/features/me';
import { useAvatarUpload, useTargetsPreview, useUpdateProfile } from '@/features/settings';
import { Avatar } from '@/ui/atoms/Avatar';
import { Button } from '@/ui/atoms/Button';
import { Segmented } from '@/ui/atoms/Segmented';
import { ListGroup } from '@/ui/molecules/ListGroup';
import { Divider, FieldRow, initials, inputCls, RadioList } from './Kit';
import { TargetsCard } from './TargetsCard';

export const LEVELS: Record<ActivityLevel, { label: string; sub: string }> = {
  sedentary: { label: 'Mostly sitting', sub: 'Desk job, not much walking' },
  light: { label: 'Lightly active', sub: 'Walks or light exercise 1–3 days a week' },
  moderate: { label: 'Moderately active', sub: 'Exercise 3–5 days a week' },
  active: { label: 'Active', sub: 'Hard exercise 6–7 days a week' },
  very_active: { label: 'Very active', sub: 'Physical job or training twice a day' },
};

function timezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
}

export function ProfileSection() {
  const me = useMeData();
  const p = me.profile;
  const openWeight = useUi((s) => s.openWeightSheet);
  const update = useUpdateProfile();
  const avatar = useAvatarUpload();
  const file = useRef<HTMLInputElement>(null);
  const initial = useMemo(
    () => ({ displayName: me.user.displayName, units: p.units, heightCm: p.heightCm ?? 170, dob: p.dob ?? '', sex: (p.sex ?? 'unspecified') as Sex, activityLevel: (p.activityLevel ?? 'moderate') as ActivityLevel, timezone: p.timezone }),
    [me.user.displayName, p],
  );
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const diff: ProfileUpdateRequest = {};
  (Object.keys(f) as (keyof typeof f)[]).forEach((k) => {
    if (f[k] !== initial[k] && !(k === 'dob' && !f.dob)) (diff as Record<string, unknown>)[k] = k === 'displayName' ? f.displayName.trim() : f[k];
  });
  const dirty = Object.keys(diff).length > 0;
  const affectsTargets = 'heightCm' in diff || 'activityLevel' in diff || 'sex' in diff || 'dob' in diff;
  const previewInput = useDebounced(affectsTargets ? { heightCm: f.heightCm, activityLevel: f.activityLevel, sex: f.sex, ...(f.dob ? { dob: f.dob } : {}) } : null, 350);
  const preview = useTargetsPreview(previewInput);
  const imperial = f.units === 'imperial';
  const ftin = cmToFtIn(f.heightCm);
  const tzs = useMemo(() => timezones(), []);
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nameError = f.displayName.trim().length === 0 ? 'Your name can’t be empty' : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-4 rounded-[28px] bg-surface p-4">
        <Avatar name={me.user.displayName} initials={initials(me.user.displayName)} url={me.user.avatarUrl} size={72} />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-neutral-700">Your photo shows in chat and on the team list.</span>
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const x = e.target.files?.[0];
              e.target.value = '';
              if (x) avatar.mutate(x);
            }}
          />
          <Button size="sm" variant="secondary" className="self-start" loading={avatar.isPending} icon={<Camera className="h-4 w-4" strokeWidth={2.75} />} onClick={() => file.current?.click()}>
            Change photo
          </Button>
        </div>
      </div>

      <ListGroup title="About you">
        <FieldRow label="Name">
          <input className={inputCls} value={f.displayName} maxLength={60} onChange={(e) => set('displayName', e.target.value)} aria-invalid={!!nameError} autoComplete="name" />
          {nameError && <span className="px-2 text-[12px] font-semibold text-band-red-fg">{nameError}</span>}
        </FieldRow>
        <Divider />
        <FieldRow label="Units">
          <Segmented
            label="Units"
            value={f.units}
            onChange={(v) => set('units', v)}
            options={[
              { value: 'metric', label: 'kg · cm' },
              { value: 'imperial', label: 'lb · ft' },
            ]}
          />
        </FieldRow>
        <Divider />
        <FieldRow label="Height">
          {imperial ? (
            <div className="flex gap-2">
              <label className="flex flex-1 items-center gap-2">
                <input className={inputCls} type="number" inputMode="numeric" min={3} max={8} value={ftin.ft} onChange={(e) => set('heightCm', ftInToCm(Number(e.target.value) || 0, ftin.inch))} aria-label="Feet" />
                <span className="text-[14px] font-bold">ft</span>
              </label>
              <label className="flex flex-1 items-center gap-2">
                <input className={inputCls} type="number" inputMode="numeric" min={0} max={11} value={ftin.inch} onChange={(e) => set('heightCm', ftInToCm(ftin.ft, Number(e.target.value) || 0))} aria-label="Inches" />
                <span className="text-[14px] font-bold">in</span>
              </label>
            </div>
          ) : (
            <label className="flex items-center gap-2">
              <input className={inputCls} type="number" inputMode="decimal" min={100} max={250} value={f.heightCm} onChange={(e) => set('heightCm', Number(e.target.value) || 0)} aria-label="Height in centimetres" />
              <span className="text-[14px] font-bold">cm</span>
            </label>
          )}
        </FieldRow>
        <Divider />
        <FieldRow label="Weight" hint="Your weight comes from weigh-ins so the trend stays honest.">
          <div className="flex items-center justify-between gap-3">
            <span className="font-heading text-[22px] tabular">{p.weightKg ? `${fmt1(imperial ? kgToLb(p.weightKg) : p.weightKg)} ${imperial ? 'lb' : 'kg'}` : '—'}</span>
            <Button size="sm" variant="secondary" icon={<Scale className="h-4 w-4" strokeWidth={2.75} />} onClick={openWeight}>
              Log a weigh-in
            </Button>
          </div>
        </FieldRow>
        <Divider />
        <FieldRow label="Date of birth">
          <input className={inputCls} type="date" value={f.dob} max={me.today} onChange={(e) => set('dob', e.target.value)} />
        </FieldRow>
        <Divider />
        <FieldRow label="Sex (for the calorie formula)">
          <Segmented
            label="Sex"
            size="sm"
            value={f.sex}
            onChange={(v) => set('sex', v)}
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'unspecified', label: 'Prefer not to say' },
            ]}
          />
        </FieldRow>
      </ListGroup>

      <ListGroup title="Activity level">
        <RadioList label="Activity level" value={f.activityLevel} onChange={(v) => set('activityLevel', v)} options={ACTIVITY_LEVELS.map((l) => ({ value: l, label: LEVELS[l].label, sub: LEVELS[l].sub }))} />
      </ListGroup>

      <ListGroup title="Timezone" footer="Your day (and reminders) follow this timezone.">
        <FieldRow label="Timezone">
          {tzs.length ? (
            <select className={inputCls} value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {!tzs.includes(f.timezone) && <option value={f.timezone}>{f.timezone}</option>}
              {tzs.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          ) : (
            <input className={inputCls} value={f.timezone} onChange={(e) => set('timezone', e.target.value)} />
          )}
          {deviceTz && deviceTz !== f.timezone && (
            <button type="button" onClick={() => set('timezone', deviceTz)} className="min-h-9 self-start border-0 bg-transparent px-2 text-[13px] font-bold text-accent-700 underline">
              Use this device’s ({deviceTz.replace(/_/g, ' ')})
            </button>
          )}
        </FieldRow>
      </ListGroup>

      <AnimatePresence>
        {affectsTargets && preview.data?.preview && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            <TargetsCard t={preview.data.preview} title="New targets after saving" was={me.targets?.kcal ?? null} loading={preview.isFetching} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dirty && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="sticky bottom-3 z-10 flex gap-2">
            <Button variant="secondary" className="flex-1 bg-bg" onClick={() => setF(initial)}>
              Undo changes
            </Button>
            <Button className="flex-1" loading={update.isPending} disabled={!!nameError} onClick={() => update.mutate(diff)}>
              {affectsTargets ? 'Save & update targets' : 'Save'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
