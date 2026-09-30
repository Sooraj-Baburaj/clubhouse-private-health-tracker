import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AI_MODELS, AiBudgetUpdate, AiPricingRow, AiRetentionUpdate, type AdminAiResponse } from '@clubhouse/contracts';
import { useAddAiPricing, useSaveAiBudget, useSaveAiRetention, type AiPricingInput } from '@/features/ai';
import { fmtDate, fmtUsd, todayLocal } from '@/lib/format';
import { AiChip, Button, Card, CardHeader, confirmAction, DataTable, EmptyState, Field, FormGrid, Input, KeyValues, Mono, NumberInput, Pill, SectionTag, Segmented, type Column } from '@/ui';
import { ReadOnlyNote } from './aiShared';

type Errors = Record<string, string>;

function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? '_');
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/* ───────── Budget & model ───────── */

/** Monthly cap, alert threshold and at-cap behaviour. Super admins edit; admins read. Remount (key) on server change. */
export function BudgetCard({ data: d, isSuper }: { data: AdminAiResponse; isSuper: boolean }) {
  const save = useSaveAiBudget();
  const [cap, setCap] = useState<number | null>(d.budget.monthlyCapUsd);
  const [alertAt, setAlertAt] = useState<number | null>(d.budget.alertAtPercent);
  const [behaviour, setBehaviour] = useState<'disable' | 'warn'>(d.budget.atCapBehaviour);
  const [errors, setErrors] = useState<Errors>({});
  const dirty = cap !== d.budget.monthlyCapUsd || alertAt !== d.budget.alertAtPercent || behaviour !== d.budget.atCapBehaviour;
  const projectedOver = cap != null && cap > 0 && d.projectedSpend > cap;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = AiBudgetUpdate.safeParse({ monthlyCapUsd: cap ?? undefined, alertAtPercent: alertAt ?? undefined, atCapBehaviour: behaviour });
    if (!parsed.success) {
      const errs = issuesToErrors(parsed.error.issues);
      if (errs.monthlyCapUsd) errs.monthlyCapUsd = 'Enter an amount from 0 to 10,000';
      if (errs.alertAtPercent) errs.alertAtPercent = 'Use a whole number from 10 to 100';
      setErrors(errs);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  return (
    <Card>
      <CardHeader
        title={
          <>
            Budget &amp; model <AiChip feature="all features" />
          </>
        }
        actions={<SectionTag>Super admin</SectionTag>}
      />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormGrid min={160}>
          <Field label="Monthly cap (USD)" error={errors.monthlyCapUsd} hint="0 to 10,000">
            <NumberInput value={cap} onValue={setCap} min={0} max={10000} step={0.01} disabled={!isSuper} invalid={!!errors.monthlyCapUsd} title="AI feature: all features" />
          </Field>
          <Field label="Alert at (%)" error={errors.alertAtPercent} hint="Admins are told at this share of the cap">
            <NumberInput value={alertAt} onValue={setAlertAt} min={10} max={100} step={5} disabled={!isSuper} invalid={!!errors.alertAtPercent} title="AI feature: all features" />
          </Field>
        </FormGrid>
        <Field as="div" label="When the cap is reached" hint={behaviour === 'disable' ? 'AI features switch to their logic-only fallbacks until the month resets.' : 'AI keeps running past the cap; admins get a warning.'}>
          {isSuper ? (
            <Segmented
              label="When the cap is reached"
              value={behaviour}
              onChange={setBehaviour}
              options={[
                { value: 'disable', label: 'Use fallbacks' },
                { value: 'warn', label: 'Warn only' },
              ]}
            />
          ) : (
            <span className="text-[14px] font-semibold">{behaviour === 'disable' ? 'Use fallbacks' : 'Warn only'}</span>
          )}
        </Field>
        <KeyValues
          items={[
            ['Spent so far', fmtUsd(d.monthSpend)],
            [
              'Projected',
              <span key="p" className={projectedOver ? 'text-accent-dark' : undefined}>
                {fmtUsd(d.projectedSpend)}
                {projectedOver && ' · over the cap at this pace'}
              </span>,
            ],
          ]}
        />
        {isSuper ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCap(d.budget.monthlyCapUsd);
                  setAlertAt(d.budget.alertAtPercent);
                  setBehaviour(d.budget.atCapBehaviour);
                  setErrors({});
                }}
              >
                Reset
              </Button>
            )}
            <Button type="submit" size="sm" loading={save.isPending} disabled={!dirty}>
              Save budget
            </Button>
          </div>
        ) : (
          <ReadOnlyNote />
        )}
      </form>
    </Card>
  );
}

