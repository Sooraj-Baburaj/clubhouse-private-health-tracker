import { adminApi } from '@clubhouse/client';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bot, Download, ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AiUsageRow } from '@clubhouse/contracts';
import { useAiUsage } from '@/features/ai';
import { cn } from '@/lib/cn';
import { fmtDate, fmtInt, fmtMs, fmtUsd, todayLocal } from '@/lib/format';
import { Card, DataTable, EmptyState, Field, Input, Mono, PersonCell, Segmented, type Column } from '@/ui';
import { FeatureName, featureOptions, fmtRate, monthStartLocal, useFeatureNames } from './aiShared';

type Preset = 'month' | '7d' | '30d' | 'custom';

function presetRange(p: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const to = todayLocal();
  if (p === 'month') return { from: monthStartLocal(), to };
  return { from: todayLocal(p === '7d' ? -6 : -29), to };
}

function SystemCell() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ai-bg text-ai-fg">
        <Bot className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-col leading-[1.3]">
        <span className="truncate font-semibold">System</span>
        <span className="truncate text-[12px] text-muted">Tests and scheduled work</span>
      </div>
    </div>
  );
}

/** Usage tab: member × feature for a date range, with CSV export and a jump into the call log. */
export function AiUsageTab() {
  const initial = presetRange('month');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preset, setPreset] = useState<Preset>('month');
  const rangeError = !from || !to ? 'Pick both dates' : from > to ? '“From” must be on or before “To”' : null;
  const q = useAiUsage(from, to, !rangeError);
  const names = useFeatureNames();
  const navigate = useNavigate();

  const totals = useMemo(() => {
    const rows = q.data ?? [];
    return {
      calls: rows.reduce((s, r) => s + r.calls, 0),
      cost: rows.reduce((s, r) => s + r.cost, 0),
      tokens: rows.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
      people: new Set(rows.map((r) => r.person?.id ?? 'system')).size,
    };
  }, [q.data]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = presetRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const columns: Column<AiUsageRow>[] = [
    { id: 'person', header: 'Person', width: 'minmax(190px,1.4fr)', sortValue: (r) => r.person?.name ?? '', cell: (r) => (r.person ? <PersonCell person={r.person} /> : <SystemCell />) },
    { id: 'feature', header: 'Feature', width: 'minmax(170px,1.2fr)', sortValue: (r) => names[r.feature] ?? r.feature, cell: (r) => <FeatureName feature={r.feature} name={names[r.feature]} /> },
    { id: 'calls', header: 'Calls', width: '80px', align: 'end', sortValue: (r) => r.calls, cell: (r) => <Mono>{fmtInt(r.calls)}</Mono> },
    { id: 'in', header: 'Input', headerLabel: 'Input tokens', width: '96px', align: 'end', sortValue: (r) => r.inputTokens, cell: (r) => <Mono>{fmtInt(r.inputTokens)}</Mono> },
    { id: 'out', header: 'Output', headerLabel: 'Output tokens', width: '90px', align: 'end', sortValue: (r) => r.outputTokens, cell: (r) => <Mono>{fmtInt(r.outputTokens)}</Mono> },
    { id: 'cached', header: 'Cached', headerLabel: 'Cached tokens', width: '96px', align: 'end', sortValue: (r) => r.cachedTokens, cell: (r) => <Mono muted>{fmtInt(r.cachedTokens)}</Mono> },
    { id: 'cost', header: 'Cost', width: '90px', align: 'end', sortValue: (r) => r.cost, cell: (r) => <Mono className="font-semibold">{fmtUsd(r.cost)}</Mono> },
    { id: 'latency', header: 'Avg latency', width: '100px', align: 'end', sortValue: (r) => r.avgLatencyMs, cell: (r) => <Mono muted>{fmtMs(r.avgLatencyMs)}</Mono> },
    { id: 'fallback', header: 'Fallback', headerLabel: 'Fallback rate', width: '90px', align: 'end', sortValue: (r) => r.fallbackRate, cell: (r) => <Mono className={cn(r.fallbackRate >= 0.2 && 'font-semibold text-accent-dark')}>{fmtRate(r.fallbackRate)}</Mono> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            label="Date range"
            value={preset}
            onChange={applyPreset}
            options={[
              { value: 'month', label: 'This month' },
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From" className="w-[160px]">
              <Input
                type="date"
                value={from}
                max={to || undefined}
                invalid={!!rangeError}
                onChange={(e) => {
                  setPreset('custom');
                  setFrom(e.target.value);
                }}
              />
            </Field>
            <Field label="To" className="w-[160px]">
              <Input
                type="date"
                value={to}
                min={from || undefined}
                max={todayLocal()}
                invalid={!!rangeError}
                onChange={(e) => {
                  setPreset('custom');
                  setTo(e.target.value);
                }}
              />
            </Field>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            {q.data && !rangeError && (
              <>
                <span>
                  <b className="text-ink">{fmtUsd(totals.cost)}</b> spent
                </span>
                <span>
                  <b className="text-ink">{fmtInt(totals.calls)}</b> calls
                </span>
                <span>
                  <b className="text-ink">{fmtInt(totals.tokens)}</b> tokens
                </span>
              </>
            )}
          </div>
        </div>
        {rangeError && (
          <span role="alert" className="text-[12px] font-semibold text-accent-dark">
            {rangeError}
          </span>
        )}
      </Card>

      <DataTable
        label={`AI usage by member and feature, ${fmtDate(from)} to ${fmtDate(to)}`}
        columns={columns}
        rows={rangeError ? [] : q.data}
        rowKey={(r) => `${r.person?.id ?? 'system'}:${r.feature}`}
        loading={!rangeError && q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        minWidth={1080}
        initialSort={{ id: 'cost', dir: 'desc' }}
        pageSize={100}
        search={{ placeholder: 'Search people or features', text: (r) => `${r.person?.name ?? 'System'} ${r.feature} ${names[r.feature] ?? ''}` }}
        filters={[{ id: 'feature', label: 'Feature', options: featureOptions(names), predicate: (r, v) => r.feature === v }]}
        onRowClick={(r) => void navigate({ to: '/ai/calls', search: { userId: r.person?.id, feature: r.feature } })}
        toolbar={
          <>
            <Link to="/ai/calls" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-accent hover:bg-accent-tint/40 hover:text-accent-dark">
              <ScrollText aria-hidden className="h-4 w-4" /> Call log
            </Link>
            {rangeError ? (
              <span aria-disabled className="inline-flex h-10 cursor-not-allowed items-center gap-1.5 rounded-full border border-border bg-white px-[18px] text-[14px] font-semibold opacity-50">
                <Download aria-hidden className="h-4 w-4" /> Export CSV
              </span>
            ) : (
              <a href={adminApi.ai.usageCsvUrl(from, to)} download={`ai-usage-${from}-to-${to}.csv`} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-white px-[18px] text-[14px] font-semibold text-ink transition-colors hover:border-[#c4c4ca]">
                <Download aria-hidden className="h-4 w-4" /> Export CSV
              </a>
            )}
          </>
        }
        footer={<span>Select a row to see its calls.</span>}
        empty={<EmptyState icon={<Bot className="h-5 w-5" />} title={rangeError ? 'Pick a valid date range' : 'No AI calls in this range'} body={rangeError ? undefined : 'Try a wider range. Usage shows here once members use AI features.'} />}
      />
    </div>
  );
}
