import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  CompareOp,
  CONDITION_LABELS,
  FOOD_TAGS,
  PERSONAL_RECORDS,
  ROAST_FORBIDDEN_CONDITIONS,
  STREAK_KINDS,
  type FoodTag,
  type TriggerCondition,
  type TriggerConditionType,
  type TriggerEvent,
} from '@clubhouse/contracts';
import { useActivityTypes } from '@/features/directory';
import { useTeamKeywords } from '@/features/memes';
import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';
import { Button, Checkbox, ChipInput, ChipToggleGroup, Input, MemberMultiSelect, NumberInput, Segmented, Select } from '@/ui';
import { BAND_LABELS, IssueText, issuesAt, MACRO_LABELS, OP_LABELS, RECORD_LABELS, STREAK_KIND_LABELS, type Issue } from './shared';

type Of<T extends TriggerConditionType> = Extract<TriggerCondition, { type: T }>;

export const MAX_CONDITIONS = 12;

/** Sensible starting values for a freshly added condition. */
export function defaultCondition(type: TriggerConditionType): TriggerCondition {
  switch (type) {
    case 'meal_kcal':
      return { type, op: 'gt', value: 800 };
    case 'item_kcal':
      return { type, op: 'gt', value: 500 };
    case 'macro_amount':
      return { type, macro: 'protein', op: 'gte', grams: 30 };
    case 'macro_percent':
      return { type, macro: 'protein', op: 'gte', percent: 40 };
    case 'food_tags':
      return { type, tags: ['dessert'], match: 'any' };
    case 'time_of_day':
      return { type, from: '22:00', to: '23:59' };
    case 'count_this_week':
      return { type, what: 'food_logs', op: 'gte', value: 5 };
    case 'days_since_last_log':
      return { type, op: 'gte', days: 3 };
    case 'streak_milestone':
      return { type, kind: 'logging', values: [7, 30, 100] };
    case 'personal_record':
      return { type, records: ['longest_run'] };
    case 'message_contains':
      return { type, words: [], useTeamKeywords: true };
    case 'member_in_list':
      return { type, userIds: [] };
    case 'macro_target_met_days':
      return { type, macro: 'protein', days: 3 };
    case 'weight_change':
      return { type, direction: 'down', kg: 1, overDays: 14 };
    case 'calorie_band':
      return { type, bands: ['green'] };
    case 'plan_item_completed':
    case 'streak_resumed':
    case 'team_all_logged':
    case 'not_on_vacation':
    case 'weight_new_low':
      return { type };
  }
}

export const CONDITION_GROUPS: { label: string; types: TriggerConditionType[] }[] = [
  { label: 'Meals & food', types: ['meal_kcal', 'item_kcal', 'macro_amount', 'macro_percent', 'food_tags', 'time_of_day'] },
  { label: 'Habits & streaks', types: ['count_this_week', 'days_since_last_log', 'plan_item_completed', 'streak_milestone', 'streak_resumed', 'personal_record', 'macro_target_met_days', 'team_all_logged'] },
  { label: 'Chat & people', types: ['message_contains', 'member_in_list', 'not_on_vacation'] },
  { label: 'Weight & day end', types: ['weight_change', 'weight_new_low', 'calorie_band'] },
];

/** Plain-language explanation shown for conditions without settings. */
const NO_PARAM_TEXT: Partial<Record<TriggerConditionType, string>> = {
  plan_item_completed: 'Matches when the member ticks off an item from their weekly activity plan.',
  streak_resumed: 'Matches when a paused streak picks up again after a break.',
  team_all_logged: 'Matches once every active member has logged something today.',
  not_on_vacation: 'Matches only members who are not on vacation, so nobody gets pinged while away.',
  weight_new_low: 'Matches when a weigh-in is the lowest the member has logged so far.',
};

