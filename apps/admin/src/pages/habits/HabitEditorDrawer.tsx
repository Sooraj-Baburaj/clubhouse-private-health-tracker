import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { AdminHabitInput, HABIT_GROUPS, HABIT_HUES, type AdminHabitDto, type HabitKind, type HabitSchedule } from '@clubhouse/contracts';
import { useMembers } from '@/features/directory';
import { useArchiveHabit, useSaveHabit } from '@/features/habits';
import { todayLocal } from '@/lib/format';
import { Button, ChipToggleGroup, confirmAction, DayPicker, DrawerPanel, Field, Input, NumberInput, Segmented, Select, Textarea, Toggle } from '@/ui';
import { IconPicker } from './IconPicker';
import { HabitIcon, habitSwatch, KIND_HINT } from './shared';

type Draft = Omit<AdminHabitInput, 'note' | 'endsOn' | 'reminderTime'> & { note: string; endsOn: string; remind: boolean; time: string };
type Errors = Partial<Record<'name' | 'icon' | 'target' | 'days' | 'memberIds' | 'endsOn' | 'note' | 'startsOn', string>>;

const KIND_DEFAULTS: Record<HabitKind, { target: number; unit: string }> = { check: { target: 1, unit: '' }, count: { target: 8, unit: 'glasses' }, duration: { target: 20, unit: 'min' }, scale: { target: 5, unit: '1–5' } };

function draftOf(h: AdminHabitDto | null): Draft {
  if (!h) {
    return { name: '', icon: '✨', hue: 350, group: 'Morning', kind: 'check', target: 1, unit: '', schedule: { type: 'daily', days: [], perWeek: 3 }, assign: 'all', memberIds: [], required: true, remind: false, time: '08:00', note: '', startsOn: todayLocal(), endsOn: '' };
  }
  return { ...h, schedule: { ...h.schedule, days: [...h.schedule.days] }, memberIds: [...h.memberIds], note: h.note ?? '', endsOn: h.endsOn ?? '', remind: !!h.reminderTime, time: h.reminderTime ?? '08:00' };
}

function toInput(d: Draft): AdminHabitInput {
  return {
    name: d.name,
    icon: d.icon,
    hue: d.hue,
    group: d.group,
    kind: d.kind,
    target: d.target,
    unit: d.unit,
    schedule: d.schedule,
    assign: d.assign,
    memberIds: d.assign === 'some' ? d.memberIds : [],
    required: d.required,
    reminderTime: d.remind ? d.time : null,
    note: d.note.trim() || null,
    startsOn: d.startsOn,
    endsOn: d.endsOn || null,
  };
}

