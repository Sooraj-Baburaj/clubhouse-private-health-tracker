import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  GitCompare,
  Heart,
  Plus,
  ThumbsDown,
  Utensils,
} from 'lucide-react';
import { useState } from 'react';
import type { AdminDietOption, AdminDietPlan, DayType, MealSlot } from '@clubhouse/contracts';
import { useDietDiff, useDietFeedback } from '@/features/diets';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime, fmtInt, fmtNum, fmtPct, plural } from '@/lib/format';
import {
  AiChip,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  KpiCard,
  KpiGrid,
  Mono,
  Pill,
  ProgressBar,
  QueryView,
  RowAction,
  Segmented,
  SkeletonCard,
  StatusPill,
  type Column,
} from '@/ui';
import {
  DAY_TYPE_LABEL,
  macroText,
  MacroLine,
  MEAL_SLOTS,
  NUTRIENT_KEYS,
  NutrientBand,
} from './shared';

/* ───────── Slot section + option cards ───────── */

export function SlotSection({
  slot,
  label,
  options,
  plan,
  editable,
  onOpen,
  onAdd,
  review,
}: {
  slot: MealSlot;
  label: string;
  options: AdminDietOption[];
  plan: AdminDietPlan;
  editable: boolean;
  onOpen: (optionId: string) => void;
  onAdd: (slot: MealSlot) => void;
  review: { reviewed: boolean; pending: boolean; onMark: () => void } | null;
}) {
  const kcals = options.map((o) => o.nutrition.kcal);
  const range = kcals.length
    ? Math.min(...kcals) === Math.max(...kcals)
      ? `${fmtInt(kcals[0])} kcal`
      : `${fmtInt(Math.min(...kcals))}–${fmtInt(Math.max(...kcals))} kcal`
    : 'No options yet';
  const full = options.length >= 5;
  const sorted = [...options].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <Card id={`slot-${slot}`} className="scroll-mt-4" aria-labelledby={`slot-h-${slot}`}>
      <CardHeader
        id={`slot-h-${slot}`}
        title={
          <>
            {label}
            {review &&
              (review.reviewed ? (
                <Pill tone="in" icon={<CheckCircle2 aria-hidden className="h-3 w-3" />}>
                  Reviewed
                </Pill>
              ) : (
                <Pill tone="ai">Needs review</Pill>
              ))}
          </>
        }
        aside={
          <span className="font-mono text-[12px]">
            {plural(options.length, 'option')} · {range}
          </span>
        }
        actions={
          <>
            {review && !review.reviewed && editable && (
              <Button
                size="sm"
                variant="secondary"
                loading={review.pending}
                onClick={review.onMark}
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              >
                Mark reviewed
              </Button>
            )}
            {editable && (
              <span title={full ? '5 options per slot at most' : undefined}>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  disabled={full}
                  onClick={() => onAdd(slot)}
                >
                  Option
                </Button>
              </span>
            )}
          </>
        }
      />
      {options.length < 2 && (
        <p className="m-0 flex items-center gap-1.5 rounded-[10px] bg-under-bg px-3 py-2 text-[12px] font-semibold text-under-fg">
          <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {options.length === 0
            ? 'No options yet. Add at least 2 so members have a choice.'
            : 'Only 1 option. Add at least one more so members have a choice.'}
        </p>
      )}
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(230px, 100%), 1fr))' }}
      >
        {sorted.map((o) => (
          <OptionCard
            key={o.id}
            option={o}
            showFeedback={!!plan.userId}
            onOpen={() => onOpen(o.id)}
          />
        ))}
        {editable && !full && (
          <button
            type="button"
            onClick={() => onAdd(slot)}
            className="flex min-h-[112px] flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-border text-[13px] font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Add option
            <span className="text-[11px] font-normal">{5 - options.length} more allowed</span>
          </button>
        )}
      </div>
    </Card>
  );
}