/** Extra checks the schema can't express (a picked "what" needs its tag / activity, keyword triggers need words). */
export function extraConditionIssues(conditions: TriggerCondition[]): Issue[] {
  const out: Issue[] = [];
  conditions.forEach((c, i) => {
    if (c.type === 'count_this_week' && c.what === 'food_tag' && !c.tag) out.push({ path: ['conditions', i, 'tag'], code: 'custom', message: 'Pick a food tag.' });
    if (c.type === 'count_this_week' && c.what === 'activity_type' && !c.activityTypeId) out.push({ path: ['conditions', i, 'activityTypeId'], code: 'custom', message: 'Pick an activity.' });
    if (c.type === 'message_contains' && c.words.length === 0 && !c.useTeamKeywords) out.push({ path: ['conditions', i, 'words'], code: 'custom', message: 'Add a word or use the team keyword list.' });
  });
  return out;
}

/* ───────── Small inline controls ───────── */

const Sentence = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('flex flex-wrap items-center gap-2 text-[13px]', className)}>{children}</div>;
const Word = ({ children }: { children: ReactNode }) => <span className="text-muted">{children}</span>;

function OpSelect({ value, onChange, label }: { value: CompareOp; onChange: (v: CompareOp) => void; label: string }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as CompareOp)} className="w-[132px]">
      {CompareOp.options.map((op) => (
        <option key={op} value={op}>
          {OP_LABELS[op]}
        </option>
      ))}
    </Select>
  );
}

function Num({ value, onValue, label, min, max, step = 1, suffix, invalid, width = 92 }: { value: number; onValue: (n: number) => void; label: string; min?: number; max?: number; step?: number; suffix?: string; invalid?: boolean; width?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <NumberInput aria-label={label} value={Number.isFinite(value) ? value : null} onValue={(n) => onValue(n ?? Number.NaN)} min={min} max={max} step={step} invalid={invalid} style={{ width }} />
      {suffix && <Word>{suffix}</Word>}
    </span>
  );
}

function MacroSelect<M extends string>({ value, onChange, options, label }: { value: M; onChange: (m: M) => void; options: readonly M[]; label: string }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as M)} className="w-[124px]">
      {options.map((m) => (
        <option key={m} value={m}>
          {MACRO_LABELS[m as keyof typeof MACRO_LABELS]}
        </option>
      ))}
    </Select>
  );
}

const MACROS = ['protein', 'carbs', 'fat', 'fibre'] as const;
const MACROS_KCAL = ['kcal', 'protein', 'carbs', 'fat', 'fibre'] as const;

/* ───────── The per-type editor ───────── */