/* ───────── Prompt retention ───────── */

export function RetentionCard({ days, isSuper }: { days: number; isSuper: boolean }) {
  const save = useSaveAiRetention();
  const [v, setV] = useState<number | null>(days);
  const [error, setError] = useState<string | null>(null);
  const dirty = v !== days;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = AiRetentionUpdate.safeParse({ promptRetentionDays: v ?? undefined });
    if (!parsed.success) {
      setError(v == null ? 'Enter a number of days' : 'Use a whole number from 0 to 90');
      return;
    }
    setError(null);
    const next = parsed.data.promptRetentionDays;
    if (next < days) {
      await confirmAction({
        title: next === 0 ? 'Stop keeping prompts?' : `Keep prompts for ${next} days?`,
        tone: 'danger',
        body: next === 0 ? 'New AI calls won’t store their prompt and response, and stored snapshots are removed at the next cleanup. The call log keeps tokens, cost and outcome.' : `Prompt snapshots older than ${next} days are removed at the next cleanup. The call log keeps tokens, cost and outcome.`,
        impact: [`Retention ${days} → ${next} days`],
        confirmLabel: 'Save retention',
        onConfirm: () => save.mutateAsync(next),
      });
      return;
    }
    save.mutate(next);
  };

  return (
    <Card>
      <CardHeader
        title={
          <>
            Prompt retention <AiChip feature="all features" />
          </>
        }
        actions={<SectionTag>Super admin</SectionTag>}
      />
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
        <Field label="Keep prompt snapshots for (days)" error={error} hint="0 means don’t keep them. Up to 90 days. Snapshots help debug odd results in the call log.">
          <NumberInput value={v} onValue={setV} min={0} max={90} step={1} disabled={!isSuper} invalid={!!error} title="AI feature: all features" />
        </Field>
        {isSuper ? (
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={save.isPending} disabled={!dirty}>
              Save retention
            </Button>
          </div>
        ) : (
          <ReadOnlyNote />
        )}
      </form>
    </Card>
  );
}

/* ───────── Pricing ───────── */

type PricingRow = AdminAiResponse['pricing'][number];

const PRICE_FIELDS = [
  { id: 'inputPerMtok', label: 'Input' },
  { id: 'outputPerMtok', label: 'Output' },
  { id: 'cacheReadPerMtok', label: 'Cache read' },
  { id: 'cacheWritePerMtok', label: 'Cache write' },
] as const;

function fmtPrice(n: number): string {
  return fmtUsd(n, n > 0 && n < 0.1 ? 3 : 2);
}

