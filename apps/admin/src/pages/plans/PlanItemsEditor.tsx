import {
  Activity,
  Bike,
  CircleDot,
  Dumbbell,
  Feather,
  Flame,
  Flower2,
  Footprints,
  Mountain,
  Music,
  Plus,
  Trash2,
  TrendingUp,
  Trophy,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityTypeDto, PlanItemDto } from '@clubhouse/contracts';
import { PlanItemInput } from '@clubhouse/contracts';
import type { z } from 'zod';
import { useActivityTypes } from '@/features/directory';
import { cn } from '@/lib/cn';
import {
  Button,
  DayPicker,
  Field,
  FormGrid,
  IconButton,
  Input,
  NumberInput,
  Segmented,
  Select,
  Skeleton,
} from '@/ui';

export const MAX_ITEMS = 12;

const ICONS: Record<string, LucideIcon> = {
  footprints: Footprints,
  bike: Bike,
  waves: Waves,
  dumbbell: Dumbbell,
  flower: Flower2,
  mountain: Mountain,
  trophy: Trophy,
  feather: Feather,
  music: Music,
  zap: Zap,
  'trending-up': TrendingUp,
  flame: Flame,
  'circle-dot': CircleDot,
  activity: Activity,
};

/** Activity type icon (the API sends lucide icon names). */
export function ActivityIcon({
  icon,
  className = 'h-4 w-4',
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  const I = (icon && ICONS[icon]) || Activity;
  return <I aria-hidden className={className} strokeWidth={2.25} />;
}

export interface ItemDraft {
  key: string;
  id?: string;
  typeId: string;
  cadence: 'week' | 'month';
  count: number | null;
  targetMin: number | null;
  note: string;
  suggestedDays: number[];
}

let seq = 0;
const newKey = () => `item-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function blankItem(typeId = ''): ItemDraft {
  return {
    key: newKey(),
    typeId,
    cadence: 'week',
    count: 3,
    targetMin: null,
    note: '',
    suggestedDays: [],
  };
}

export function draftFromDto(i: PlanItemDto): ItemDraft {
  return {
    key: i.itemId || newKey(),
    id: i.itemId || undefined,
    typeId: i.typeId,
    cadence: i.perWeek == null && i.perMonth != null ? 'month' : 'week',
    count: i.perWeek ?? i.perMonth ?? null,
    targetMin: i.targetMin,
    note: i.note ?? '',
    suggestedDays: [...(i.suggestedDays ?? [])].sort((a, b) => a - b),
  };
}

export function toInput(d: ItemDraft): z.input<typeof PlanItemInput> {
  return {
    ...(d.id ? { id: d.id } : {}),
    typeId: d.typeId,
    perWeek: d.cadence === 'week' ? d.count : null,
    perMonth: d.cadence === 'month' ? d.count : null,
    targetMin: d.targetMin,
    note: d.note.trim() || null,
    suggestedDays: d.suggestedDays,
  };
}

/** Error map keyed `${index}.${field}` (or `${index}` for item-level problems) from a zod issue list. */
export type ItemErrors = Record<string, string>;

const FRIENDLY: Record<string, string> = {
  typeId: 'Choose an activity',
  perWeek: 'Use 1–14 times per week',
  perMonth: 'Use 1–31 times per month',
  targetMin: 'Use 5–600 minutes, or leave it empty',
  note: 'Keep the note under 200 characters',
  suggestedDays: 'Pick up to 7 days',
};

export function itemErrorsFrom(
  issues: readonly { path: PropertyKey[]; message: string }[],
  prefix: PropertyKey = 'items',
): { items: ItemErrors; other: Record<string, string> } {
  const items: ItemErrors = {};
  const other: Record<string, string> = {};
  for (const iss of issues) {
    const [head, idx, field] = iss.path;
    if (head === prefix && typeof idx === 'number') {
      const f = typeof field === 'string' ? field : null;
      const k = f ? `${idx}.${f === 'perMonth' ? 'perWeek' : f}` : `${idx}.perWeek`;
      if (!items[k]) items[k] = f ? (FRIENDLY[f] ?? iss.message) : iss.message;
    } else if (head === prefix) {
      if (!other.items)
        other.items =
          iss.message.includes('12') || iss.message.toLowerCase().includes('big')
            ? `Up to ${MAX_ITEMS} activities`
            : 'Add at least one activity';
    } else if (typeof head === 'string' && !other[head]) other[head] = iss.message;
  }
  return { items, other };
}

/** Short text for a plan item: "Gym 3×/wk". */
export function itemSummary(i: {
  typeName: string;
  perWeek: number | null;
  perMonth: number | null;
}): string {
  if (i.perWeek != null) return `${i.typeName} ${i.perWeek}×/wk`;
  if (i.perMonth != null) return `${i.typeName} ${i.perMonth}×/mo`;
  return i.typeName;
}

/** Items editor shared by the plan editor and "Assign plan": one card per activity, add/remove (max 12). */
export function PlanItemsEditor({
  items,
  onChange,
  errors,
  disabled,
}: {
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
  errors: ItemErrors;
  disabled?: boolean;
}) {
  const types = useActivityTypes();
  const list: ActivityTypeDto[] = types.data ?? [];
  const byId = new Map(list.map((t) => [t.id, t]));
  const update = (key: string, patch: Partial<ItemDraft>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  if (types.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-24 rounded-[14px]" />
        <Skeleton className="h-24 rounded-[14px]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {types.isError && (
        <p className="m-0 text-[13px] font-semibold text-accent-dark">
          Couldn’t load activity types. Reload the page to try again.
        </p>
      )}
      {items.length === 0 && (
        <div className="rounded-[14px] border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted">
          No activities yet. Add one to build the plan.
        </div>
      )}
      {items.map((it, idx) => {
        const type = byId.get(it.typeId);
        const err = (f: string) => errors[`${idx}.${f}`];
        return (
          <fieldset
            key={it.key}
            disabled={disabled}
            className={cn(
              'm-0 flex min-w-0 flex-col gap-3 rounded-[14px] border bg-white p-3.5',
              Object.keys(errors).some((k) => k.startsWith(`${idx}.`))
                ? 'border-accent-border'
                : 'border-hairline',
            )}
          >
            <legend className="sr-only">Activity {idx + 1}</legend>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-[14px] font-semibold">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-tint text-accent-dark">
                  <ActivityIcon icon={type?.icon} />
                </span>
                <span className="truncate">{type?.name ?? `Activity ${idx + 1}`}</span>
              </span>
              <IconButton
                label={`Remove ${type?.name ?? `activity ${idx + 1}`}`}
                size={32}
                onClick={() => onChange(items.filter((i) => i.key !== it.key))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
            <FormGrid min={200}>
              <Field label="Activity" error={err('typeId')} required>
                <Select
                  value={it.typeId}
                  invalid={!!err('typeId')}
                  onChange={(e) => update(it.key, { typeId: e.target.value })}
                >
                  <option value="">Choose an activity</option>
                  {list.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field as="div" label="How often" error={err('perWeek')} required>
                <div className="flex flex-wrap items-center gap-2">
                  <NumberInput
                    aria-label={`Times per ${it.cadence}`}
                    className="!w-[68px] shrink-0"
                    min={1}
                    max={it.cadence === 'week' ? 14 : 31}
                    step={1}
                    value={it.count}
                    invalid={!!err('perWeek')}
                    onValue={(v) => update(it.key, { count: v == null ? null : Math.round(v) })}
                  />
                  <Segmented
                    size="sm"
                    label="Per week or per month"
                    value={it.cadence}
                    onChange={(cadence) => update(it.key, { cadence })}
                    options={[
                      { value: 'week', label: '/ week' },
                      { value: 'month', label: '/ month' },
                    ]}
                  />
                </div>
              </Field>
              <Field label="Target minutes" hint="Optional, per session" error={err('targetMin')}>
                <NumberInput
                  min={5}
                  max={600}
                  step={5}
                  placeholder="e.g. 45"
                  value={it.targetMin}
                  invalid={!!err('targetMin')}
                  onValue={(v) => update(it.key, { targetMin: v == null ? null : Math.round(v) })}
                />
              </Field>
              <Field
                label="Note"
                hint={
                  it.note.length > 150 ? `${it.note.length}/200` : 'Optional, shown to the member'
                }
                error={err('note')}
              >
                <Input
                  value={it.note}
                  maxLength={200}
                  placeholder="e.g. Legs on one of these"
                  invalid={!!err('note')}
                  onChange={(e) => update(it.key, { note: e.target.value })}
                />
              </Field>
            </FormGrid>
            <Field
              as="div"
              label="Suggested days"
              hint="Optional. Members pick their own days; these are just a nudge."
              error={err('suggestedDays')}
            >
              <DayPicker
                label="Suggested days"
                value={it.suggestedDays}
                onChange={(d) => update(it.key, { suggestedDays: d })}
                disabled={disabled}
              />
            </Field>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          disabled={disabled || items.length >= MAX_ITEMS}
          onClick={() => onChange([...items, blankItem()])}
        >
          Add activity
        </Button>
        <span className="font-mono text-[11px] text-muted">
          {items.length} / {MAX_ITEMS}
        </span>
      </div>
    </div>
  );
}
