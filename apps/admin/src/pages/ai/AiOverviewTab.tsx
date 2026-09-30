import { Link } from '@tanstack/react-router';
import { Lightbulb, ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AI_MODELS, type AdminAiResponse } from '@clubhouse/contracts';
import { useUpdateAiFeature, type AiFeatureRow } from '@/features/ai';
import { cn } from '@/lib/cn';
import { fmtDate, fmtInt, fmtNum, fmtPct, fmtUsd } from '@/lib/format';
import { AiChip, BarChart, Card, CardHeader, DataTable, EmptyState, Grid, KpiCard, KpiGrid, MeterList, Mono, NumberInput, Pill, ProgressBar, Select, Toggle, type Column } from '@/ui';
import { BudgetCard, PricingCard, RetentionCard } from './AiSettingsCards';
import { ERROR_OUTCOMES, FeatureName, fmtRate, monthInfo, OutcomePill, SOFT_OUTCOMES } from './aiShared';

/** Overview tab: KPIs, feature switches, spend, budget, pricing, retention, outcomes and token efficiency. */
export function AiOverviewTab({ data: d, isSuper }: { data: AdminAiResponse; isSuper: boolean }) {
  const cap = d.budget.monthlyCapUsd;
  const pct = cap > 0 ? (d.monthSpend / cap) * 100 : 0;
  const callsMonth = d.features.reduce((s, f) => s + f.callsMonth, 0);
  const month = monthInfo(d.month, d.spendByDay[0]?.date);

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <KpiCard
          index={0}
          label={
            <span className="inline-flex items-center gap-1.5">
              Spend this month <AiChip feature="all features" />
            </span>
          }
          value={d.monthSpend}
          format={(n) => fmtUsd(n)}
          sub={cap > 0 ? `${fmtPct(pct)} of ${fmtUsd(cap, 0)} cap` : 'No monthly cap set'}
          tone={cap > 0 && pct >= d.budget.alertAtPercent ? 'warn' : 'default'}
        />
        <KpiCard index={1} label="Projected by month end" value={d.projectedSpend} format={(n) => fmtUsd(n)} sub={cap > 0 ? (d.projectedSpend > cap ? `Over the cap by ${fmtUsd(d.projectedSpend - cap)} at this pace` : `${fmtUsd(cap - d.projectedSpend)} headroom at this pace`) : 'Based on spend so far'} tone={cap > 0 && d.projectedSpend > cap ? 'warn' : 'default'} />
        <KpiCard index={2} label="Calls today" value={d.callsToday} format={fmtInt} sub={`${fmtInt(callsMonth)} this month`} />
        <KpiCard index={3} label="Cache hit rate" value={fmtRate(d.efficiency.cacheHitRate)} sub="Share of input tokens read from the prompt cache" />
      </KpiGrid>

      <FeaturesTable data={d} isSuper={isSuper} />

      <Grid>
        <SpendCard data={d} monthLabel={month.label} days={month.days} />
        <div className="flex min-w-0 flex-col gap-3">
          <SpendByFeatureCard data={d} />
          <CallsByHourCard data={d} />
        </div>
        <BudgetCard key={JSON.stringify(d.budget)} data={d} isSuper={isSuper} />
        <div className="flex min-w-0 flex-col gap-3">
          <RetentionCard key={d.promptRetentionDays} days={d.promptRetentionDays} isSuper={isSuper} />
          <OutcomesCard data={d} />
        </div>
        <EfficiencyCard data={d} />
      </Grid>

      <PricingCard data={d} isSuper={isSuper} />
    </div>
  );
}

/* ───────── Features ───────── */