/** Prices per million tokens by model with an effective-from date. The newest row on or before today is the one in use. */
export function PricingCard({ data: d, isSuper }: { data: AdminAiResponse; isSuper: boolean }) {
  const [adding, setAdding] = useState(false);
  const today = todayLocal();
  const current = useMemo(() => {
    const best = new Map<string, string>();
    for (const r of d.pricing) if (r.effectiveFrom <= today && (best.get(r.model) ?? '') < r.effectiveFrom) best.set(r.model, r.effectiveFrom);
    return best;
  }, [d.pricing, today]);
  const models = Array.from(new Set(d.pricing.map((r) => r.model)));

  const columns: Column<PricingRow>[] = [
    {
      id: 'model',
      header: 'Model',
      width: 'minmax(180px,1.3fr)',
      sortValue: (r) => r.model,
      cell: (r) => (
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Mono>{r.model}</Mono>
          {current.get(r.model) === r.effectiveFrom ? <Pill tone="in">In use</Pill> : r.effectiveFrom > today ? <Pill tone="under">Scheduled</Pill> : null}
        </span>
      ),
    },
    { id: 'from', header: 'Effective from', width: '130px', sortValue: (r) => r.effectiveFrom, cell: (r) => <span className="text-[13px]">{fmtDate(r.effectiveFrom, { year: true })}</span> },
    ...PRICE_FIELDS.map<Column<PricingRow>>((f) => ({ id: f.id, header: f.label, headerLabel: `${f.label} per million tokens`, width: '100px', align: 'end', sortValue: (r) => r[f.id], cell: (r) => <Mono>{fmtPrice(r[f.id])}</Mono> })),
  ];

  return (
    <Card>
      <CardHeader
        title={
          <>
            Pricing <AiChip feature="all features" />
          </>
        }
        aside="USD per million tokens"
        actions={
          <>
            <SectionTag>Super admin</SectionTag>
            {isSuper && !adding && (
              <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>
                Add row
              </Button>
            )}
          </>
        }
      />
      <p className="m-0 text-[13px] leading-relaxed text-muted">Costs in the call log use the newest price on or before the call date. Add a row with a future date when prices change; old rows stay for history.</p>
      {isSuper && adding && <AddPricingForm onDone={() => setAdding(false)} />}
      <DataTable
        label="AI model pricing"
        columns={columns}
        rows={d.pricing}
        rowKey={(r) => `${r.model}:${r.effectiveFrom}`}
        minWidth={760}
        initialSort={{ id: 'from', dir: 'desc' }}
        search={{ placeholder: 'Search models', text: (r) => `${r.model} ${r.effectiveFrom}` }}
        filters={models.length > 1 ? [{ id: 'model', label: 'Model', options: [{ value: '', label: 'All models' }, ...models.map((m) => ({ value: m, label: m }))], predicate: (r, v) => r.model === v }] : undefined}
        empty={<EmptyState compact title="No pricing yet" body={isSuper ? 'Add a row so call costs can be worked out.' : 'A Super Admin needs to add prices so call costs can be worked out.'} />}
        hideCount
      />
    </Card>
  );
}

function AddPricingForm({ onDone }: { onDone: () => void }) {
  const add = useAddAiPricing();
  const [model, setModel] = useState<string>(AI_MODELS[0]);
  const [from, setFrom] = useState(todayLocal());
  const [prices, setPrices] = useState<Record<(typeof PRICE_FIELDS)[number]['id'], number | null>>({ inputPerMtok: null, outputPerMtok: null, cacheReadPerMtok: null, cacheWritePerMtok: null });
  const [errors, setErrors] = useState<Errors>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { model: model.trim(), effectiveFrom: from, ...Object.fromEntries(PRICE_FIELDS.map((f) => [f.id, prices[f.id] ?? undefined])) };
    const parsed = AiPricingRow.safeParse(body);
    if (!parsed.success) {
      const errs = issuesToErrors(parsed.error.issues);
      for (const f of PRICE_FIELDS) if (errs[f.id]) errs[f.id] = prices[f.id] == null ? 'Required' : 'Must be 0 or more';
      if (errs.effectiveFrom) errs.effectiveFrom = 'Pick a date';
      if (errs.model) errs.model = 'Enter a model name';
      setErrors(errs);
      return;
    }
    setErrors({});
    add.mutate(parsed.data satisfies AiPricingInput, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-[14px] border border-accent-border bg-accent-tint/25 p-4">
      <FormGrid min={180}>
        <Field label="Model" error={errors.model} required>
          <Input list="ai-model-options" value={model} onChange={(e) => setModel(e.target.value)} maxLength={60} className="font-mono text-[13px]" invalid={!!errors.model} data-autofocus />
        </Field>
        <Field label="Effective from" error={errors.effectiveFrom} required>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} invalid={!!errors.effectiveFrom} />
        </Field>
      </FormGrid>
      <datalist id="ai-model-options">
        {AI_MODELS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <FormGrid min={130}>
        {PRICE_FIELDS.map((f) => (
          <Field key={f.id} label={`${f.label} $/MTok`} error={errors[f.id]} required>
            <NumberInput value={prices[f.id]} onValue={(n) => setPrices((p) => ({ ...p, [f.id]: n }))} min={0} step={0.01} invalid={!!errors[f.id]} />
          </Field>
        ))}
      </FormGrid>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDone} disabled={add.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={add.isPending}>
          Add price
        </Button>
      </div>
    </form>
  );
}