/** New / edit habit drawer (design: name, icon, colour, group, kind + target, schedule, assignment, required, reminder, note, dates). */
export function HabitEditorDrawer({ open, habit, onClose }: { open: boolean; habit: AdminHabitDto | null; onClose: () => void }) {
  const formId = 'habit-editor-form';
  const save = useSaveHabit();
  const archive = useArchiveHabit();
  const isNew = !habit;
  // Re-seed the draft whenever a different habit (or "new") opens (adjust state during render).
  const key = open ? (habit?.id ?? 'new') : null;
  const [seenKey, setSeenKey] = useState(key);
  const [d, setD] = useState<Draft>(() => draftOf(habit));
  const [errors, setErrors] = useState<Errors>({});
  if (key !== seenKey) {
    setSeenKey(key);
    if (key) {
      setD(draftOf(habit));
      setErrors({});
    }
  }
  const up = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setSchedule = (patch: Partial<HabitSchedule>) => setD((x) => ({ ...x, schedule: { ...x.schedule, ...patch } }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = AdminHabitInput.safeParse(toInput(d));
    if (!parsed.success) {
      const next: Errors = {};
      for (const i of parsed.error.issues) {
        const k = (i.path[0] === 'schedule' ? i.path[1] : i.path[0]) as keyof Errors;
        next[k] ??= i.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate({ id: habit?.id ?? null, body: parsed.data }, { onSuccess: onClose });
  };

  const onArchive = async () => {
    if (!habit) return;
    const ok = await confirmAction({
      title: `Archive ${habit.name}?`,
      body: 'It disappears from members’ lists and from this catalogue. Every check-in stays in the history and the audit log.',
      confirmLabel: 'Archive habit',
      tone: 'danger',
      onConfirm: () => archive.mutateAsync(habit),
    });
    if (ok !== null) onClose();
  };

  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      size="md"
      eyebrow={isNew ? 'New habit' : 'Edit habit'}
      title={
        <span className="flex items-center gap-3">
          <HabitIcon icon={d.icon} hue={d.hue} size={48} className="rounded-[14px]" />
          <span className="min-w-0 break-words">{d.name.trim() || 'Untitled habit'}</span>
        </span>
      }
      footer={
        <div className="flex w-full flex-col gap-2.5">
          <span className="text-[12px] leading-relaxed text-muted">
            {isNew ? 'Members see it from the start date. Recorded in the audit log.' : habit.hasCheckins ? 'Has check-ins, so it can’t be deleted. Archiving keeps history. Edits are audited; past check-ins keep their old target.' : 'Edits are audited and members see them straight away.'}
          </span>
          <div className="flex flex-wrap justify-between gap-2">
            {!isNew && (
              <Button variant="outline" className="border-accent-border text-accent-dark" onClick={() => void onArchive()} disabled={save.isPending}>
                Archive
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
                Cancel
              </Button>
              <Button type="submit" form={formId} loading={save.isPending}>
                {isNew ? 'Create habit' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
        <Field label="Name" error={errors.name} required>
          <Input value={d.name} onChange={(e) => up({ name: e.target.value })} placeholder="Night skin care" maxLength={60} invalid={!!errors.name} autoFocus={isNew} />
        </Field>

        <Field as="div" label="Icon">
          <IconPicker key={seenKey ?? 'closed'} value={d.icon} onChange={(icon) => up({ icon })} error={errors.icon} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field as="div" label="Colour">
            <div className="flex flex-wrap gap-1.5">
              {HABIT_HUES.map((hue) => (
                <button
                  key={hue}
                  type="button"
                  aria-pressed={d.hue === hue}
                  aria-label={`Colour ${hue}`}
                  onClick={() => up({ hue })}
                  className="h-7 w-7 rounded-full transition-shadow"
                  style={{ background: habitSwatch(hue), boxShadow: d.hue === hue ? '0 0 0 2px #fff, 0 0 0 4px #17171C' : 'none' }}
                />
              ))}
            </div>
          </Field>
          <Field label="Group">
            <Select value={d.group} onChange={(e) => up({ group: e.target.value as Draft['group'] })}>
              {HABIT_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Section label="Kind">
          <Segmented
            label="Kind"
            className="w-full"
            value={d.kind}
            onChange={(kind) => up({ kind, ...KIND_DEFAULTS[kind] })}
            options={[
              { value: 'check', label: 'Check' },
              { value: 'count', label: 'Count' },
              { value: 'duration', label: 'Duration' },
              { value: 'scale', label: 'Scale' },
            ]}
          />
          {(d.kind === 'count' || d.kind === 'duration') && (
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
              <Field label="Target" error={errors.target}>
                <NumberInput value={d.target} onValue={(v) => up({ target: v ?? 0 })} min={1} max={1000} invalid={!!errors.target} />
              </Field>
              <Field label="Unit" hint={d.kind === 'duration' ? 'Minutes' : undefined}>
                <Input value={d.kind === 'duration' ? 'min' : d.unit} onChange={(e) => up({ unit: e.target.value })} disabled={d.kind === 'duration'} maxLength={20} placeholder="glasses" />
              </Field>
            </div>
          )}
          <span className="text-[12px] leading-relaxed text-muted">{KIND_HINT[d.kind]}</span>
        </Section>

        <Section label="Schedule">
          <Segmented
            label="Schedule"
            value={d.schedule.type}
            onChange={(type) => setSchedule({ type })}
            options={[
              { value: 'daily', label: 'Every day' },
              { value: 'days', label: 'Weekdays' },
              { value: 'weekly', label: 'N× a week' },
            ]}
          />
          {d.schedule.type === 'days' && (
            <>
              <DayPicker label="Days" value={d.schedule.days} onChange={(days) => setSchedule({ days })} />
              {errors.days && <span role="alert" className="text-[12px] font-semibold text-accent-dark">{errors.days}</span>}
            </>
          )}
          {d.schedule.type === 'weekly' && (
            <div className="flex items-center gap-2.5">
              <button type="button" aria-label="Fewer times a week" disabled={d.schedule.perWeek <= 1} onClick={() => setSchedule({ perWeek: Math.max(1, d.schedule.perWeek - 1) })} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-white disabled:opacity-40">
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-6 text-center font-display text-[20px] font-extrabold" aria-live="polite">
                {d.schedule.perWeek}
              </span>
              <button type="button" aria-label="More times a week" disabled={d.schedule.perWeek >= 6} onClick={() => setSchedule({ perWeek: Math.min(6, d.schedule.perWeek + 1) })} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-white disabled:opacity-40">
                <Plus className="h-4 w-4" />
              </button>
              <span className="text-[13px] text-muted">times a week, any day. Judged at week end.</span>
            </div>
          )}
        </Section>

        <Section label="Assigned to">
          <Segmented
            label="Assigned to"
            value={d.assign}
            onChange={(assign) => up({ assign })}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'some', label: 'Selected members' },
            ]}
          />
          {d.assign === 'some' && <MemberChips value={d.memberIds} onChange={(memberIds) => up({ memberIds })} error={errors.memberIds} />}
        </Section>

        <div className="flex items-center justify-between gap-4 border-t border-hairline pt-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-semibold">Required</span>
            <span className="text-[12px] leading-relaxed text-muted">{d.required ? 'Counts toward the habits streak. Members can’t hide it.' : 'Members can hide it. Doesn’t affect the habits streak.'}</span>
          </div>
          <Toggle checked={d.required} onChange={(required) => up({ required })} label="Required" />
        </div>

        <div className="flex flex-col gap-2.5 border-t border-hairline pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[14px] font-semibold">Default reminder</span>
              <span className="text-[12px] leading-relaxed text-muted">Bundled with other habits due at the same time. Skipped if already done.</span>
            </div>
            <Toggle checked={d.remind} onChange={(remind) => up({ remind })} label="Default reminder" />
          </div>
          {d.remind && <Input type="time" aria-label="Reminder time" value={d.time} onChange={(e) => up({ time: e.target.value })} className="w-[140px] self-start" />}
        </div>

        <Field label="How-to note" hint={`Shown when a member taps the habit. ${d.note.length}/300`} error={errors.note} className="border-t border-hairline pt-4">
          <Textarea rows={3} value={d.note} maxLength={300} onChange={(e) => up({ note: e.target.value })} placeholder="Cleanser, serum, moisturiser. Sunscreen in the morning." invalid={!!errors.note} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" error={errors.startsOn}>
            <Input type="date" value={d.startsOn} onChange={(e) => up({ startsOn: e.target.value })} />
          </Field>
          <Field label="Ends" hint="Optional" error={errors.endsOn}>
            <Input type="date" value={d.endsOn} min={d.startsOn} onChange={(e) => up({ endsOn: e.target.value })} invalid={!!errors.endsOn} />
          </Field>
        </div>
      </form>
    </DrawerPanel>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2 border-t border-hairline pt-4">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
    </div>
  );
}

function MemberChips({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const q = useMembers();
  const members = (q.data ?? []).filter((m) => m.status !== 'deactivated').sort((a, b) => a.person.name.localeCompare(b.person.name));
  if (q.isPending) return <div className="skeleton h-8 w-full" />;
  return (
    <>
      <ChipToggleGroup label="Members" value={value} onChange={onChange} options={members.map((m) => ({ value: m.id, label: m.person.name }))} />
      {error ? <span role="alert" className="text-[12px] font-semibold text-accent-dark">{error}</span> : <span className="text-[12px] text-muted">{value.length} selected</span>}
    </>
  );
}
