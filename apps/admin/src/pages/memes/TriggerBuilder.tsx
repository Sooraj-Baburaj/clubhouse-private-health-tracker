import { AlertTriangle, ArrowDown, ArrowUp, Check, Minus, Trash2, X, Zap } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CONDITION_LABELS,
  CooldownScope,
  MEME_TONES,
  ROAST_FORBIDDEN_CONDITIONS,
  TRIGGER_ACTIONS,
  TRIGGER_EVENTS,
  TriggerDefinition,
  type AdminTriggerDto,
  type MemeDto,
  type MemeSelection,
  type MemeTone,
  type PersonRef,
  type TriggerAction,
  type TriggerCondition,
  type TriggerEvent,
} from '@clubhouse/contracts';
import { useDeleteTrigger, useFireTest, useMemes, useSaveTrigger, useTriggerEvaluations, useTriggers } from '@/features/memes';
import { cn } from '@/lib/cn';
import { fmtDateTime, fmtInt, fmtNum, fmtPct, fmtRelative, plural } from '@/lib/format';
import {
  Button,
  confirmAction,
  DataTable,
  DrawerPanel,
  EmptyState,
  ErrorState,
  Field,
  FormGrid,
  IconButton,
  Input,
  Inset,
  MemberMultiSelect,
  Modal,
  NumberInput,
  PersonCell,
  Pill,
  SearchInput,
  Segmented,
  Select,
  SkeletonCard,
  ToggleRow,
  type Column,
} from '@/ui';
import { AddConditionMenu, ConditionEditor, defaultCondition, extraConditionIssues, MAX_CONDITIONS } from './ConditionEditors';
import { ACTION_LABELS, COOLDOWN_LABELS, EVENT_HINTS, EVENT_LABELS, eventLabel, IssueText, issuesAt, MemeImage, tagLabel, tagOptions, TONE_LABELS, TonePill, type Issue } from './shared';

/* ───────── Draft model ───────── */

interface Row {
  key: string;
  c: TriggerCondition;
}
interface Draft extends Omit<TriggerDefinition, 'conditions'> {
  rows: Row[];
}

let keySeq = 0;
const newKey = () => `cond-${++keySeq}`;

const NEW_TRIGGER: TriggerDefinition = {
  name: '',
  event: 'log_saved',
  match: 'all',
  conditions: [],
  action: 'show_private',
  selection: { mode: 'random_tag', tag: 'celebrate', noRepeatDays: 30 },
  cooldown: 'member_day',
  tone: 'celebrate',
  caption: null,
  excludedUserIds: [],
  enabled: false,
};

function definitionOf(t: AdminTriggerDto): TriggerDefinition {
  return { name: t.name, event: t.event, match: t.match, conditions: t.conditions, action: t.action, selection: t.selection, cooldown: t.cooldown, tone: t.tone, caption: t.caption, excludedUserIds: t.excludedUserIds, enabled: t.enabled };
}
function toDraft(d: TriggerDefinition): Draft {
  const { conditions, ...rest } = d;
  return { ...rest, rows: conditions.map((c) => ({ key: newKey(), c })) };
}
function toDefinition(d: Draft): TriggerDefinition {
  const { rows, ...rest } = d;
  return { ...rest, name: rest.name.trim(), caption: rest.caption?.trim() ? rest.caption.trim() : null, conditions: rows.map((r) => r.c) };
}
const snapshot = (d: TriggerDefinition) => JSON.stringify(d);

/**
 * zod skips `superRefine` while any field is invalid, so the guardrails (roast tone, reply/react needs chat)
 * would stay hidden until everything else is fixed. Re-run the schema's own rules on a probe that keeps only
 * what they look at (event, action, tone, condition types) so those errors show straight away.
 */