function FeaturesTable({ data: d, isSuper }: { data: AdminAiResponse; isSuper: boolean }) {
  const update = useUpdateAiFeature();
  const models = useMemo(() => Array.from(new Set([...AI_MODELS, ...d.features.map((f) => f.model)])), [d.features]);

  const columns: Column<AiFeatureRow>[] = [
    {
      id: 'name',
      header: 'Feature',
      width: 'minmax(230px,1.8fr)',
      sortValue: (f) => f.name,
      cell: (f) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <FeatureName feature={f.key} name={f.name} />
          <span className="text-[12px] leading-snug text-muted">Off: {f.fallback}</span>
        </div>
      ),
    },
    { id: 'key', header: 'Key', width: '140px', sortValue: (f) => f.key, cell: (f) => <Mono muted>{f.key}</Mono> },
    {
      id: 'on',
      header: 'On',
      width: '64px',
      sortValue: (f) => f.on,
      cell: (f) => <Toggle checked={f.on} label={`${f.name} (${f.key})`} title={`${f.on ? 'Turn off' : 'Turn on'} ${f.name} · AI feature: ${f.key}`} onChange={(on) => update.mutate({ key: f.key, name: f.name, patch: { on } })} />,
    },
    {
      id: 'model',
      header: 'Model',
      width: '190px',
      sortValue: (f) => f.model,
      cell: (f) =>
        isSuper ? (
          <Select aria-label={`Model for ${f.name}`} title={`AI feature: ${f.key}`} value={f.model} onChange={(e) => update.mutate({ key: f.key, name: f.name, patch: { model: e.target.value as (typeof AI_MODELS)[number] } })} className="[&_select]:h-9 [&_select]:font-mono [&_select]:text-[12px]">
            {models.map((m) => (
              <option key={m} value={m} disabled={!(AI_MODELS as readonly string[]).includes(m)}>
                {m}
              </option>
            ))}
          </Select>
        ) : (
          <Mono>{f.model}</Mono>
        ),
    },
    {
      id: 'cap',
      header: 'Daily cap',
      headerLabel: 'Daily cap per member',
      width: '110px',
      sortValue: (f) => f.dailyCap,
      cell: (f) => <DailyCapInput feature={f} onSave={(dailyCap) => update.mutate({ key: f.key, name: f.name, patch: { dailyCap } })} />,
    },
    { id: 'calls', header: 'Calls', headerLabel: 'Calls this month', width: '90px', align: 'end', sortValue: (f) => f.callsMonth, cell: (f) => <Mono>{fmtInt(f.callsMonth)}</Mono> },
    { id: 'cost', header: 'Cost', headerLabel: 'Cost this month', width: '90px', align: 'end', sortValue: (f) => f.costMonth, cell: (f) => <Mono>{fmtUsd(f.costMonth)}</Mono> },
    {
      id: 'fallback',
      header: 'Fallback',
      headerLabel: 'Fallback rate',
      width: '90px',
      align: 'end',
      sortValue: (f) => f.fallbackRate,
      cell: (f) => <Mono className={cn(f.fallbackRate >= 0.2 && 'font-semibold text-accent-dark')}>{fmtRate(f.fallbackRate)}</Mono>,
    },
  ];

  return (
    <section aria-labelledby="ai-features-h" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ai-features-h" className="h3">
          Features
        </h2>
        <span className="text-[12px] text-muted">
          Calls, cost and fallback rate are month to date. Daily cap is calls per member per day{isSuper ? '' : '. Only a Super Admin can change models'}.
        </span>
      </div>
      <DataTable
        label="AI features"
        columns={columns}
        rows={d.features}
        rowKey={(f) => f.key}
        minWidth={1060}
        initialSort={{ id: 'name', dir: 'asc' }}
        rowClassName={(f) => cn(!d.globalOn && 'opacity-55', d.globalOn && !f.on && 'bg-bg/50')}
        search={{ placeholder: 'Search features', text: (f) => `${f.name} ${f.key} ${f.fallback} ${f.model}` }}
        filters={[
          { id: 'state', label: 'State', options: [{ value: '', label: 'On and off' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], predicate: (f, v) => (v === 'on' ? f.on : !f.on) },
          { id: 'model', label: 'Model', options: [{ value: '', label: 'All models' }, ...models.map((m) => ({ value: m, label: m }))], predicate: (f, v) => f.model === v },
        ]}
        empty={<EmptyState title="No AI features registered" body="Features appear here once the gateway registry is deployed." />}
        hideCount
      />
    </section>
  );
}

/** Per-member daily cap: saves on blur (or Enter) when changed and valid (0–500). */
function DailyCapInput({ feature, onSave }: { feature: AiFeatureRow; onSave: (n: number) => void }) {
  const [v, setV] = useState<number | null>(feature.dailyCap);
  const [synced, setSynced] = useState(feature.dailyCap);
  if (synced !== feature.dailyCap) {
    // Server value changed (save, rollback or refetch): adopt it.
    setSynced(feature.dailyCap);
    setV(feature.dailyCap);
  }
  const valid = v != null && Number.isInteger(v) && v >= 0 && v <= 500;
  const commit = () => {
    if (!valid) {
      setV(feature.dailyCap);
      return;
    }
    if (v !== feature.dailyCap) onSave(v);
  };
  return (
    <NumberInput
      aria-label={`Daily cap per member for ${feature.name}`}
      title={`Calls per member per day (0–500) · AI feature: ${feature.key}`}
      min={0}
      max={500}
      step={1}
      value={v}
      invalid={!valid}
      onValue={setV}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setV(feature.dailyCap);
      }}
      className="!h-9 w-[84px]"
    />
  );
}

