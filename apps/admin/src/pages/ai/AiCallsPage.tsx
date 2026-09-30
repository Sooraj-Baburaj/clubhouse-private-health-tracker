import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Bot, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AiCallRow } from '@clubhouse/contracts';
import { useAiCall, useAiCalls, useAiOverview } from '@/features/ai';
import { cn } from '@/lib/cn';
import { fmtDateTime, fmtInt, fmtMs, fmtRelative, fmtUsd, humanize } from '@/lib/format';
import { AiChip, Button, CopyButton, DataTable, DrawerPanel, EmptyState, ErrorState, FilterSelect, Inset, MemberSelect, Mono, PageHeader, PersonCell, Pill, Skeleton, type Column } from '@/ui';
import { CodeBlock, Disclosure, ERROR_OUTCOMES, FeatureName, featureOptions, OUTCOME_OPTIONS, OutcomePill, useFeatureNames } from './aiShared';

const DIET_ENTITY_TYPES = new Set(['diet_plan', 'diet_plan_version', 'diet', 'plan']);

function PersonOrSystem({ person, size = 28 }: { person: AiCallRow['person']; size?: number }) {
  if (person) return <PersonCell person={person} size={size} />;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-ai-bg text-ai-fg" style={{ width: size, height: size }}>
        <Bot className="h-3.5 w-3.5" />
      </span>
      <span className="truncate font-semibold">System</span>
    </span>
  );
}

/** AI gateway log (ADM-AI calls): server-side filters in the URL, client search/sort over loaded pages, drill-down drawer. */
export function AiCallsPage() {
  const search = useSearch({ from: '/shell/ai/calls' });
  const navigate = useNavigate({ from: '/ai/calls' });
  const names = useFeatureNames();
  const overview = useAiOverview();
  const q = useAiCalls({ userId: search.userId, feature: search.feature, outcome: search.outcome });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.calls) ?? undefined, [q.data]);

  // Keep the last opened id so the drawer can animate out after `call` leaves the URL.
  const [shownCall, setShownCall] = useState<string | undefined>(search.call);
  if (search.call && search.call !== shownCall) setShownCall(search.call);

  const setFilter = (k: 'userId' | 'feature' | 'outcome', v: string) => void navigate({ search: (s) => ({ ...s, [k]: v || undefined }), replace: true });
  const openCall = (id: string | undefined) => void navigate({ search: (s) => ({ ...s, call: id }) });
  const anyFilter = !!(search.userId || search.feature || search.outcome);

  const columns: Column<AiCallRow>[] = [
    { id: 'started', header: 'Started', width: '120px', sortValue: (r) => r.startedAt, cell: (r) => <span title={fmtDateTime(r.startedAt)} className="text-[13px] text-muted">{fmtRelative(r.startedAt)}</span> },
    { id: 'person', header: 'Person', width: 'minmax(160px,1.2fr)', sortValue: (r) => r.person?.name ?? '', cell: (r) => <PersonOrSystem person={r.person} /> },
    { id: 'feature', header: 'Feature', width: 'minmax(170px,1.1fr)', sortValue: (r) => names[r.feature] ?? r.feature, cell: (r) => <FeatureName feature={r.feature} name={names[r.feature]} /> },
    { id: 'model', header: 'Model', width: '150px', sortValue: (r) => r.model, cell: (r) => <Mono muted className="truncate">{r.model}</Mono> },
    {
      id: 'tokens',
      header: 'Tokens in / out / cache',
      headerLabel: 'Input tokens',
      width: '180px',
      sortValue: (r) => r.inputTokens + r.outputTokens,
      cell: (r) => (
        <Mono>
          {fmtInt(r.inputTokens)} / {fmtInt(r.outputTokens)} / <span className="text-muted">{fmtInt(r.cacheReadTokens)}</span>
        </Mono>
      ),
    },
    { id: 'cost', header: 'Cost', width: '80px', align: 'end', sortValue: (r) => r.costUsd, cell: (r) => <Mono>{fmtUsd(r.costUsd, r.costUsd > 0 && r.costUsd < 0.01 ? 4 : 3)}</Mono> },
    { id: 'latency', header: 'Latency', width: '80px', align: 'end', sortValue: (r) => r.latencyMs ?? -1, cell: (r) => <Mono muted>{fmtMs(r.latencyMs)}</Mono> },
    { id: 'outcome', header: 'Outcome', width: '130px', sortValue: (r) => r.outcome, cell: (r) => <OutcomePill outcome={r.outcome} title={r.errorMessage ?? r.errorCategory ?? undefined} /> },
    { id: 'test', header: 'Test', width: '60px', sortValue: (r) => r.test, cell: (r) => (r.test ? <Pill tone="muted">Test</Pill> : null) },
  ];

  const fallbackRow = shownCall ? rows?.find((r) => r.id === shownCall) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="AI gateway log"
        title="AI calls"
        description="Every call that went through the AI gateway: who, which feature, tokens, cost and how it ended. Select a call for the full detail and its prompt snapshot."
        actions={
          <Link to="/ai" className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" /> AI control centre
          </Link>
        }
      />

      <div role="group" aria-label="Filter the call log" className="flex flex-wrap items-center gap-2">
        <MemberSelect aria-label="Member" placeholder="All members" includeInactive value={search.userId ?? ''} onChange={(id) => setFilter('userId', id)} className="w-full sm:w-[240px] [&_select]:h-10 [&_select]:rounded-full [&_select]:pl-4" />
        <FilterSelect label="Feature" value={search.feature ?? ''} onChange={(v) => setFilter('feature', v)} options={featureOptions(names)} />
        <FilterSelect label="Outcome" value={search.outcome ?? ''} onChange={(v) => setFilter('outcome', v)} options={OUTCOME_OPTIONS} />
        {anyFilter && (
          <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={() => void navigate({ search: (s) => ({ call: s.call }), replace: true })}>
            Clear filters
          </Button>
        )}
      </div>

      <DataTable
        label="AI calls"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        minWidth={1140}
        initialSort={{ id: 'started', dir: 'desc' }}
        onRowClick={(r) => openCall(r.id)}
        rowClassName={(r) => cn(r.id === search.call && 'bg-accent-tint/40', ERROR_OUTCOMES.has(r.outcome) && r.id !== search.call && 'bg-over-bg/30')}
        search={{ placeholder: 'Search loaded calls', text: (r) => `${r.person?.name ?? 'System'} ${r.feature} ${names[r.feature] ?? ''} ${r.model} ${r.outcome} ${r.errorCategory ?? ''} ${r.errorMessage ?? ''} ${r.id}` }}
        filters={[{ id: 'test', label: 'Test calls', options: [{ value: '', label: 'Real and test' }, { value: 'real', label: 'Real calls' }, { value: 'test', label: 'Test calls' }], predicate: (r, v) => (v === 'test' ? r.test : !r.test) }]}
        footer={
          q.hasNextPage ? (
            <Button variant="secondary" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
              Load older calls
            </Button>
          ) : rows && rows.length > 0 ? (
            <span>That’s everything{anyFilter ? ' for these filters' : ''}.</span>
          ) : null
        }
        empty={<EmptyState icon={<Bot className="h-5 w-5" />} title={anyFilter ? 'No calls match these filters' : 'No AI calls yet'} body={anyFilter ? 'Try another member, feature or outcome.' : 'Calls show up here as soon as members use an AI feature.'} />}
      />

      <CallDrawer id={shownCall} open={!!search.call} fallback={fallbackRow} retentionDays={overview.data?.promptRetentionDays} names={names} onClose={() => openCall(undefined)} />
    </>
  );
}

