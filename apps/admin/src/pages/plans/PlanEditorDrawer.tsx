import { useState } from 'react';
import type { AdminPlanRow, PersonRef } from '@clubhouse/contracts';
import { UpsertPlanRequest } from '@clubhouse/contracts';
import { usePlan, useUpsertPlan, type PlanDetail } from '@/features/plans';
import { fmtDate, fmtPct, WEEKDAY_SHORT } from '@/lib/format';
import {
  BarChart,
  Button,
  confirmAction,
  DayChips,
  DrawerPanel,
  ErrorState,
  Field,
  Inset,
  PersonCell,
  Skeleton,
  Textarea,
} from '@/ui';
import {
  draftFromDto,
  itemErrorsFrom,
  PlanItemsEditor,
  toInput,
  type ItemDraft,
  type ItemErrors,
} from './PlanItemsEditor';

/** Plan editor drawer: adherence (12 weeks), usual days, note and items. Opens from a row or `?member=`. */
export function PlanEditorDrawer({
  userId,
  row,
  person,
  onClose,
}: {
  userId: string | null;
  row: AdminPlanRow | undefined;
  person: PersonRef | null;
  onClose: () => void;
}) {
  const q = usePlan(userId);
  const open = !!userId;
  const formId = 'plan-editor-form';
  const upsert = useUpsertPlan();
  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Activity plan"
      title={person?.name ?? 'Member plan'}
      subtitle={
        row
          ? row.items.length
            ? `This week ${row.done} of ${row.planned} done`
            : 'No plan yet'
          : undefined
      }
      footer={
        q.data ? (
          <>
            <span className="text-[12px] text-muted">The member is notified when you save.</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={upsert.isPending}>
                Cancel
              </Button>
              <Button type="submit" form={formId} loading={upsert.isPending}>
                Save plan
              </Button>
            </div>
          </>
        ) : undefined
      }
    >
      {q.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[150px] rounded-[14px]" />
          <Skeleton className="h-20 rounded-[14px]" />
          <Skeleton className="h-40 rounded-[14px]" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : userId ? (
        <PlanEditorBody
          key={userId}
          userId={userId}
          data={q.data}
          person={person}
          formId={formId}
          upsert={upsert}
          onSaved={onClose}
        />
      ) : null}
    </DrawerPanel>
  );
}

function PlanEditorBody({
  userId,
  data,
  person,
  formId,
  upsert,
  onSaved,
}: {
  userId: string;
  data: PlanDetail;
  person: PersonRef | null;
  formId: string;
  upsert: ReturnType<typeof useUpsertPlan>;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(data.note ?? '');
  const [items, setItems] = useState<ItemDraft[]>(() => data.items.map(draftFromDto));
  const [errors, setErrors] = useState<ItemErrors>({});
  const [noteError, setNoteError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { note: note.trim() || null, items: items.map(toInput) };
    const parsed = UpsertPlanRequest.safeParse(body);
    if (!parsed.success) {
      const { items: ie, other } = itemErrorsFrom(parsed.error.issues);
      setErrors(ie);
      setNoteError(other.note ? 'Keep the note under 300 characters' : null);
      return;
    }
    setErrors({});
    setNoteError(null);
    if (items.length === 0 && data.items.length > 0) {
      const ok = await confirmAction({
        title: 'Remove this plan?',
        body: `${person?.name ?? 'This member'} will have no expected activities. Their logged activity stays as it is.`,
        impact: [
          `${data.items.length} ${data.items.length === 1 ? 'activity' : 'activities'} removed from the plan`,
        ],
        confirmLabel: 'Remove plan',
        onConfirm: () => upsert.mutateAsync({ userId, body: parsed.data }),
      });
      if (ok !== null) onSaved();
      return;
    }
    upsert.mutate({ userId, body: parsed.data }, { onSuccess: onSaved });
  };

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {person && (
        <PersonCell
          person={person}
          sub={
            data.items.length
              ? `${data.items.length} ${data.items.length === 1 ? 'activity' : 'activities'} in the plan`
              : 'No plan yet'
          }
        />
      )}
      <Adherence data={data} />
      <Field label="Note to the member" hint={`Optional. ${note.length}/300`} error={noteError}>
        <Textarea
          rows={2}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Two strength days, the rest is up to you."
          invalid={!!noteError}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">Expected activities</span>
        <PlanItemsEditor
          items={items}
          onChange={setItems}
          errors={errors}
          disabled={upsert.isPending}
        />
      </div>
    </form>
  );
}

function Adherence({ data }: { data: PlanDetail }) {
  const weeks = [...data.weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-12);
  const planned = weeks.filter((w) => w.planned > 0);
  const hit = planned.filter((w) => w.done >= w.planned).length;
  const avg = planned.length
    ? planned.reduce((s, w) => s + Math.min(1, w.done / w.planned), 0) / planned.length
    : null;
  const usual = [...data.usualDays].sort((a, b) => a - b);
  return (
    <Inset className="gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold">Last 12 weeks</span>
        <span className="font-mono text-[12px] text-muted">
          {planned.length
            ? `plan met ${hit} of ${planned.length} weeks · avg ${fmtPct(avg, true)}`
            : 'no planned weeks yet'}
        </span>
      </div>
      {weeks.length ? (
        <BarChart
          label={`Weekly adherence over ${weeks.length} weeks: plan met in ${hit} of ${planned.length} planned weeks`}
          height={96}
          data={weeks.map((w) => ({
            label: fmtDate(w.weekStart),
            value: w.planned > 0 ? Math.min(150, (w.done / w.planned) * 100) : 0,
            title: `Week of ${fmtDate(w.weekStart)}: ${w.done} of ${w.planned} done`,
          }))}
          cap={{ value: 100, label: 'plan' }}
          format={(n) => `${Math.round(n)}%`}
        />
      ) : (
        <span className="text-[13px] text-muted">
          No history yet. Bars appear once the member has a planned week.
        </span>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
        <span className="text-[13px] text-muted">
          {usual.length
            ? `Usually active on ${usual.map((d) => WEEKDAY_SHORT[d]).join(', ')}`
            : 'No usual days yet'}
        </span>
        <DayChips
          days={[0, 1, 2, 3, 4, 5, 6].map((d) => ({
            weekday: d,
            state: usual.includes(d) ? 'planned' : 'none',
          }))}
        />
      </div>
    </Inset>
  );
}