/* ───────── Spend ───────── */

function SpendCard({ data: d, monthLabel, days }: { data: AdminAiResponse; monthLabel: string; days: number }) {
  const cap = d.budget.monthlyCapUsd;
  const pace = cap > 0 ? cap / days : null;
  const frac = cap > 0 ? d.monthSpend / cap : 0;
  const bars = d.spendByDay.map((x) => ({ label: fmtDate(x.date), value: x.cost, title: `${fmtDate(x.date, { weekday: true })}: ${fmtUsd(x.cost)} · ${fmtInt(x.calls)} calls`, highlight: pace != null && x.cost > pace }));
  const overDays = pace != null ? d.spendByDay.filter((x) => x.cost > pace).length : 0;
  return (
    <Card>
      <CardHeader
        title={
          <>
            Spend · {monthLabel} <AiChip feature="all features" />
          </>
        }
        aside={<span className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-ink">{fmtUsd(d.monthSpend)}</span>}
      />
      {bars.length === 0 ? (
        <EmptyState compact title="No spend yet this month" body="Daily spend shows here after the first AI call." />
      ) : (
        <>
          <BarChart data={bars} height={110} format={(n) => fmtUsd(n)} cap={pace != null ? { value: pace, label: `${fmtUsd(pace)}/day` } : null} label={`Daily AI spend in ${monthLabel}. Total ${fmtUsd(d.monthSpend)}${pace != null ? `; the cap works out to ${fmtUsd(pace)} a day` : ''}.`} />
          <p className="m-0 text-[12px] leading-snug text-muted">
            Bars show spend per day.{' '}
            {pace != null ? (
              <>
                The dashed line is the {fmtUsd(cap)} monthly cap spread evenly over {days} days
                {overDays > 0 ? ` · ${overDays} ${overDays === 1 ? 'day' : 'days'} above that pace` : ''}.
              </>
            ) : (
              'No monthly cap is set.'
            )}
          </p>
        </>
      )}
      {cap > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
          <div className="flex justify-between text-[13px]">
            <span>
              {fmtUsd(d.monthSpend)} of {fmtUsd(cap)}
            </span>
            <span className="text-muted">
              {fmtPct(frac * 100)} · alert at {d.budget.alertAtPercent}%
            </span>
          </div>
          <ProgressBar value={frac} marker={d.budget.alertAtPercent / 100} tone={frac * 100 >= d.budget.alertAtPercent ? 'warn' : 'accent'} label={`AI spend ${fmtPct(frac * 100)} of the monthly cap`} />
          <span className="text-[12px] text-muted">
            Projected {fmtUsd(d.projectedSpend)} by month end. At the cap AI {d.budget.atCapBehaviour === 'disable' ? 'switches to fallbacks' : 'keeps running and admins are warned'}.
          </span>
        </div>
      )}
    </Card>
  );
}

function SpendByFeatureCard({ data: d }: { data: AdminAiResponse }) {
  const names = Object.fromEntries(d.features.map((f) => [f.key, f.name]));
  const items = [...d.spendByFeature]
    .sort((a, b) => b.cost - a.cost)
    .map((x) => ({ key: x.feature, label: <FeatureName feature={x.feature} name={names[x.feature]} />, value: x.cost, sub: `${fmtInt(x.calls)} calls` }));
  return (
    <Card>
      <CardHeader title="Spend by feature" aside="Month to date" />
      {items.length === 0 ? <span className="text-[13px] text-muted">No calls yet this month.</span> : <MeterList label="AI spend by feature" items={items} format={(n) => fmtUsd(n)} />}
    </Card>
  );
}