/* ───────── Drill-down ───────── */

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[12px] bg-bg p-3">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="truncate font-mono text-[14px] font-semibold">{value}</span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </div>
  );
}

function EntityLink({ entity }: { entity: NonNullable<AiCallRow['entity']> }) {
  const label = humanize(entity.type);
  if (DIET_ENTITY_TYPES.has(entity.type)) {
    return (
      <Link to="/diets/$planId" params={{ planId: entity.id }} className="inline-flex min-w-0 flex-col font-semibold">
        <span>Open {label.toLowerCase()}</span>
        <Mono muted className="break-all font-normal">
          {entity.id}
        </Mono>
      </Link>
    );
  }
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span>{label}</span>
      <Mono muted className="break-all">
        {entity.id}
      </Mono>
    </span>
  );
}

function CallDrawer({ id, open, fallback, retentionDays, names, onClose }: { id: string | undefined; open: boolean; fallback: AiCallRow | undefined; retentionDays: number | undefined; names: Record<string, string>; onClose: () => void }) {
  const q = useAiCall(id);
  const c = q.data ?? fallback;
  const featureName = c ? (names[c.feature] ?? humanize(c.feature)) : undefined;
  const isError = c ? ERROR_OUTCOMES.has(c.outcome) : false;

  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      size="lg"
      label={featureName ? `AI call · ${featureName}` : 'AI call'}
      eyebrow={c ? <span className="normal-case tracking-[0.08em]">AI call · {c.feature}</span> : 'AI call'}
      title={c ? <FeatureName feature={c.feature} name={featureName} className="[&>span:first-child]:font-extrabold" /> : undefined}
      subtitle={c ? `${fmtDateTime(c.startedAt)} · ${fmtRelative(c.startedAt)}` : undefined}
      headerActions={id ? <CopyButton text={id} label="Copy ID" /> : undefined}
    >
      {!c ? (
        q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <div role="status" aria-label="Loading call" className="flex flex-col gap-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <OutcomePill outcome={c.outcome} />
            {c.test && <Pill tone="muted">Test call</Pill>}
            <Mono muted>{c.model}</Mono>
          </div>

          {(c.errorCategory || c.errorMessage) && (
            <div role={isError ? 'alert' : undefined} className={cn('flex flex-col gap-1 rounded-[14px] px-3.5 py-3 text-[13px] leading-relaxed', isError ? 'bg-over-bg text-over-fg' : 'bg-under-bg text-under-fg')}>
              {c.errorCategory && <span className="font-mono text-[11px] uppercase tracking-[0.12em]">{c.errorCategory}</span>}
              {c.errorMessage && <span className="break-words">{c.errorMessage}</span>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Input tokens" value={fmtInt(c.inputTokens)} />
            <Stat label="Output tokens" value={fmtInt(c.outputTokens)} />
            <Stat label="Cache read" value={fmtInt(c.cacheReadTokens)} sub={c.inputTokens + c.cacheReadTokens > 0 ? `${Math.round((c.cacheReadTokens / (c.inputTokens + c.cacheReadTokens)) * 100)}% of input` : undefined} />
            <Stat label="Cost" value={fmtUsd(c.costUsd, 4)} />
            <Stat label="Latency" value={fmtMs(c.latencyMs)} />
            <Stat label="Total tokens" value={fmtInt(c.inputTokens + c.outputTokens + c.cacheReadTokens)} />
          </div>

          <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-3 text-[13px]">
            <dt className="text-muted">Person</dt>
            <dd className="m-0 min-w-0">
              {c.person ? (
                <Link to="/members/$id" params={{ id: c.person.id }} className="text-ink hover:text-accent">
                  <PersonCell person={c.person} size={26} />
                </Link>
              ) : (
                <PersonOrSystem person={null} size={26} />
              )}
            </dd>
            <dt className="text-muted">Produced</dt>
            <dd className="m-0 min-w-0">
              {c.entity ? (
                <span className="flex items-start gap-2">
                  <AiChip feature={c.feature} className="mt-0.5" />
                  <EntityLink entity={c.entity} />
                </span>
              ) : (
                <span className="text-muted">Nothing saved from this call</span>
              )}
            </dd>
            <dt className="text-muted">Started</dt>
            <dd className="m-0 font-medium">{fmtDateTime(c.startedAt)}</dd>
            <dt className="text-muted">Call ID</dt>
            <dd className="m-0 min-w-0">
              <Mono muted className="break-all">
                {c.id}
              </Mono>
            </dd>
          </dl>

          <section aria-label="Prompt snapshot" className="flex flex-col gap-2">
            <h3 className="h3">Prompt snapshot</h3>
            {c.promptSnapshot ? (
              <div className="flex flex-col gap-2">
                <Disclosure summary="System" aside={<Mono muted>{fmtInt(c.promptSnapshot.system.length)} chars</Mono>}>
                  <CodeBlock label="System prompt">{c.promptSnapshot.system || '—'}</CodeBlock>
                </Disclosure>
                <Disclosure summary="User" aside={<Mono muted>{fmtInt(c.promptSnapshot.user.length)} chars</Mono>}>
                  <CodeBlock label="User message">{c.promptSnapshot.user || '—'}</CodeBlock>
                </Disclosure>
                <Disclosure
                  defaultOpen
                  summary={
                    <>
                      Response <AiChip feature={c.feature} />
                    </>
                  }
                  aside={<Mono muted>{fmtInt(c.promptSnapshot.response.length)} chars</Mono>}
                >
                  <CodeBlock label="Model response">{formatResponse(c.promptSnapshot.response)}</CodeBlock>
                </Disclosure>
              </div>
            ) : (
              <Inset>
                <span className="text-[13px] text-muted">
                  {retentionDays === 0
                    ? 'Prompt not retained. Prompt retention is set to don’t keep.'
                    : retentionDays != null
                      ? `Prompt not retained (retention ${retentionDays} ${retentionDays === 1 ? 'day' : 'days'}).`
                      : 'Prompt not retained.'}{' '}
                  Tokens, cost and outcome are always kept.
                </span>
              </Inset>
            )}
          </section>
        </>
      )}
    </DrawerPanel>
  );
}

/** Pretty-print JSON responses; leave anything else as-is. */
function formatResponse(s: string): string {
  const t = s.trim();
  if (!t || !(t.startsWith('{') || t.startsWith('['))) return s || '—';
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return s;
  }
}