export function ConditionEditor({ condition: c, onChange, index, issues, event }: { condition: TriggerCondition; onChange: (c: TriggerCondition) => void; index: number; issues: Issue[]; event: TriggerEvent }) {
  const err = (k: string) => issuesAt(issues, ['conditions', index, k]);
  const bad = (k: string) => err(k).length > 0;
  const all = issuesAt(issues, ['conditions', index]);
  const errors = <IssueText messages={all} />;
  const lbl = (s: string) => `${CONDITION_LABELS[c.type]}: ${s}`;

  switch (c.type) {
    case 'meal_kcal':
    case 'item_kcal':
      return (
        <div className="flex flex-col gap-1.5">
          <Sentence>
            <Word>{c.type === 'meal_kcal' ? 'The meal total is' : 'Any single item is'}</Word>
            <OpSelect label={lbl('comparison')} value={c.op} onChange={(op) => onChange({ ...c, op })} />
            <Num label={lbl('calories')} value={c.value} onValue={(value) => onChange({ ...c, value })} min={0} max={10000} step={50} suffix="kcal" invalid={bad('value')} />
          </Sentence>
          {errors}
        </div>
      );
    case 'macro_amount':
      return (
        <div className="flex flex-col gap-1.5">
          <Sentence>
            <MacroSelect label={lbl('macro')} options={MACROS} value={c.macro} onChange={(macro) => onChange({ ...c, macro })} />
            <Word>in the meal is</Word>
            <OpSelect label={lbl('comparison')} value={c.op} onChange={(op) => onChange({ ...c, op })} />
            <Num label={lbl('grams')} value={c.grams} onValue={(grams) => onChange({ ...c, grams })} min={0} max={1000} suffix="g" invalid={bad('grams')} />
          </Sentence>
          {errors}
        </div>
      );
    case 'macro_percent':
      return (
        <div className="flex flex-col gap-1.5">
          <Sentence>
            <Word>The meal’s</Word>
            <MacroSelect label={lbl('macro')} options={MACROS} value={c.macro} onChange={(macro) => onChange({ ...c, macro })} />
            <Word>is</Word>
            <OpSelect label={lbl('comparison')} value={c.op} onChange={(op) => onChange({ ...c, op })} />
            <Num label={lbl('percent')} value={c.percent} onValue={(percent) => onChange({ ...c, percent })} min={0} max={1000} step={5} suffix="% of the daily target" invalid={bad('percent')} />
          </Sentence>
          {errors}
        </div>
      );
    case 'food_tags':
      return (
        <div className="flex flex-col gap-2">
          <Sentence>
            <Word>The meal has</Word>
            <Segmented size="sm" label={lbl('match')} value={c.match} onChange={(match) => onChange({ ...c, match })} options={[{ value: 'any', label: 'any of' }, { value: 'all', label: 'all of' }]} />
            <Word>these tags</Word>
          </Sentence>
          <ChipToggleGroup<FoodTag> label={lbl('food tags')} options={FOOD_TAGS.map((t) => ({ value: t, label: humanize(t) }))} value={c.tags} onChange={(tags) => onChange({ ...c, tags })} />
          {errors}
        </div>
      );
    case 'time_of_day':
      return (
        <div className="flex flex-col gap-1.5">
          <Sentence>
            <Word>Logged between</Word>
            <Input type="time" aria-label={lbl('from')} value={c.from} onChange={(e) => onChange({ ...c, from: e.target.value })} invalid={bad('from')} className="!w-[120px] font-mono !text-[13px]" />
            <Word>and</Word>
            <Input type="time" aria-label={lbl('to')} value={c.to} onChange={(e) => onChange({ ...c, to: e.target.value })} invalid={bad('to')} className="!w-[120px] font-mono !text-[13px]" />
            <Word>member-local time</Word>
          </Sentence>
          {c.from > c.to && !all.length && <span className="text-[12px] text-muted">Wraps past midnight ({c.from} to {c.to} next day).</span>}
          {errors}
        </div>
      );
    case 'count_this_week':
      return <CountThisWeekEditor c={c} onChange={onChange} lbl={lbl} bad={bad} errors={errors} />;
    case 'days_since_last_log':
      return (
        <div className="flex flex-col gap-1.5">
          <Sentence>
            <Word>Days since their previous log is</Word>
            <OpSelect label={lbl('comparison')} value={c.op} onChange={(op) => onChange({ ...c, op })} />
            <Num label={lbl('days')} value={c.days} onValue={(days) => onChange({ ...c, days })} min={0} max={365} suffix="days" invalid={bad('days')} />
          </Sentence>
          <span className="text-[12px] text-muted">Handy for “welcome back” moments.</span>
          {errors}
        </div>
      );
    case 'streak_milestone':
      return (
        <div className="flex flex-col gap-2">
          <Sentence>
            <Word>The</Word>
            <Select aria-label={lbl('streak')} value={c.kind} onChange={(e) => onChange({ ...c, kind: e.target.value as Of<'streak_milestone'>['kind'] })} className="w-[170px]">
              {[...STREAK_KINDS, 'team' as const].map((k) => (
                <option key={k} value={k}>
                  {STREAK_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
            <Word>reaches one of these day counts</Word>
          </Sentence>
          <ChipInput
            label={lbl('milestone days')}
            placeholder="e.g. 7, 30, 100"
            value={c.values.map(String)}
            onChange={(v) => onChange({ ...c, values: Array.from(new Set(v.map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0))).sort((a, b) => a - b) })}
            maxLength={5}
          />
          {all.length ? errors : <span className="text-[12px] text-muted">Whole days only. Press Enter after each number.</span>}
        </div>
      );
    case 'personal_record':
      return (
        <div className="flex flex-col gap-2">
          <Word>The member sets a new record for</Word>
          <ChipToggleGroup label={lbl('records')} options={PERSONAL_RECORDS.map((r) => ({ value: r, label: RECORD_LABELS[r] }))} value={c.records} onChange={(records) => onChange({ ...c, records })} />
          {errors}
        </div>
      );
    case 'message_contains':
      return <MessageContainsEditor c={c} onChange={onChange} lbl={lbl} errors={errors} event={event} />;
    case 'member_in_list':
      return (
        <div className="flex flex-col gap-2">
          <Word>The member is one of</Word>
          <MemberMultiSelect label={lbl('members')} value={c.userIds} onChange={(userIds) => onChange({ ...c, userIds })} maxHeight={180} />
          {errors}
        </div>
      );
    case 'macro_target_met_days':
      return (
        <div className="flex flex-col gap-1.5">
          <Sentence>
            <Word>The</Word>
            <MacroSelect label={lbl('target')} options={MACROS_KCAL} value={c.macro} onChange={(macro) => onChange({ ...c, macro })} />
            <Word>target was met</Word>
            <Num label={lbl('days')} value={c.days} onValue={(days) => onChange({ ...c, days })} min={1} max={60} suffix="days in a row" invalid={bad('days')} />
          </Sentence>
          {errors}
        </div>
      );
    case 'weight_change':
      return (
        <div className="flex flex-col gap-1.5">
          <Sentence>
            <Word>Weight went</Word>
            <Select aria-label={lbl('direction')} value={c.direction} onChange={(e) => onChange({ ...c, direction: e.target.value as 'down' | 'up' })} className="w-[100px]">
              <option value="down">down</option>
              <option value="up">up</option>
            </Select>
            <Word>by</Word>
            <Num label={lbl('kilograms')} value={c.kg} onValue={(kg) => onChange({ ...c, kg })} min={0} max={50} step={0.1} suffix="kg or more within" invalid={bad('kg')} />
            <Num label={lbl('days')} value={c.overDays} onValue={(overDays) => onChange({ ...c, overDays })} min={1} max={90} suffix="days" invalid={bad('overDays')} />
          </Sentence>
          {errors}
        </div>
      );
    case 'calorie_band':
      return (
        <div className="flex flex-col gap-2">
          <Word>The day ended</Word>
          <ChipToggleGroup label={lbl('bands')} options={(['green', 'under', 'over', 'red'] as const).map((b) => ({ value: b, label: BAND_LABELS[b] }))} value={c.bands} onChange={(bands) => onChange({ ...c, bands })} />
          {errors}
        </div>
      );
    case 'plan_item_completed':
    case 'streak_resumed':
    case 'team_all_logged':
    case 'not_on_vacation':
    case 'weight_new_low':
      return <p className="m-0 text-[13px] leading-relaxed text-muted">{NO_PARAM_TEXT[c.type]} Nothing to set here.</p>;
  }
}

function CountThisWeekEditor({ c, onChange, lbl, bad, errors }: { c: Of<'count_this_week'>; onChange: (c: TriggerCondition) => void; lbl: (s: string) => string; bad: (k: string) => boolean; errors: ReactNode }) {
  const types = useActivityTypes();
  const setWhat = (what: Of<'count_this_week'>['what']) => {
    const next: Of<'count_this_week'> = { type: c.type, what, op: c.op, value: c.value };
    if (what === 'food_tag') next.tag = c.tag ?? 'dessert';
    if (what === 'activity_type' && c.activityTypeId) next.activityTypeId = c.activityTypeId;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Sentence>
        <Word>This week, the number of</Word>
        <Select aria-label={lbl('what to count')} value={c.what} onChange={(e) => setWhat(e.target.value as Of<'count_this_week'>['what'])} className="w-[190px]">
          <option value="food_logs">food logs</option>
          <option value="activity_logs">activity logs</option>
          <option value="food_tag">meals with a food tag</option>
          <option value="activity_type">sessions of one activity</option>
        </Select>
        {c.what === 'food_tag' && (
          <Select aria-label={lbl('food tag')} value={c.tag ?? ''} onChange={(e) => onChange({ ...c, tag: (e.target.value || undefined) as FoodTag | undefined })} invalid={bad('tag')} className="w-[150px]">
            <option value="">Pick a tag</option>
            {FOOD_TAGS.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        )}
        {c.what === 'activity_type' && (
          <Select aria-label={lbl('activity')} value={c.activityTypeId ?? ''} onChange={(e) => onChange({ ...c, activityTypeId: e.target.value || undefined })} invalid={bad('activityTypeId')} disabled={types.isPending} className="w-[170px]">
            <option value="">{types.isPending ? 'Loading…' : types.isError ? 'Couldn’t load activities' : 'Pick an activity'}</option>
            {(types.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
        <Word>is</Word>
        <OpSelect label={lbl('comparison')} value={c.op} onChange={(op) => onChange({ ...c, op })} />
        <Num label={lbl('count')} value={c.value} onValue={(value) => onChange({ ...c, value })} min={0} max={1000} invalid={bad('value')} />
      </Sentence>
      <span className="text-[12px] text-muted">Weeks start on Monday.</span>
      {errors}
    </div>
  );
}

function MessageContainsEditor({ c, onChange, lbl, errors, event }: { c: Of<'message_contains'>; onChange: (c: TriggerCondition) => void; lbl: (s: string) => string; errors: ReactNode; event: TriggerEvent }) {
  const kw = useTeamKeywords(c.useTeamKeywords);
  const words = kw.data?.keywords ?? [];
  return (
    <div className="flex flex-col gap-2">
      <Word>The chat message contains any of these words</Word>
      <ChipInput label={lbl('words')} value={c.words} onChange={(w) => onChange({ ...c, words: w })} max={50} maxLength={40} placeholder="Type a word and press Enter" />
      <Checkbox label="Also use the team keyword list" hint="The shared list managed on Chat moderation." checked={c.useTeamKeywords} onChange={(e) => onChange({ ...c, useTeamKeywords: e.target.checked })} />
      {c.useTeamKeywords && (
        <div className="rounded-[10px] bg-bg px-3 py-2 text-[12px] leading-relaxed text-muted">
          {kw.isPending ? (
            'Loading the team keyword list…'
          ) : kw.isError ? (
            'Couldn’t load the team keyword list right now.'
          ) : words.length === 0 ? (
            <>
              The team keyword list is empty.{' '}
              <Link to="/chat" className="font-semibold text-accent hover:text-accent-dark">
                Add keywords
              </Link>
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">Team list ({words.length}):</span> {words.slice(0, 14).join(', ')}
              {words.length > 14 && `, +${words.length - 14} more`}.{' '}
              <Link to="/chat" className="font-semibold text-accent hover:text-accent-dark">
                Edit
              </Link>
            </>
          )}
        </div>
      )}
      {event !== 'chat_message_posted' && <span className="text-[12px] font-semibold text-under-fg">Only checked on chat messages. Set the event to “Chat message posted”.</span>}
      {errors}
    </div>
  );
}

/* ───────── "Add condition" menu ───────── */

export function AddConditionMenu({ onAdd, disabled, roast }: { onAdd: (t: TriggerConditionType) => void; disabled?: boolean; roast: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    const first = wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
    first?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    next?.focus();
  };

  return (
    <div ref={wrap} className="relative" onKeyDown={onKey}>
      <Button ref={btn} variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((o) => !o)}>
        Add condition
      </Button>
      {open && (
        <div id={menuId} role="menu" aria-label="Condition types" className="absolute left-0 top-[calc(100%+6px)] z-30 flex max-h-[360px] w-[min(320px,calc(100vw-64px))] flex-col gap-2 overflow-y-auto rounded-[16px] border border-border bg-white p-2 shadow-[0_20px_60px_rgba(23,23,28,0.14)]">
          {CONDITION_GROUPS.map((g) => (
            <div key={g.label} role="group" aria-label={g.label} className="flex flex-col">
              <span className="th px-2.5 pb-1 pt-1.5">{g.label}</span>
              {g.types.map((t) => {
                const blocked = roast && ROAST_FORBIDDEN_CONDITIONS.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAdd(t);
                      setOpen(false);
                      btn.current?.focus();
                    }}
                    className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium outline-none hover:bg-bg focus-visible:bg-accent-tint/50"
                  >
                    {CONDITION_LABELS[t]}
                    {blocked && <span className="shrink-0 text-[11px] font-semibold text-accent-dark">not with roasts</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