function CallsByHourCard({ data: d }: { data: AdminAiResponse }) {
  const byHour = new Map(d.callsByHour.map((h) => [h.hour, h.calls]));
  const bars = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: byHour.get(h) ?? 0 }));
  const total = bars.reduce((s, b) => s + b.value, 0);
  const peak = bars.reduce((best, b) => (b.value > best.value ? b : best), bars[0]!);
  return (
    <Card>
      <CardHeader title="Calls by hour" aside={total > 0 ? `Busiest ${peak.label}` : undefined} />
      {total === 0 ? (
        <span className="text-[13px] text-muted">No calls yet this month.</span>
      ) : (
        <div className="flex flex-col gap-1.5">
          <BarChart data={bars} height={80} xLabels="none" format={(n) => `${fmtInt(n)} calls`} label={`AI calls by hour of day, month to date. Busiest hour ${peak.label} with ${fmtInt(peak.value)} calls.`} />
          <div aria-hidden className="flex justify-between font-mono text-[11px] text-muted">
            {['00', '06', '12', '18', '23'].map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ───────── Outcomes & efficiency ───────── */

function OutcomesCard({ data: d }: { data: AdminAiResponse }) {
  const entries = Object.entries(d.outcomes).filter(([, n]) => n > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const errors = entries.filter(([o]) => ERROR_OUTCOMES.has(o)).reduce((s, [, n]) => s + n, 0);
  const soft = entries.filter(([o]) => SOFT_OUTCOMES.has(o)).reduce((s, [, n]) => s + n, 0);
  const items = entries
    .sort((a, b) => b[1] - a[1])
    .map(([o, n]) => ({ key: o, label: <OutcomePill outcome={o} />, value: n, sub: total ? fmtPct((n / total) * 100) : undefined }));
  return (
    <Card>
      <CardHeader
        title="Outcomes"
        aside={total > 0 ? `${fmtInt(total)} calls` : undefined}
        actions={
          <Link to="/ai/calls" className="inline-flex items-center gap-1 text-[13px] font-semibold">
            <ScrollText aria-hidden className="h-3.5 w-3.5" /> Call log
          </Link>
        }
      />
      {total === 0 ? (
        <span className="text-[13px] text-muted">No calls yet this month.</span>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-[12px]">
            <Pill tone={errors > 0 ? 'over' : 'in'}>{errors > 0 ? `${fmtInt(errors)} errors · ${fmtPct((errors / total) * 100, false, 1)}` : 'No errors'}</Pill>
            {soft > 0 && <Pill tone="under">{`${fmtInt(soft)} fell back · ${fmtPct((soft / total) * 100, false, 1)}`}</Pill>}
          </div>
          <MeterList label="AI call outcomes this month" items={items} format={fmtInt} />
        </>
      )}
    </Card>
  );
}

function EfficiencyCard({ data: d }: { data: AdminAiResponse }) {
  const e = d.efficiency;
  const names = Object.fromEntries(d.features.map((f) => [f.key, f.name]));
  return (
    <Card>
      <CardHeader title="Token efficiency" aside="Against the targets in the AI spec" />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5 rounded-[12px] bg-bg p-3">
          <span className="text-[12px] text-muted">Cache hit rate</span>
          <span className="font-display text-[22px] font-extrabold tracking-[-0.03em]">{fmtRate(e.cacheHitRate)}</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-[12px] bg-bg p-3">
          <span className="text-[12px] text-muted">Avg image input</span>
          <span className="font-display text-[22px] font-extrabold tracking-[-0.03em]">
            {e.avgImageInputTokens != null ? fmtInt(e.avgImageInputTokens) : '—'}
            <span className="ml-1 text-[13px] font-semibold tracking-normal text-muted">tokens</span>
          </span>
        </div>
      </div>
      {e.avgOutputTokens.length > 0 && (
        <div role="table" aria-label="Average output tokens per feature" className="flex flex-col text-[13px]">
          <div role="row" className="grid grid-cols-[minmax(0,1fr)_64px_64px_96px] items-center gap-2 border-b border-border pb-2">
            <span role="columnheader" className="th">
              Avg output
            </span>
            <span role="columnheader" className="th text-right">
              Now
            </span>
            <span role="columnheader" className="th text-right">
              Target
            </span>
            <span role="columnheader" className="th text-right">
              Status
            </span>
          </div>
          {e.avgOutputTokens.map((r) => (
            <div role="row" key={r.feature} className="grid grid-cols-[minmax(0,1fr)_64px_64px_96px] items-center gap-2 border-b border-hairline py-2 last:border-b-0">
              <span role="cell" className="min-w-0">
                <FeatureName feature={r.feature} name={names[r.feature]} />
              </span>
              <span role="cell" className="text-right font-mono text-[12px]">
                {fmtInt(r.value)}
              </span>
              <span role="cell" className="text-right font-mono text-[12px] text-muted">
                {fmtInt(r.target)}
              </span>
              <span role="cell" className="justify-self-end">
                {r.drift ? (
                  <Pill tone="over" title={`${fmtNum(((r.value - r.target) / Math.max(1, r.target)) * 100, 0)}% vs target`}>
                    Drifting
                  </Pill>
                ) : (
                  <Pill tone="in">On target</Pill>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {e.hints.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 rounded-[12px] bg-ai-bg/50 p-3 text-[13px] leading-snug">
          {e.hints.map((h, i) => (
            <li key={i} className="flex items-start gap-2">
              <Lightbulb aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai-fg" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[12px] text-muted">No suggestions right now. Token use is within targets.</span>
      )}
    </Card>
  );
}
