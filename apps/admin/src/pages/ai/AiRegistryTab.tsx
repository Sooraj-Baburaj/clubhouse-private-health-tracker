import { Link } from '@tanstack/react-router';
import { ArrowRight, FileCode2, FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AdminAiResponse } from '@clubhouse/contracts';
import { useAiRegistry, useAiTestCall, type AiRegistryEntry, type AiTestResult } from '@/features/ai';
import { fmtInt, fmtMs, fmtUsd, humanize } from '@/lib/format';
import { AiChip, Button, Card, CardHeader, EmptyState, ErrorState, Grid, KeyValues, Modal, Mono, Pill, SearchInput, SkeletonCard } from '@/ui';
import { CodeBlock, Disclosure, FeatureName, prettyJson } from './aiShared';

/** Registry tab: every gateway feature as generated from code, with the system prompt (super admins) and a test call. */
export function AiRegistryTab({ isSuper, overview }: { isSuper: boolean; overview: AdminAiResponse | undefined }) {
  const q = useAiRegistry();
  const test = useAiTestCall();
  const [query, setQuery] = useState('');
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [result, setResult] = useState<{ entry: AiRegistryEntry; res: AiTestResult } | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const featureState = useMemo(() => new Map((overview?.features ?? []).map((f) => [f.key, f])), [overview]);
  const rows = useMemo(() => {
    const t = query.trim().toLowerCase();
    const list = q.data ?? [];
    return t ? list.filter((r) => `${r.name} ${r.key} ${r.purpose} ${r.trigger} ${r.sourceFile} ${r.defaultModel}`.toLowerCase().includes(t)) : list;
  }, [q.data, query]);

  const runTest = (entry: AiRegistryEntry) => {
    setRunningKey(entry.key);
    test.mutate(entry.key, {
      onSuccess: (res) => {
        setResult({ entry, res });
        setResultOpen(true);
      },
      onSettled: () => setRunningKey(null),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search the registry" />
        <span className="max-w-[520px] text-[12px] leading-snug text-muted">Generated from the gateway code. A test call sends sample data, is marked as a test in the call log and counts toward spend.</span>
      </div>

      {q.isPending ? (
        <Grid min={360}>
          <SkeletonCard lines={7} />
          <SkeletonCard lines={7} />
        </Grid>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title={query ? 'No features match' : 'The registry is empty'} body={query ? 'Try a different search.' : 'Features appear here once the AI gateway is deployed.'} />
        </Card>
      ) : (
        <Grid min={360}>
          {rows.map((r) => {
            const state = featureState.get(r.key);
            return (
              <Card key={r.key}>
                <CardHeader
                  eyebrow={<span className="normal-case tracking-[0.08em]">{r.key}</span>}
                  title={<FeatureName feature={r.key} name={r.name} />}
                  aside={state ? <Pill tone={state.on && overview?.globalOn ? 'in' : 'none'}>{!overview?.globalOn ? 'AI mode off' : state.on ? 'On' : 'Off'}</Pill> : undefined}
                />
                <p className="m-0 text-[14px] leading-relaxed">{r.purpose}</p>
                <KeyValues
                  items={[
                    ['Trigger', r.trigger],
                    ['Data sent', r.dataSent],
                    ['Fallback', r.fallback],
                    ['Default model', <Mono key="m">{r.defaultModel}</Mono>],
                    ...(state && state.model !== r.defaultModel ? ([['Current model', <Mono key="c">{state.model}</Mono>]] as [string, React.ReactNode][]) : []),
                    ['Timeout', fmtMs(r.timeoutMs)],
                    ['Prompt version', <Mono key="v">{r.promptVersion}</Mono>],
                    [
                      'Source',
                      <span key="s" className="inline-flex min-w-0 items-start gap-1.5">
                        <FileCode2 aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted" />
                        <Mono className="break-all">{r.sourceFile}</Mono>
                      </span>,
                    ],
                  ]}
                />
                {isSuper && r.system != null && (
                  <Disclosure summary={<>System prompt</>} aside={<Mono muted>{fmtInt(r.system.length)} chars</Mono>}>
                    <CodeBlock label={`System prompt for ${r.key}`} maxHeight={360}>
                      {r.system}
                    </CodeBlock>
                  </Disclosure>
                )}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
                  <Link to="/ai/calls" search={{ feature: r.key }} className="inline-flex items-center gap-1 text-[13px] font-semibold">
                    Recent calls <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                  <Button size="sm" variant="outline" icon={<FlaskConical className="h-3.5 w-3.5" />} loading={runningKey === r.key} disabled={!!runningKey && runningKey !== r.key} onClick={() => runTest(r)}>
                    Test call
                  </Button>
                </div>
              </Card>
            );
          })}
        </Grid>
      )}

      {result && <TestResultModal open={resultOpen} onClose={() => setResultOpen(false)} entry={result.entry} res={result.res} />}
    </div>
  );
}

function usageItems(usage: unknown): [string, React.ReactNode][] | null {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const entries = Object.entries(usage as Record<string, unknown>);
  if (!entries.every(([, v]) => typeof v === 'number' || v == null)) return null;
  return entries.map(([k, v]) => {
    const n = v as number | null;
    const isCost = /cost|usd/i.test(k);
    const isMs = /ms$|latency/i.test(k);
    return [humanize(k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()), <Mono key={k}>{n == null ? '—' : isCost ? fmtUsd(n, 4) : isMs ? fmtMs(n) : fmtInt(n)}</Mono>];
  });
}

function TestResultModal({ open, onClose, entry, res }: { open: boolean; onClose: () => void; entry: AiRegistryEntry; res: AiTestResult }) {
  const items = usageItems(res.usage);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      eyebrow={<span className="normal-case tracking-[0.08em]">Test call · {entry.key}</span>}
      title={<FeatureName feature={entry.key} name={entry.name} className="[&>span:first-child]:font-extrabold" />}
      label={`Test call result for ${entry.name}`}
      footer={
        <>
          {res.callId && (
            <Link to="/ai/calls" search={{ call: res.callId }} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-white px-[18px] text-[14px] font-semibold text-ink hover:border-[#c4c4ca]" onClick={onClose}>
              Open in call log <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          )}
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {res.ok ? <Pill tone="in">Succeeded</Pill> : <Pill tone="over">{res.reason ? humanize(res.reason) : 'Didn’t complete'}</Pill>}
        {!res.ok && res.reason && <Mono muted>{res.reason}</Mono>}
      </div>
      {res.message && <p className="m-0 text-[13px] leading-relaxed text-muted">{res.message}</p>}
      {res.output !== undefined && res.output !== null && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            Structured output <AiChip feature={entry.key} />
          </span>
          <CodeBlock label="Structured output" maxHeight={280}>
            {prettyJson(res.output)}
          </CodeBlock>
        </div>
      )}
      {res.usage != null && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Usage</span>
          {items ? (
            <KeyValues items={items} className="rounded-[12px] bg-bg p-3" />
          ) : (
            <CodeBlock label="Usage" maxHeight={180}>
              {prettyJson(res.usage)}
            </CodeBlock>
          )}
        </div>
      )}
      {!res.callId && <span className="text-[12px] text-muted">This test didn’t reach the gateway log, so there’s no call to open.</span>}
    </Modal>
  );
}