function itemsSummary(o: AdminDietOption): string {
  const parts = o.items
    .slice(0, 3)
    .map(
      (i) =>
        `${i.name} ${i.servingLabel && i.servings ? `${fmtNum(i.servings, 2)} × ${i.servingLabel}` : `${fmtNum(i.grams, 0)} g`}`,
    );
  return parts.join(', ') + (o.items.length > 3 ? ` +${o.items.length - 3} more` : '');
}

function OptionCard({
  option: o,
  showFeedback,
  onOpen,
}: {
  option: AdminDietOption;
  showFeedback: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-0 flex-col gap-2 rounded-[14px] border border-hairline bg-bg/60 p-3 text-left transition-colors hover:border-accent-border hover:bg-white focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-hairline">
          {o.imageUrl ? (
            <img src={o.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <Utensils aria-hidden className="h-4 w-4 text-muted" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-[14px] font-semibold leading-snug group-hover:text-accent-dark">
            {o.name}
          </span>
          <MacroLine n={o.nutrition} className="text-[11px]" />
        </span>
      </div>
      <span className="line-clamp-2 text-[12px] leading-snug text-muted">
        {o.items.length ? itemsSummary(o) : 'No items'}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        {o.dayType !== 'any' && <Pill tone="outline">{DAY_TYPE_LABEL[o.dayType]}</Pill>}
        {o.aiEstimateItems > 0 && (
          <Pill
            tone="ai"
            icon={<AlertTriangle aria-hidden className="h-3 w-3" />}
            title="AI feature: diet.draft"
          >
            {plural(o.aiEstimateItems, 'estimate')}
          </Pill>
        )}
        {o.aiEstimateItems > 0 && <AiChip feature="diet.draft" />}
        {showFeedback && (
          <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted">
            <span className="inline-flex items-center gap-0.5" title={`${o.favourites} favourites`}>
              <Heart aria-hidden className="h-3 w-3" />
              <span className="sr-only">Favourites</span>
              {o.favourites}
            </span>
            <span className="inline-flex items-center gap-0.5" title={`${o.dislikes} “not for me”`}>
              <ThumbsDown aria-hidden className="h-3 w-3" />
              <span className="sr-only">Dislikes</span>
              {o.dislikes}
            </span>
            <span title={`Logged ${o.timesLogged} times`}>{o.timesLogged}× logged</span>
          </span>
        )}
      </span>
    </button>
  );
}

/* ───────── AI review checklist ───────── */

export function ReviewChecklist({
  plan,
  labels,
  onGo,
}: {
  plan: AdminDietPlan;
  labels: Record<MealSlot, string>;
  onGo: (slot: MealSlot) => void;
}) {
  const done = MEAL_SLOTS.filter((s) => plan.reviewChecklist[s]).length;
  return (
    <Card className="border-[rgba(182,49,108,0.25)]">
      <CardHeader
        eyebrow="Required before publishing"
        title={
          <>
            Review the AI draft <AiChip feature="diet.draft" />
          </>
        }
        aside={`${done} of ${MEAL_SLOTS.length} slots reviewed`}
      />
      <ProgressBar value={done / MEAL_SLOTS.length} label="Slots reviewed" />
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        Open an option in each slot (or press “Mark reviewed” on the slot) after checking the
        portions and any AI-estimate items.
      </p>
      <ul
        className="m-0 grid list-none gap-1.5 p-0"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))' }}
      >
        {MEAL_SLOTS.map((s) => {
          const ok = !!plan.reviewChecklist[s];
          const est = plan.options
            .filter((o) => o.mealSlot === s)
            .reduce((a, o) => a + o.aiEstimateItems, 0);
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => onGo(s)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[10px] border px-3 py-2 text-left text-[13px] transition-colors hover:border-accent',
                  ok ? 'border-transparent bg-in-bg text-in-fg' : 'border-border bg-white',
                )}
              >
                {ok ? (
                  <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
                ) : (
                  <Circle aria-hidden className="h-4 w-4 shrink-0 text-muted" />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{labels[s]}</span>
                  <span className={cn('text-[11px]', ok ? '' : 'text-muted')}>
                    {ok
                      ? 'Reviewed'
                      : est
                        ? `${plural(est, 'estimate')} to check`
                        : 'Not opened yet'}
                  </span>
                </span>
                <span className="sr-only">{ok ? '(reviewed)' : '(not reviewed, go to slot)'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ───────── Day totals ───────── */

export function DayTotalsCard({ plan }: { plan: AdminDietPlan }) {
  const t = plan.targets;
  return (
    <Card>
      <CardHeader title="Day totals" aside={t ? `Target ${fmtInt(t.kcal)} kcal` : 'No targets'} />
      {plan.dayTotals.length === 0 ? (
        <span className="text-[13px] text-muted">Add options to see how a day adds up.</span>
      ) : (
        <div className="flex flex-col gap-3">
          {plan.dayTotals.map((d) => (
            <div
              key={d.dayType}
              className="flex flex-col gap-1.5 border-t border-hairline pt-3 first:border-t-0 first:pt-0"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold">{DAY_TYPE_LABEL[d.dayType]}</span>
                <span className="font-mono text-[13px] font-semibold">
                  {fmtInt(d.totals.kcal)}
                  {t && <span className="font-normal text-muted"> / {fmtInt(t.kcal)}</span>} kcal
                </span>
              </div>
              <span className="font-mono text-[11px] text-muted">{macroText(d.totals, true)}</span>
              {Object.keys(d.bands).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {NUTRIENT_KEYS.filter((k) => d.bands[k]).map((k) => (
                    <NutrientBand key={k} nutrient={k} band={d.bands[k]!} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {t && (
        <span className="text-[11px] text-muted">
          Targets: {fmtInt(t.kcal)} kcal · {macroText(t, true)} g
        </span>
      )}
    </Card>
  );
}

/* ───────── Phone preview ───────── */

export function PhonePreview({
  plan,
  labels,
}: {
  plan: AdminDietPlan;
  labels: Record<MealSlot, string>;
}) {
  const hasVariants = plan.options.some((o) => o.dayType !== 'any');
  const [day, setDay] = useState<Exclude<DayType, 'any'>>('training');
  const visible = plan.options.filter(
    (o) => o.dayType === 'any' || !hasVariants || o.dayType === day,
  );
  return (
    <Card>
      <CardHeader title="Member preview" aside="How the Diet tab looks" />
      {hasVariants && (
        <Segmented
          size="sm"
          label="Preview day type"
          options={[
            { value: 'training', label: 'Training day' },
            { value: 'rest', label: 'Rest day' },
          ]}
          value={day}
          onChange={setDay}
          className="self-center"
        />
      )}
      <div
        className="mx-auto w-[320px] max-w-full rounded-[44px] border-[10px] border-ink bg-ink shadow-[0_24px_60px_rgba(23,23,28,0.18)]"
        aria-label="Phone preview of the member's Diet tab"
        role="img"
      >
        <div
          className="relative h-[600px] overflow-y-auto rounded-[34px] bg-bg [scrollbar-width:none]"
          aria-hidden
        >
          <div className="sticky top-0 z-10 flex justify-center bg-bg/90 pb-1 pt-2 backdrop-blur">
            <span className="h-[22px] w-[92px] rounded-full bg-ink" />
          </div>
          <div className="flex flex-col gap-3 px-4 pb-6 pt-2">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
                {plan.name} · set by your admin
              </span>
              <span className="font-display text-[24px] font-extrabold leading-none tracking-[-0.04em]">
                Pick your plates
              </span>
              {plan.aiGenerated && (
                <span className="flex items-center gap-1 text-[10px] text-muted">
                  <AiChip feature="diet.draft" />{' '}
                  {plan.reviewedBy ? `Reviewed by ${plan.reviewedBy.name}` : 'Drafted with AI'}
                </span>
              )}
              {plan.note && (
                <span className="mt-1 rounded-[12px] bg-accent-tint px-2.5 py-1.5 text-[11px] leading-snug text-accent-dark">
                  {plan.note}
                </span>
              )}
            </div>
            {MEAL_SLOTS.map((s) => {
              const opts = visible
                .filter((o) => o.mealSlot === s)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              return (
                <div
                  key={s}
                  className="flex flex-col gap-1.5 rounded-[18px] border border-hairline bg-white p-3"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-bold">{labels[s]}</span>
                    <span className="text-[10px] text-muted">{plural(opts.length, 'option')}</span>
                  </div>
                  {opts.length === 0 ? (
                    <span className="text-[11px] text-muted">No options yet</span>
                  ) : (
                    opts.map((o, i) => (
                      <div
                        key={o.id}
                        className="flex items-start gap-2 border-t border-hairline pt-1.5 first-of-type:border-t-0"
                      >
                        <span
                          className={cn(
                            'mt-[3px] h-3 w-3 shrink-0 rounded-full border-2',
                            i === 0 ? 'border-accent bg-accent' : 'border-border',
                          )}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[12px] font-semibold">{o.name}</span>
                            <span className="shrink-0 font-mono text-[10px]">
                              {fmtInt(o.nutrition.kcal)} kcal
                            </span>
                          </span>
                          <span className="line-clamp-2 text-[10px] leading-snug text-muted">
                            {o.items.map((it) => it.name).join(', ')}
                          </span>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ───────── Versions + diff ───────── */

type Version = AdminDietPlan['versions'][number];

export function VersionsPanel({
  plan,
  labels,
}: {
  plan: AdminDietPlan;
  labels: Record<MealSlot, string>;
}) {
  const [compare, setCompare] = useState<string | null>(null);
  const diff = useDietDiff(plan.id, compare);
  const other = plan.versions.find((v) => v.id === compare);
  const slotName = (s: string) => labels[s as MealSlot] ?? s;
  const columns: Column<Version>[] = [
    {
      id: 'v',
      header: 'Version',
      width: '90px',
      sortValue: (v) => v.version,
      cell: (v) => <Mono className="font-semibold">v{v.version}</Mono>,
    },
    {
      id: 'status',
      header: 'Status',
      width: 'minmax(150px,1fr)',
      sortValue: (v) => v.status,
      cell: (v) => (
        <span className="flex items-center gap-1.5">
          <StatusPill status={v.status} />
          {v.id === plan.id && <Pill tone="outline">This one</Pill>}
        </span>
      ),
    },
    {
      id: 'pub',
      header: 'Published',
      width: '130px',
      sortValue: (v) => v.publishedAt,
      cell: (v) => (
        <span className="text-[13px] text-muted" title={fmtDateTime(v.publishedAt)}>
          {fmtDate(v.publishedAt)}
        </span>
      ),
    },
    {
      id: 'ai',
      header: 'Source',
      width: '100px',
      sortValue: (v) => v.aiGenerated,
      cell: (v) =>
        v.aiGenerated ? (
          <AiChip feature="diet.draft" label="AI draft" />
        ) : (
          <span className="text-[13px] text-muted">By hand</span>
        ),
    },
    {
      id: 'act',
      header: '',
      headerLabel: 'Actions',
      width: '160px',
      align: 'end',
      cell: (v) =>
        v.id === plan.id ? null : (
          <span className="flex justify-end gap-2">
            <RowAction
              tone="ink"
              onClick={() => setCompare(v.id)}
              label={`Compare with v${v.version}`}
            >
              Compare
            </RowAction>
            <Link
              to="/diets/$planId"
              params={{ planId: v.id }}
              className="rounded-md px-1 py-0.5 text-[13px] font-semibold text-accent hover:text-accent-dark"
            >
              Open
            </Link>
          </span>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        label="Plan versions"
        columns={columns}
        rows={plan.versions}
        rowKey={(v) => v.id}
        minWidth={560}
        initialSort={{ id: 'v', dir: 'desc' }}
        search={{ placeholder: 'Search versions', text: (v) => `v${v.version} ${v.status}` }}
        filters={[
          {
            id: 'status',
            label: 'Status',
            options: [
              { value: '', label: 'All statuses' },
              { value: 'published', label: 'Published' },
              { value: 'draft', label: 'Draft' },
              { value: 'archived', label: 'Archived' },
            ],
            predicate: (v, s) => v.status === s,
          },
        ]}
        rowClassName={(v) =>
          v.id === compare ? 'bg-accent-tint/30' : v.id === plan.id && 'bg-bg/60'
        }
        empty={
          <EmptyState
            compact
            title="No other versions yet"
            body="Each publish creates a new version you can compare against."
          />
        }
      />
      {compare && (
        <Card>
          <CardHeader
            eyebrow="Compare"
            title={
              <span className="flex items-center gap-2">
                v{plan.version} <GitCompare aria-hidden className="h-4 w-4 text-muted" /> v
                {other?.version ?? '?'}
              </span>
            }
            actions={
              <Button size="sm" variant="secondary" onClick={() => setCompare(null)}>
                Close
              </Button>
            }
          />
          <QueryView
            query={diff}
            skeleton={<SkeletonCard lines={3} className="border-0 p-0" />}
            errorCompact
            isEmpty={(d) => !d.added.length && !d.removed.length && !d.changed.length}
            empty={
              <EmptyState
                compact
                title="No differences"
                body="Both versions have the same options."
              />
            }
          >
            {(d) => (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}
              >
                <DiffGroup
                  title="Added"
                  tone="in"
                  sign="+"
                  rows={d.added.map((a) => ({
                    key: `${a.slot}-${a.name}`,
                    slot: slotName(a.slot),
                    text: a.name,
                  }))}
                />
                <DiffGroup
                  title="Removed"
                  tone="over"
                  sign="−"
                  rows={d.removed.map((a) => ({
                    key: `${a.slot}-${a.name}`,
                    slot: slotName(a.slot),
                    text: a.name,
                  }))}
                />
                <DiffGroup
                  title="Changed"
                  tone="under"
                  sign="~"
                  rows={d.changed.map((c) => ({
                    key: `${c.slot}-${c.name}`,
                    slot: slotName(c.slot),
                    text: (
                      <>
                        <b>{c.name}</b>
                        <span className="flex flex-wrap items-center gap-1 text-[12px] text-muted">
                          <span className="line-through decoration-muted/50">{c.from}</span>
                          <ArrowRight aria-label="changed to" className="h-3 w-3" />
                          <span className="text-ink">{c.to}</span>
                        </span>
                      </>
                    ),
                  }))}
                />
              </div>
            )}
          </QueryView>
          <span className="text-[12px] text-muted">
            Changes are shown from v{other?.version ?? '?'} to this version (v{plan.version}).
          </span>
        </Card>
      )}
    </div>
  );
}

function DiffGroup({
  title,
  tone,
  sign,
  rows,
}: {
  title: string;
  tone: 'in' | 'over' | 'under';
  sign: string;
  rows: { key: string; slot: string; text: React.ReactNode }[];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-hairline p-3">
      <span className="flex items-center gap-2 text-[13px] font-semibold">
        <Pill tone={tone}>
          {sign} {title}
        </Pill>
        <span className="font-mono text-[12px] text-muted">{rows.length}</span>
      </span>
      {rows.length === 0 ? (
        <span className="text-[12px] text-muted">None</span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                {r.slot}
              </span>
              <span className="flex flex-col">{r.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────── Feedback ───────── */

type FeedbackRow = {
  name: string;
  slot: string;
  favourites: number;
  dislikes: number;
  timesLogged: number;
};

export function FeedbackPanel({
  plan,
  labels,
}: {
  plan: AdminDietPlan;
  labels: Record<MealSlot, string>;
}) {
  const q = useDietFeedback(plan.userId);
  const slotName = (s: string) => labels[s as MealSlot] ?? s;
  const columns: Column<FeedbackRow>[] = [
    {
      id: 'name',
      header: 'Option',
      width: 'minmax(200px,1.6fr)',
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-semibold">{r.name}</span>,
    },
    {
      id: 'slot',
      header: 'Slot',
      width: '140px',
      sortValue: (r) => MEAL_SLOTS.indexOf(r.slot as MealSlot),
      cell: (r) => <span className="text-[13px] text-muted">{slotName(r.slot)}</span>,
    },
    {
      id: 'fav',
      header: 'Favourites',
      width: '110px',
      align: 'end',
      sortValue: (r) => r.favourites,
      cell: (r) => <Mono>{fmtInt(r.favourites)}</Mono>,
    },
    {
      id: 'dis',
      header: 'Not for me',
      width: '110px',
      align: 'end',
      sortValue: (r) => r.dislikes,
      cell: (r) => (
        <Mono className={r.dislikes > 0 ? 'text-accent-dark' : undefined}>
          {fmtInt(r.dislikes)}
        </Mono>
      ),
    },
    {
      id: 'log',
      header: 'Logged',
      width: '100px',
      align: 'end',
      sortValue: (r) => r.timesLogged,
      cell: (r) => <Mono>{fmtInt(r.timesLogged)}×</Mono>,
    },
  ];
  if (!plan.userId) return null;
  const d = q.data;
  const pct = d ? (d.adherence.pct <= 1 ? d.adherence.pct : d.adherence.pct / 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <KpiCard
          index={0}
          loading={q.isPending}
          label="Plan adherence"
          value={d ? fmtPct(pct, true) : undefined}
          sub={d && `Last ${plural(d.adherence.days, 'day')}`}
        />
        <KpiCard
          index={1}
          loading={q.isPending}
          label="Meals from the plan"
          value={d?.adherence.fromPlan}
          sub="Logged via “Log this”"
        />
        <KpiCard
          index={2}
          loading={q.isPending}
          label="Meals from elsewhere"
          value={d?.adherence.elsewhere}
          sub="Logged by search or photo"
        />
      </KpiGrid>
      {d && <ProgressBar value={pct} label="Share of meals logged from the plan" />}
      <DataTable
        label="Option feedback"
        columns={columns}
        rows={d?.options}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(r) => `${r.slot}-${r.name}`}
        minWidth={640}
        initialSort={{ id: 'log', dir: 'desc' }}
        search={{ placeholder: 'Search options', text: (r) => `${r.name} ${slotName(r.slot)}` }}
        filters={[
          {
            id: 'slot',
            label: 'Slot',
            options: [
              { value: '', label: 'All slots' },
              ...MEAL_SLOTS.map((s) => ({ value: s, label: labels[s] })),
            ],
            predicate: (r, v) => r.slot === v,
          },
          {
            id: 'signal',
            label: 'Signal',
            options: [
              { value: '', label: 'Any feedback' },
              { value: 'fav', label: 'Has favourites' },
              { value: 'dis', label: 'Has “not for me”' },
              { value: 'never', label: 'Never logged' },
            ],
            predicate: (r, v) =>
              v === 'fav' ? r.favourites > 0 : v === 'dis' ? r.dislikes > 0 : r.timesLogged === 0,
          },
        ]}
        empty={
          <EmptyState
            compact
            title="No feedback yet"
            body="Favourites, “not for me” and logs show up once the member uses the plan."
          />
        }
      />
    </div>
  );
}