const PROBE_UUID = '00000000-0000-4000-8000-000000000000';
function guardrailIssues(def: TriggerDefinition): Issue[] {
  const probe: TriggerDefinition = {
    ...NEW_TRIGGER,
    name: 'probe',
    event: def.event,
    action: def.action,
    tone: def.tone,
    conditions: def.conditions.map((c) =>
      c.type === 'weight_change' ? { ...c, kg: 1, overDays: 14 } : c.type === 'member_in_list' ? { type: c.type, userIds: [PROBE_UUID] } : defaultCondition(c.type),
    ),
  };
  const r = TriggerDefinition.safeParse(probe);
  return r.success ? [] : (r.error.issues as unknown as Issue[]).filter((i) => i.code === 'custom');
}

function validate(def: TriggerDefinition): Issue[] {
  const r = TriggerDefinition.safeParse(def);
  const base = r.success ? [] : (r.error.issues as unknown as Issue[]);
  const guard = r.success || base.some((i) => i.code === 'custom') ? [] : guardrailIssues(def);
  return [...base, ...guard, ...extraConditionIssues(def.conditions)];
}

const ACTION_HINTS: Record<TriggerAction, string> = {
  show_private: 'Appears under the member’s log on Today. Only they see it.',
  post_chat_tag: 'Posted in team chat with the member tagged. Counts toward the daily chat cap.',
  post_chat_no_tag: 'Posted in team chat without naming anyone. Counts toward the daily chat cap.',
  reply_to_message: 'Replies to the member’s chat message with the meme.',
  react_to_message: 'Adds a reaction to the member’s chat message.',
};

/* ───────── Drawer ───────── */

/**
 * Trigger builder drawer (ADM-MEME). `id` is a trigger id or 'new'; `open` follows the URL.
 * The draft is validated with `TriggerDefinition` on every change; issues show next to their field.
 */
