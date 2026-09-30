import { AlertTriangle, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { DEFAULT_MEAL_SLOTS, DEFAULT_STREAK_SETTINGS, DEFAULT_TEAM_SETTINGS, MEAL_SLOTS } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { useSaveTeamSettings, useTeamSettings, type TeamSettingsData } from '@/features/settings';
import { cn } from '@/lib/cn';
import { fieldErrors } from '@/lib/errors';
import { fmtDateTime, fromDateTimeLocal, SLOT_LABELS } from '@/lib/format';
import { AiChip, Button, Card, Checkbox, ErrorState, Field, FormGrid, Input, NumberInput, PageHeader, Select, SkeletonCard, Textarea, ToggleRow } from '@/ui';
import { browserZone, DefaultHint, LogoField, MilestonesInput, SettingsCard, TimezoneSelect } from './SettingsParts';
import { buildUpdate, dirtySections, SECTIONS, sectionOf, toForm, validate, type Errors, type SectionKey, type SettingsForm } from './settingsForm';

/** Team settings (ADM team defaults): basics, member defaults, meal slots, flags, streaks, memes & chat, maintenance banner. */
export function TeamSettingsPage() {
  const q = useTeamSettings();
  return (
    <>
      <PageHeader eyebrow="Defaults for new members" title="Team settings" description="How the team works day to day. Member defaults apply to people added from now on; everyone keeps any choice they’ve already made." />
      {q.isPending ? (
        <div className="flex max-w-[980px] flex-col gap-4">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={5} />
        </div>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <SettingsEditor data={q.data} />
      )}
    </>
  );
}

const SD = DEFAULT_STREAK_SETTINGS;
const TD = DEFAULT_TEAM_SETTINGS;

function SettingsEditor({ data }: { data: TeamSettingsData }) {
  const [base, setBase] = useState<SettingsForm>(() => toForm(data));
  const [form, setForm] = useState<SettingsForm>(base);
  const [errors, setErrors] = useState<Errors>({});

  // Re-base on fresh server data; keep the admin's unsaved edits if there are any.
  useEffect(() => {
    const next = toForm(data);
    setForm((f) => (JSON.stringify(f) === JSON.stringify(base) ? next : f));
    setBase(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const save = useSaveTeamSettings((d) => {
    const next = toForm(d);
    setBase(next);
    setForm(next);
    setErrors({});
  });

  const dirty = useMemo(() => dirtySections(base, form), [base, form]);
  const errorSections = useMemo(() => new Set(Object.keys(errors).map(sectionOf)), [errors]);

  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    clearErrors(k);
  };
  const clearErrors = (prefix: string) =>
    setErrors((e) => {
      const keys = Object.keys(e).filter((k) => k === prefix || k.startsWith(`${prefix}.`) || (prefix === 'banner' && k.startsWith('maintenanceBanner')) || (prefix === 'logo' && k === 'logoImageId'));
      if (!keys.length) return e;
      const n = { ...e };
      for (const k of keys) delete n[k];
      return n;
    });
  const patch = <K extends 'streaks' | 'memes' | 'chat' | 'featureFlags' | 'banner'>(k: K, v: Partial<SettingsForm[K]>) => {
    setForm((f) => ({ ...f, [k]: { ...f[k], ...v } }));
    for (const field of Object.keys(v)) clearErrors(k === 'banner' ? `maintenanceBanner.${field}` : `${k}.${field}`);
  };
  const setSlot = (slot: (typeof MEAL_SLOTS)[number], v: Partial<SettingsForm['mealSlots'][typeof slot]>) => {
    setForm((f) => ({ ...f, mealSlots: { ...f.mealSlots, [slot]: { ...f.mealSlots[slot], ...v } } }));
    clearErrors(`mealSlots.${slot}`);
  };

  const onSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!dirty.length || save.isPending) return;
    const candidate = buildUpdate(base, form);
    const v = validate(form, candidate);
    if (!v.ok) {
      setErrors(v.errors);
      toast.error('A few fields need a look before saving.');
      requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus());
      return;
    }
    if (!Object.keys(v.data).length) {
      setForm(base);
      return;
    }
    save.mutate(v.data, { onError: (err) => setErrors(fieldErrors(err)) });
  };

  const discard = () => {
    setForm(base);
    setErrors({});
  };

  const reduceMotion = useReducedMotion();
  const jumpTo = (k: SectionKey) => {
    const el = document.getElementById(`settings-${k}`);
    el?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    (el?.querySelector('input, select, textarea, button[role="switch"]') as HTMLElement | null)?.focus({ preventScroll: true });
  };
  const err = (k: string) => errors[k];
  const isDirty = (k: SectionKey) => dirty.includes(k);
  const tz = browserZone();
  const bannerPreviewLive = form.banner.on && form.banner.message.trim();

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="hidden lg:block">
        <ul className="sticky top-8 m-0 flex list-none flex-col gap-0.5 p-0">
          {SECTIONS.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => jumpTo(s.key)}
                className={cn('flex w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-left text-[13px] font-semibold transition-colors hover:bg-card hover:text-ink', errorSections.has(s.key) ? 'text-accent-dark' : 'text-muted')}
              >
                {s.label}
                {errorSections.has(s.key) ? <AlertTriangle aria-label="Needs a fix" className="h-3.5 w-3.5 text-accent-dark" /> : isDirty(s.key) ? <span role="img" aria-label="Unsaved changes" className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 max-w-[980px] flex-col gap-4">
        {/* Team */}
        <SettingsCard id="settings-team" title="Team" description="Name, logo and the timezone that decides when each team day starts and ends." dirty={isDirty('team')}>
          <FormGrid min={240}>
            <Field label="Team name" error={err('name')} required>
              <Input value={form.name} maxLength={60} invalid={!!err('name')} onChange={(e) => set('name', e.target.value)} autoComplete="organization" />
            </Field>
            <Field
              label="Default timezone"
              error={err('timezone')}
              hint={
                tz && tz !== form.timezone ? (
                  <>
                    Your browser is on {tz}.{' '}
                    <button type="button" className="font-semibold text-accent hover:text-accent-dark" onClick={() => set('timezone', tz)}>
                      Use it
                    </button>
                  </>
                ) : (
                  'New members start on this timezone.'
                )
              }
            >
              <TimezoneSelect value={form.timezone} onChange={(v) => set('timezone', v)} invalid={!!err('timezone')} />
            </Field>
            <Field label="Units" error={err('units')}>
              <Select value={form.units} onChange={(e) => set('units', e.target.value as SettingsForm['units'])}>
                <option value="metric">Metric (kg, km)</option>
                <option value="imperial">Imperial (lb, mi)</option>
              </Select>
            </Field>
          </FormGrid>
          <Field as="div" label="Logo" error={err('logoImageId')}>
            <LogoField
              url={form.logo.url}
              teamName={form.name}
              canRemove
              onUploaded={(id, url) => set('logo', { changed: true, imageId: id, url })}
              onRemove={() => set('logo', base.logo.url ? { changed: true, imageId: null, url: null } : base.logo)}
            />
          </Field>
        </SettingsCard>

        {/* Member defaults */}
        <SettingsCard id="settings-defaults" title="Member defaults" description="Starting choices for new members. Each member can change these in their own settings." dirty={isDirty('defaults')}>
          <FormGrid min={240}>
            <Field label="Teammates see" hint={<DefaultHint>daily summaries only</DefaultHint>} error={err('privacyDefault')}>
              <Select value={form.privacyDefault} onChange={(e) => set('privacyDefault', e.target.value as SettingsForm['privacyDefault'])}>
                <option value="summary">Daily summaries only</option>
                <option value="full">Full food logs</option>
              </Select>
            </Field>
            <Field label="Roast memes for new members" hint={<DefaultHint>on, with one-tap opt-out</DefaultHint>} error={err('roastDefault')}>
              <Select value={form.roastDefault ? 'on' : 'off'} onChange={(e) => set('roastDefault', e.target.value === 'on')}>
                <option value="on">On, with one-tap opt-out</option>
                <option value="off">Off</option>
              </Select>
            </Field>
            <Field label="Eat back exercise calories" hint={<DefaultHint>{TD.eatBackDefault ? 'on' : 'off'}. On adds burned calories to the day’s budget.</DefaultHint>} error={err('eatBackDefault')}>
              <Select value={form.eatBackDefault ? 'on' : 'off'} onChange={(e) => set('eatBackDefault', e.target.value === 'on')}>
                <option value="off">Off, keep the daily target fixed</option>
                <option value="on">On, add exercise back</option>
              </Select>
            </Field>
          </FormGrid>
        </SettingsCard>

        {/* Meal slots */}
        <SettingsCard
          id="settings-mealSlots"
          title="Meal slots"
          description="Names members see, and the time each slot runs until. A log is placed in the first slot whose time hasn’t passed."
          dirty={isDirty('mealSlots')}
          actions={
            <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => set('mealSlots', structuredClone(DEFAULT_MEAL_SLOTS))}>
              Reset to defaults
            </Button>
          }
        >
          <div role="table" aria-label="Meal slots" className="flex flex-col">
            <div role="row" className="hidden grid-cols-[130px_minmax(0,1fr)_minmax(0,220px)] gap-3 border-b border-hairline pb-2 sm:grid">
              <span role="columnheader" className="th">
                Slot
              </span>
              <span role="columnheader" className="th">
                Label
              </span>
              <span role="columnheader" className="th">
                Until
              </span>
            </div>
            {MEAL_SLOTS.map((slot, i) => {
              const s = form.mealSlots[slot];
              const d = DEFAULT_MEAL_SLOTS[slot];
              const last = i === MEAL_SLOTS.length - 1;
              const labelErr = err(`mealSlots.${slot}.label`);
              const untilErr = err(`mealSlots.${slot}.until`);
              return (
                <div role="row" key={slot} className="grid grid-cols-1 gap-2 border-b border-hairline py-3 last:border-b-0 sm:grid-cols-[130px_minmax(0,1fr)_minmax(0,220px)] sm:items-start sm:gap-3">
                  <span role="cell" className="pt-0 font-mono text-[12px] text-muted sm:pt-3">
                    {slot}
                  </span>
                  <div role="cell" className="flex flex-col gap-1">
                    <Input aria-label={`${SLOT_LABELS[slot] ?? slot} label`} value={s.label} maxLength={40} placeholder={d.label} invalid={!!labelErr} onChange={(e) => setSlot(slot, { label: e.target.value })} />
                    {labelErr && <span className="text-[12px] font-semibold text-accent-dark">{labelErr}</span>}
                  </div>
                  <div role="cell" className="flex flex-col gap-1.5">
                    <Input
                      type="time"
                      aria-label={`${s.label || d.label} until`}
                      value={s.until ?? ''}
                      disabled={s.until === null && last}
                      invalid={!!untilErr}
                      onChange={(e) => setSlot(slot, { until: e.target.value || (last ? null : e.target.value) })}
                      className="font-mono text-[13px]"
                    />
                    {last && (
                      <Checkbox
                        label="Runs to end of day"
                        checked={s.until === null}
                        onChange={(e) => setSlot(slot, { until: e.target.checked ? null : (d.until ?? '23:00') })}
                      />
                    )}
                    {untilErr ? <span className="text-[12px] font-semibold text-accent-dark">{untilErr}</span> : <DefaultHint>{d.until ? `until ${d.until}` : 'end of day'}</DefaultHint>}
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>

        {/* Feature flags */}
        <SettingsCard id="settings-flags" title="Feature flags" description="Switch whole features on or off for everyone. Members see changes the next time the app refreshes." dirty={isDirty('flags')}>
          <div className="flex flex-col">
            <ToggleRow label="Team pulse" hint="Members can opt in to compare consistency and sessions with each other. Weight is never shared." checked={form.featureFlags.teamPulse} onChange={(v) => patch('featureFlags', { teamPulse: v })} />
            <ToggleRow label="Roast memes" hint="Playful memes from triggers. Members can still opt out one tap at a time." checked={form.featureFlags.roastMemes} onChange={(v) => patch('featureFlags', { roastMemes: v })} />
            <ToggleRow
              label="Natural-language entry"
              hint="Type “2 idli and sambar” and get a logged meal. Falls back to search when AI is off."
              aside={<AiChip feature="food.text" />}
              checked={form.featureFlags.naturalLanguageEntry}
              onChange={(v) => patch('featureFlags', { naturalLanguageEntry: v })}
            />
          </div>
        </SettingsCard>

        {/* Streaks */}
        <SettingsCard id="settings-streaks" title="Streaks" description="How streaks forgive a missed day, when they pause and reset, and which milestones get celebrated." dirty={isDirty('streaks')}>
          <FormGrid min={200}>
            <StreakNumber label="Grace days earned per 7 days" k="graceEarnedPer7" min={0} max={3} form={form} err={err} patch={patch} />
            <StreakNumber label="Grace bank maximum" k="graceBankMax" min={0} max={7} form={form} err={err} patch={patch} />
            <StreakNumber label="Pause window (days)" k="pauseWindowDays" min={1} max={14} form={form} err={err} patch={patch} hint="A paused streak resumes if the member logs within this many days." />
            <StreakNumber label="Reset after (missed days)" k="resetAfterDays" min={1} max={30} form={form} err={err} patch={patch} />
            <StreakNumber label="Vacation days per quarter" k="vacationDaysPerQuarter" min={0} max={90} form={form} err={err} patch={patch} />
          </FormGrid>
          <ToggleRow label="Team streak" hint="Counts days when everyone logged at least once." checked={form.streaks.teamStreakEnabled} onChange={(v) => patch('streaks', { teamStreakEnabled: v })} className="border-t border-hairline" />
          <FormGrid min={260}>
            <Field as="div" label="Milestones (days)" hint={`Up to 12. Default ${SD.milestones.join(', ')}.`} error={err('streaks.milestones')}>
              <MilestonesInput label="Milestones" value={form.streaks.milestones} onChange={(v) => patch('streaks', { milestones: v })} suggestions={SD.milestones} />
            </Field>
            <Field as="div" label="Team milestones (days)" hint={`Up to 12. Default ${SD.teamMilestones.join(', ')}.`} error={err('streaks.teamMilestones')}>
              <MilestonesInput label="Team milestones" value={form.streaks.teamMilestones} onChange={(v) => patch('streaks', { teamMilestones: v })} suggestions={SD.teamMilestones} />
            </Field>
          </FormGrid>
        </SettingsCard>

        {/* Memes & chat */}
        <SettingsCard id="settings-memesChat" title="Memes & chat" description="Keep the chat lively without flooding it." dirty={isDirty('memesChat')}>
          <FormGrid min={220}>
            <Field label="Daily meme cap in chat" hint={`0–100 memes a day for the whole team. Default ${TD.memes.dailyChatCap}.`} error={err('memes.dailyChatCap')}>
              <NumberInput min={0} max={100} step={1} value={form.memes.dailyChatCap} invalid={!!err('memes.dailyChatCap')} onValue={(v) => patch('memes', { dailyChatCap: v })} />
            </Field>
            <Field label="Chat digest every (minutes)" hint={`5–240. Quiet members get one summary push per window. Default ${TD.chat.digestMinutes}.`} error={err('chat.digestMinutes')}>
              <NumberInput min={5} max={240} step={5} value={form.chat.digestMinutes} invalid={!!err('chat.digestMinutes')} onValue={(v) => patch('chat', { digestMinutes: v })} />
            </Field>
          </FormGrid>
          <Field
            as="div"
            label={
              <span className="inline-flex items-center gap-2">
                Photo confidence threshold <AiChip feature="food.photo" />
              </span>
            }
            hint={`Photo estimates below this are marked “double-check” for the member. Default ${TD.memes.confidenceThreshold}.`}
            error={err('memes.confidenceThreshold')}
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                aria-label="Photo confidence threshold"
                value={form.memes.confidenceThreshold ?? 0}
                onChange={(e) => patch('memes', { confidenceThreshold: Number(e.target.value) })}
                className="h-2 min-w-0 flex-1 cursor-pointer accent-[#B6316C]"
              />
              <NumberInput aria-label="Photo confidence threshold value" min={0} max={1} step={0.05} value={form.memes.confidenceThreshold} invalid={!!err('memes.confidenceThreshold')} onValue={(v) => patch('memes', { confidenceThreshold: v })} className="!w-[88px]" />
            </div>
          </Field>
        </SettingsCard>

        {/* Maintenance banner */}
        <SettingsCard
          id="settings-banner"
          title="Maintenance banner"
          description="A short notice at the top of the member app, for planned downtime or big changes. Leave the times empty to show it straight away and until you remove it."
          dirty={isDirty('banner')}
          actions={
            form.banner.on ? (
              <Button size="sm" variant="danger" onClick={() => set('banner', { ...form.banner, on: false })}>
                Remove banner
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => set('banner', { ...form.banner, on: true })}>
                Add a banner
              </Button>
            )
          }
        >
          {form.banner.on ? (
            <>
              <Field label="Message" hint={`${form.banner.message.length}/280`} error={err('maintenanceBanner.message')} required>
                <Textarea rows={2} maxLength={280} value={form.banner.message} invalid={!!err('maintenanceBanner.message')} placeholder="Clubhouse will be down for about 10 minutes on Sunday at 7 am." onChange={(e) => patch('banner', { message: e.target.value })} />
              </Field>
              <FormGrid min={220}>
                <Field label="Starts" hint="Empty = now" error={err('maintenanceBanner.startsAt')}>
                  <Input type="datetime-local" value={form.banner.startsAt} invalid={!!err('maintenanceBanner.startsAt')} onChange={(e) => patch('banner', { startsAt: e.target.value })} className="font-mono text-[13px]" />
                </Field>
                <Field label="Ends" hint="Empty = until removed" error={err('maintenanceBanner.endsAt')}>
                  <Input type="datetime-local" value={form.banner.endsAt} invalid={!!err('maintenanceBanner.endsAt')} onChange={(e) => patch('banner', { endsAt: e.target.value })} className="font-mono text-[13px]" />
                </Field>
              </FormGrid>
              {bannerPreviewLive && (
                <div className="flex flex-col gap-1.5">
                  <span className="th">Preview</span>
                  <div className="flex items-start gap-2 rounded-[14px] bg-under-bg px-3.5 py-2.5 text-[13px] font-medium text-under-fg">
                    <AlertTriangle aria-hidden className="mt-[2px] h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{form.banner.message.trim()}</span>
                  </div>
                  <span className="text-[12px] text-muted">{bannerWindow(form.banner.startsAt, form.banner.endsAt)}</span>
                </div>
              )}
            </>
          ) : (
            <p className="m-0 text-[13px] text-muted">{base.banner.on ? 'The banner will be removed when you save.' : 'No banner is showing.'}</p>
          )}
        </SettingsCard>

        <SaveBar dirty={dirty} errorCount={Object.keys(errors).length} saving={save.isPending} onDiscard={discard} />
      </div>
    </form>
  );
}

function bannerWindow(startsAt: string, endsAt: string): string {
  const a = fromDateTimeLocal(startsAt);
  const b = fromDateTimeLocal(endsAt);
  if (!a && !b) return 'Shows from the moment you save until you remove it.';
  if (a && !b) return `Shows from ${fmtDateTime(a)} until you remove it.`;
  if (!a && b) return `Shows from the moment you save until ${fmtDateTime(b)}.`;
  return `Shows ${fmtDateTime(a)} to ${fmtDateTime(b)}.`;
}

type StreakNumKey = 'graceEarnedPer7' | 'graceBankMax' | 'pauseWindowDays' | 'resetAfterDays' | 'vacationDaysPerQuarter';

function StreakNumber({ label, k, min, max, hint, form, err, patch }: { label: string; k: StreakNumKey; min: number; max: number; hint?: string; form: SettingsForm; err: (k: string) => string | undefined; patch: (k: 'streaks', v: Partial<SettingsForm['streaks']>) => void }) {
  const e = err(`streaks.${k}`);
  return (
    <Field label={label} hint={hint ? `${hint} ${min}–${max}, default ${SD[k]}.` : `${min}–${max}. Default ${SD[k]}.`} error={e}>
      <NumberInput min={min} max={max} step={1} value={form.streaks[k]} invalid={!!e} onValue={(v) => patch('streaks', { [k]: v })} />
    </Field>
  );
}

/** Sticky bar at the bottom while there are unsaved changes. */
function SaveBar({ dirty, errorCount, saving, onDiscard }: { dirty: SectionKey[]; errorCount: number; saving: boolean; onDiscard: () => void }) {
  const reduce = useReducedMotion();
  const names = dirty.map((k) => SECTIONS.find((s) => s.key === k)?.label ?? k);
  return (
    <AnimatePresence>
      {dirty.length > 0 && (
        <motion.div
          key="savebar"
          role="region"
          aria-label="Unsaved changes"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="glass sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[20px] px-4 py-3 sm:px-5"
        >
          <div className="flex min-w-0 flex-col gap-0.5" aria-live="polite">
            <span className="text-[14px] font-semibold">
              {errorCount > 0 ? `${errorCount === 1 ? '1 field needs' : `${errorCount} fields need`} a look` : `Unsaved changes in ${names.length === 1 ? names[0] : `${names.length} sections`}`}
            </span>
            <span className="truncate text-[12px] text-muted">{names.join(' · ')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onDiscard} disabled={saving}>
              Discard
            </Button>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