export function TriggerBuilder({ id, open, onClose, onOpenId }: { id: string | undefined; open: boolean; onClose: () => void; onOpenId: (id: string) => void }) {
  const triggersQ = useTriggers();
  const memesQ = useMemes();
  const isNew = id === 'new';
  const trigger = !isNew && id ? triggersQ.data?.find((t) => t.id === id) : undefined;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [initFor, setInitFor] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [fireResult, setFireResult] = useState<{ memeId: string | null; memeUrl: string | null; caption: string } | null>(null);
  const overlay = useRef(false);
  const formId = useId();

  // (Re)initialise the draft each time a trigger opens (derived state, set during render).
  if (!open && initFor !== null) setInitFor(null);
  if (open && id && initFor !== id) {
    const src = isNew ? NEW_TRIGGER : trigger ? definitionOf(trigger) : null;
    if (src) {
      setDraft(toDraft(src));
      setBaseline(snapshot(src));
      setInitFor(id);
      setNameTouched(false);
    }
  }

  const save = useSaveTrigger();
  const del = useDeleteTrigger();
  const fire = useFireTest();

  const def = draft ? toDefinition(draft) : null;
  const issues = def ? validate(def) : [];
  const valid = issues.length === 0;
  const dirty = !!def && snapshot(def) !== baseline;

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setRows = (fn: (rows: Row[]) => Row[]) => setDraft((d) => (d ? { ...d, rows: fn(d.rows) } : d));

  const withOverlay = async <T,>(fn: () => Promise<T>): Promise<T> => {
    overlay.current = true;
    try {
      return await fn();
    } finally {
      overlay.current = false;
    }
  };

  const requestClose = async () => {
    if (overlay.current || fireResult) return;
    if (dirty) {
      const ok = await withOverlay(() => confirmAction({ title: 'Discard changes?', body: 'Your edits to this trigger haven’t been saved.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing' }));
      if (ok === null) return;
    }
    onClose();
  };

  // Stable identity so the drawer's Escape listener isn't re-registered on every render.
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  const onDrawerClose = useCallback(() => void closeRef.current(), []);

  const onSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!def || !valid || save.isPending) return;
    try {
      const saved = await save.mutateAsync({ id: isNew ? null : (id ?? null), def });
      setBaseline(snapshot(def));
      if (isNew) onOpenId(saved.id);
      else onClose();
    } catch {
      /* toast shown by useAction */
    }
  };

  const onDelete = async () => {
    if (!trigger) return;
    const ok = await withOverlay(() =>
      confirmAction({
        title: `Delete “${trigger.name}”?`,
        body: 'The trigger stops immediately and its settings are removed. Memes it already sent stay where they are.',
        impact: [`Fired ${plural(trigger.firedCount, 'time')} so far`, trigger.catalogKey ? 'Starter trigger: reinstalling the starter catalogue brings it back switched off' : 'Custom trigger: this can’t be undone'],
        confirmLabel: 'Delete trigger',
        onConfirm: () => del.mutateAsync(trigger.id),
      }),
    );
    if (ok !== null) onClose();
  };

  const onFire = async () => {
    if (!trigger) return;
    try {
      const r = await fire.mutateAsync(trigger.id);
      setFireResult(r);
    } catch {
      /* toast shown */
    }
  };

  /* ── Body ── */
  let body: ReactNode;
  let footer: ReactNode = null;
  if (!id) body = null;
  else if (!isNew && triggersQ.isPending) body = <SkeletonCard lines={8} />;
  else if (!isNew && triggersQ.isError) body = <ErrorState error={triggersQ.error} onRetry={() => void triggersQ.refetch()} />;
  else if (!isNew && !trigger) body = <EmptyState title="Trigger not found" body="It may have been deleted. Close this panel to go back to the list." />;
  else if (draft && def) {
    const guardrail = issuesAt(issues, ['conditions'], true);
    const roast = draft.tone === 'roast';
    body = (
      <form id={formId} onSubmit={onSave} className="flex flex-col gap-6" noValidate>
        {/* Basics */}
        <Section title="Basics">
          <FormGrid min={240}>
            <Field label="Name" required labelAside={<span className="font-mono text-[11px] text-muted">{draft.name.length}/60</span>} error={nameTouched ? issuesAt(issues, ['name']).join(' ') || undefined : undefined}>
              <Input value={draft.name} maxLength={60} placeholder="e.g. Protein hero" onChange={(e) => set({ name: e.target.value })} onBlur={() => setNameTouched(true)} invalid={nameTouched && issuesAt(issues, ['name']).length > 0} data-autofocus={isNew || undefined} />
            </Field>
            <Field label="When" hint={EVENT_HINTS[draft.event]}>
              <Select value={draft.event} onChange={(e) => set({ event: e.target.value as TriggerEvent })}>
                {TRIGGER_EVENTS.map((ev) => (
                  <option key={ev} value={ev}>
                    {EVENT_LABELS[ev]}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <ToggleRow label="Switched on" hint="Off triggers never fire. Dry runs still include them." checked={draft.enabled} onChange={(enabled) => set({ enabled })} className="border-t-0 pb-0" />
        </Section>

        {/* Conditions */}
        <Section
          title="Conditions"
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Segmented size="sm" label="Match" value={draft.match} onChange={(match) => set({ match })} options={[{ value: 'all', label: 'Match all' }, { value: 'any', label: 'Match any' }]} />
              <span className="font-mono text-[11px] text-muted">
                {draft.rows.length}/{MAX_CONDITIONS}
              </span>
            </div>
          }
        >
          {guardrail.length > 0 && <GuardrailNote messages={guardrail} />}
          {draft.rows.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted">
              No conditions yet, so this fires on every “{EVENT_LABELS[draft.event].toLowerCase()}” (cooldown still applies).
            </div>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-0 p-0">
              {draft.rows.map((row, i) => {
                const conflict = roast && ROAST_FORBIDDEN_CONDITIONS.includes(row.c.type);
                return (
                  <li key={row.key} className="flex flex-col">
                    {i > 0 && (
                      <span className="self-start py-1.5 pl-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent" aria-hidden>
                        {draft.match === 'all' ? 'and' : 'or'}
                      </span>
                    )}
                    <div className={cn('flex flex-col gap-3 rounded-[14px] border bg-white p-3.5', conflict ? 'border-accent-border bg-accent-tint/25' : 'border-hairline', issuesAt(issues, ['conditions', i]).length > 0 && !conflict && 'border-accent-border')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bg font-mono text-[10px] font-semibold text-muted">{i + 1}</span>
                          <span className="truncate text-[14px] font-semibold">{CONDITION_LABELS[row.c.type]}</span>
                          {conflict && <Pill tone="over">Not with roasts</Pill>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <IconButton label={`Move condition ${i + 1} up`} size={28} disabled={i === 0} onClick={() => setRows((r) => move(r, i, -1))}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label={`Move condition ${i + 1} down`} size={28} disabled={i === draft.rows.length - 1} onClick={() => setRows((r) => move(r, i, 1))}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label={`Remove condition ${i + 1}`} size={28} onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}>
                            <X className="h-3.5 w-3.5" />
                          </IconButton>
                        </span>
                      </div>
                      <ConditionEditor condition={row.c} index={i} issues={issues} event={draft.event} onChange={(c) => setRows((r) => r.map((x) => (x.key === row.key ? { ...x, c } : x)))} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <AddConditionMenu roast={roast} disabled={draft.rows.length >= MAX_CONDITIONS} onAdd={(t) => setRows((r) => [...r, { key: newKey(), c: defaultCondition(t) }])} />
            {draft.rows.length >= MAX_CONDITIONS && <span className="text-[12px] text-muted">That’s the maximum of {MAX_CONDITIONS}.</span>}
          </div>
        </Section>

        {/* Action & meme */}
        <Section title="What happens">
          <FormGrid min={240}>
            <Field label="Action" hint={ACTION_HINTS[draft.action]} error={issuesAt(issues, ['action']).join(' ') || undefined}>
              <Select value={draft.action} invalid={issuesAt(issues, ['action']).length > 0} onChange={(e) => set({ action: e.target.value as TriggerAction })}>
                {TRIGGER_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABELS[a]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cooldown" hint="Stops the same trigger repeating too often.">
              <Select value={draft.cooldown} onChange={(e) => set({ cooldown: e.target.value as CooldownScope })}>
                {CooldownScope.options.map((c) => (
                  <option key={c} value={c}>
                    {COOLDOWN_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <MemeSelectionEditor key={initFor ?? 'none'} value={draft.selection} onChange={(selection) => set({ selection })} memes={memesQ.data} memesLoading={memesQ.isPending} issues={issues} />
          <Field as="div" label="Tone" hint="Roasts only go to members who opted in. Everyone else is skipped." error={guardrail.join(' ') || undefined}>
            <Segmented label="Tone" value={draft.tone} onChange={(tone: MemeTone) => set({ tone })} options={MEME_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }))} />
          </Field>
          <Field label="Caption" hint="Optional. Leave empty to use the meme’s own caption." labelAside={<span className="font-mono text-[11px] text-muted">{(draft.caption ?? '').length}/160</span>} error={issuesAt(issues, ['caption']).join(' ') || undefined}>
            <Input value={draft.caption ?? ''} maxLength={160} placeholder="e.g. Protein goals, crushed" onChange={(e) => set({ caption: e.target.value === '' ? null : e.target.value })} />
          </Field>
        </Section>

        {/* Exclusions */}
        <Section title="Who’s left out" description="Excluded members never get this trigger, whatever they log.">
          <MemberMultiSelect label="Excluded members" value={draft.excludedUserIds} onChange={(excludedUserIds) => set({ excludedUserIds })} maxHeight={200} />
        </Section>

        {trigger && <TriggerAnalytics trigger={trigger} />}
      </form>
    );
    footer = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          {trigger && (
            <>
              <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void onDelete()}>
                Delete
              </Button>
              <Button variant="outline" size="sm" icon={<Zap className="h-3.5 w-3.5" />} loading={fire.isPending} disabled={dirty} title={dirty ? 'Save your changes first. The test uses the saved version.' : 'Sends this trigger’s meme to you only'} onClick={() => void onFire()}>
                Fire now (test to me)
              </Button>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!valid && (
            <span className="text-[12px] font-semibold text-accent-dark" aria-live="polite">
              {plural(issues.length, 'thing')} to fix
            </span>
          )}
          <Button variant="secondary" onClick={() => void requestClose()}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={save.isPending} disabled={!valid || (!isNew && !dirty)}>
            {isNew ? 'Create trigger' : 'Save'}
          </Button>
        </div>
      </>
    );
  }

  const title = isNew ? 'New trigger' : trigger ? draft?.name.trim() || trigger.name : 'Trigger';
  return (
    <>
      <DrawerPanel
        open={open}
        onClose={onDrawerClose}
        size="xl"
        eyebrow={isNew ? 'Trigger builder' : `Trigger builder · ${draft?.enabled ? 'On' : 'Off'}`}
        title={title}
        subtitle={
          trigger ? (
            <span className="flex flex-wrap items-center gap-2">
              <TonePill tone={trigger.tone} />
              {trigger.catalogKey && <Pill tone="muted">Starter</Pill>}
              {trigger.annoying && (
                <Pill tone="over" icon={<AlertTriangle aria-hidden className="h-3 w-3" />}>
                  Annoying?
                </Pill>
              )}
              <span>{trigger.summary.condition}</span>
            </span>
          ) : isNew ? (
            'New triggers start switched off, so you can dry-run them first.'
          ) : undefined
        }
        footer={footer}
      >
        {body}
      </DrawerPanel>
      <Modal open={!!fireResult} onClose={() => setFireResult(null)} eyebrow="Test fire · only you" title={trigger?.name ?? 'Test fire'} width={400} footer={<Button onClick={() => setFireResult(null)}>Done</Button>}>
        {fireResult && (
          <div className="flex flex-col gap-3">
            {fireResult.memeUrl ? (
              <MemeImage url={fireResult.memeUrl} alt={fireResult.caption || 'Meme'} rounded />
            ) : (
              <EmptyState compact title="No meme matched" body="There’s no enabled meme for this selection yet. Add one to the library or pick a different tag." />
            )}
            {fireResult.caption && <p className="m-0 text-[15px] font-semibold leading-snug">{fireResult.caption}</p>}
            <span className="text-[12px] text-muted">Sent to you as a test. Nobody else sees it.</span>
          </div>
        )}
      </Modal>
    </>
  );
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

function Section({ title, description, aside, children }: { title: string; description?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="h3">{title}</h3>
          {description && <span className="text-[12px] text-muted">{description}</span>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function GuardrailNote({ messages }: { messages: string[] }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-[12px] border border-accent-border bg-accent-tint/40 px-3.5 py-3 text-[13px] leading-snug text-accent-dark">
      <AlertTriangle aria-hidden className="mt-[1px] h-4 w-4 shrink-0" />
      <span>
        <b>Roast guardrail.</b> {messages.join(' ')} Switch the tone below or remove the highlighted conditions.
      </span>
    </div>
  );
}

/* ───────── Meme selection ───────── */

function MemeSelectionEditor({ value, onChange, memes, memesLoading, issues }: { value: MemeSelection; onChange: (s: MemeSelection) => void; memes: MemeDto[] | undefined; memesLoading: boolean; issues: Issue[] }) {
  const [lastSpecific, setLastSpecific] = useState(value.mode === 'specific' ? value.memeId : '');
  const [lastRandom, setLastRandom] = useState(value.mode === 'random_tag' ? { tag: value.tag, noRepeatDays: value.noRepeatDays } : { tag: 'celebrate', noRepeatDays: 30 });
  const [q, setQ] = useState('');
  const usable = useMemo(() => (memes ?? []).filter((m) => m.enabled && m.status === 'approved'), [memes]);
  const tags = useMemo(() => tagOptions((memes ?? []).flatMap((m) => m.tags)), [memes]);
  const errs = issuesAt(issues, ['selection']);

  const setMode = (mode: MemeSelection['mode']) => {
    if (mode === value.mode) return;
    if (mode === 'specific') onChange({ mode, memeId: lastSpecific });
    else onChange({ mode, ...lastRandom });
  };

  const picked = value.mode === 'specific' ? (memes ?? []).find((m) => m.id === value.memeId) : undefined;
  const shown = usable.filter((m) => `${m.caption} ${m.tags.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  const tagCount = value.mode === 'random_tag' ? usable.filter((m) => m.tags.includes(value.tag)).length : 0;

  return (
    <Field as="div" label="Meme" error={errs.join(' ') || undefined}>
      <Segmented
        label="Meme selection"
        value={value.mode}
        onChange={setMode}
        options={[
          { value: 'random_tag', label: 'Random by tag' },
          { value: 'specific', label: 'Specific meme' },
        ]}
      />
      {value.mode === 'random_tag' ? (
        <div className="flex flex-col gap-2 pt-1">
          <FormGrid min={200}>
            <Field label="Tag">
              <Select
                value={value.tag}
                onChange={(e) => {
                  const next = { tag: e.target.value, noRepeatDays: value.noRepeatDays };
                  setLastRandom(next);
                  onChange({ mode: 'random_tag', ...next });
                }}
              >
                {!tags.includes(value.tag) && <option value={value.tag}>{tagLabel(value.tag)}</option>}
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {tagLabel(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Don’t repeat for" hint="Days before the same member can see the same meme again.">
              <span className="flex items-center gap-2">
                <NumberInput
                  aria-label="No-repeat days"
                  value={Number.isFinite(value.noRepeatDays) ? value.noRepeatDays : null}
                  min={0}
                  max={365}
                  onValue={(n) => {
                    const next = { tag: value.tag, noRepeatDays: n ?? Number.NaN };
                    setLastRandom(next);
                    onChange({ mode: 'random_tag', ...next });
                  }}
                  invalid={issuesAt(issues, ['selection', 'noRepeatDays']).length > 0}
                  className="w-[110px]"
                />
                <span className="text-[13px] text-muted">days</span>
              </span>
            </Field>
          </FormGrid>
          {!memesLoading && (
            <span className={cn('text-[12px]', tagCount === 0 ? 'font-semibold text-under-fg' : 'text-muted')}>
              {tagCount === 0 ? `No enabled memes are tagged “${value.tag}” yet, so nothing would be shown.` : `${plural(tagCount, 'enabled meme')} tagged “${value.tag}”.`}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          {picked && !(picked.enabled && picked.status === 'approved') && <span className="text-[12px] font-semibold text-under-fg">The chosen meme is switched off or still pending, so it won’t be sent.</span>}
          {usable.length > 12 && <SearchInput value={q} onChange={setQ} placeholder="Search memes" className="sm:w-full" />}
          {memesLoading ? (
            <div className="skeleton h-24 rounded-[12px]" />
          ) : usable.length === 0 ? (
            <span className="text-[13px] text-muted">No enabled memes in the library yet. Upload one or switch to “Random by tag”.</span>
          ) : (
            <div role="radiogroup" aria-label="Pick a meme" className="grid max-h-[300px] gap-2 overflow-y-auto p-0.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
              {shown.map((m) => {
                const on = value.mode === 'specific' && value.memeId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={m.caption || 'Untitled meme'}
                    onClick={() => {
                      setLastSpecific(m.id);
                      onChange({ mode: 'specific', memeId: m.id });
                    }}
                    className={cn('relative flex flex-col overflow-hidden rounded-[12px] border bg-white text-left transition-[border-color,box-shadow]', on ? 'border-accent shadow-[0_0_0_2px_rgba(182,49,108,0.35)]' : 'border-border hover:border-accent')}
                  >
                    <MemeImage url={m.thumbUrl ?? m.url} alt="" />
                    <span className="truncate px-2 py-1.5 text-[11px] font-semibold">{m.caption || 'Untitled'}</span>
                    {on && (
                      <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
                        <Check aria-hidden className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
              {shown.length === 0 && <span className="col-span-full text-[12px] text-muted">No memes match.</span>}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}

/* ───────── Analytics ───────── */

type Evaluation = { createdAt: string; person: PersonRef | null; event: string; fired: boolean; reasons: string[] };

function TriggerAnalytics({ trigger: t }: { trigger: AdminTriggerDto }) {
  const evals = useTriggerEvaluations(t.id);
  const stats: [string, string, string?][] = [
    ['Fired', fmtInt(t.firedCount), 'all time'],
    ['Per week', fmtNum(t.firesPerWeek, 1), 'average'],
    ['Reactions', fmtInt(t.reactions)],
    ['Dismissed', fmtPct(t.dismissRate, true), `${fmtInt(t.dismissCount)} times`],
  ];
  const columns: Column<Evaluation>[] = [
    { id: 'when', header: 'When', width: '110px', sortValue: (r) => r.createdAt, cell: (r) => <span title={fmtDateTime(r.createdAt)} className="text-[13px] text-muted">{fmtRelative(r.createdAt)}</span> },
    { id: 'who', header: 'Member', width: 'minmax(140px,1fr)', sortValue: (r) => r.person?.name ?? '', cell: (r) => <PersonCell person={r.person} size={24} /> },
    { id: 'event', header: 'Event', width: '130px', sortValue: (r) => r.event, cell: (r) => <span className="text-[13px]">{eventLabel(r.event)}</span> },
    {
      id: 'fired',
      header: 'Result',
      width: '96px',
      sortValue: (r) => r.fired,
      cell: (r) =>
        r.fired ? (
          <Pill tone="in" icon={<Check aria-hidden className="h-3 w-3" strokeWidth={2.5} />}>
            Fired
          </Pill>
        ) : (
          <Pill tone="none" icon={<Minus aria-hidden className="h-3 w-3" strokeWidth={2.5} />}>
            Skipped
          </Pill>
        ),
    },
    { id: 'why', header: 'Reasons', width: 'minmax(180px,1.6fr)', cell: (r) => <span className="line-clamp-2 text-[12px] text-muted" title={r.reasons.join('\n')}>{r.reasons.join(' · ') || '—'}</span> },
  ];
  return (
    <Section title="How it’s doing" description="Numbers since the trigger was created.">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {stats.map(([k, v, sub]) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-[14px] bg-bg px-3.5 py-3">
            <span className="th">{k}</span>
            <span className="font-display text-[22px] font-extrabold tracking-[-0.03em]">{v}</span>
            {sub && <span className="text-[11px] text-muted">{sub}</span>}
          </div>
        ))}
      </div>
      {t.annoying ? (
        <Inset className="border border-over-bg">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-over-fg">
            <AlertTriangle aria-hidden className="h-4 w-4" /> This one might be annoying
          </span>
          <span className="text-[12px] leading-relaxed text-muted">
            Members dismiss {fmtPct(t.dismissRate, true)} of what it sends. Try a longer cooldown, a narrower condition, a different tone, or switch it off for a while.
          </span>
        </Inset>
      ) : (
        <span className="text-[12px] text-muted">We flag a trigger as “Annoying?” when members dismiss a large share of what it sends.</span>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">Recent evaluations</span>
        <DataTable
          label="Recent evaluations"
          columns={columns}
          rows={evals.data}
          loading={evals.isPending}
          error={evals.error}
          onRetry={() => void evals.refetch()}
          rowKey={(r) => `${r.createdAt}-${r.person?.id ?? 'team'}-${r.event}`}
          initialSort={{ id: 'when', dir: 'desc' }}
          search={{ placeholder: 'Search member or reason', text: (r) => `${r.person?.name ?? ''} ${r.reasons.join(' ')}` }}
          filters={[
            {
              id: 'fired',
              label: 'Result',
              options: [
                { value: '', label: 'All results' },
                { value: 'yes', label: 'Fired' },
                { value: 'no', label: 'Skipped' },
              ],
              predicate: (r, v) => r.fired === (v === 'yes'),
            },
          ]}
          pageSize={15}
          minWidth={640}
          empty={<EmptyState compact title="No evaluations yet" body="Once members log, you’ll see each check here with the reasons it fired or skipped." />}
        />
      </div>
    </Section>
  );
}
