import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertTriangle, Info } from 'lucide-react';
import type { AdminAiResponse } from '@clubhouse/contracts';
import { useAiOverview, useSetAiGlobal } from '@/features/ai';
import { useRole } from '@/features/me';
import { AiChip, Card, confirmAction, ErrorState, PageHeader, SkeletonCard, TabPanel, Tabs, Toggle } from '@/ui';
import { AiOverviewTab } from './AiOverviewTab';
import { AiRegistryTab } from './AiRegistryTab';
import { AiUsageTab } from './AiUsageTab';

type Tab = 'overview' | 'usage' | 'registry';
const TABS: Tab[] = ['overview', 'usage', 'registry'];
const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Models actually configured on features (design eyebrow: "claude-sonnet-5-5 · via AI gateway"). */
function modelsLabel(d: AdminAiResponse | undefined): string {
  const models = Array.from(new Set((d?.features ?? []).map((f) => f.model)));
  if (models.length === 0) return DEFAULT_MODEL;
  return models.join(' + ');
}

/** AI control centre (ADM-AI): global switch, per-feature controls, spend, budget, pricing, usage and the feature registry. */
export function AiPage() {
  const search = useSearch({ from: '/shell/ai' });
  const navigate = useNavigate({ from: '/ai' });
  const tab: Tab = TABS.includes(search.tab as Tab) ? (search.tab as Tab) : 'overview';
  const q = useAiOverview();
  const d = q.data;
  const { isSuper } = useRole();
  const setGlobal = useSetAiGlobal();

  const onGlobal = async (next: boolean) => {
    if (!d) return;
    const features = d.features;
    await confirmAction({
      eyebrow: 'AI mode · audited',
      title: next ? 'Turn AI mode on?' : 'Turn AI mode off?',
      tone: next ? 'default' : 'danger',
      body: next ? (
        <>
          Features that are switched on start calling the model again within 5 seconds, and spend counts toward the {d.budget.monthlyCapUsd > 0 ? `$${d.budget.monthlyCapUsd.toFixed(2)} ` : ''}monthly cap. Members see AI badges on AI results again. The change is recorded in the audit log.
        </>
      ) : (
        <>
          Every feature falls back to its logic-only path and members see no AI badges. Nothing is sent to the model while it is off. Takes effect within 5 seconds and is recorded in the audit log.
        </>
      ),
      impact: next
        ? features.filter((f) => f.on).map((f) => `${f.name} resumes (${f.model})`)
        : features.map((f) => (
            <span key={f.key} className="flex flex-col">
              <span>{f.name}</span>
              <span className="text-[12px] font-normal text-muted">Instead: {f.fallback}</span>
            </span>
          )),
      confirmLabel: next ? 'Turn AI on' : 'Turn AI off',
      requireReason: true,
      reasonPlaceholder: next ? 'e.g. Budget reset for the new month' : 'e.g. Pausing spend until the new month',
      onConfirm: (reason) => setGlobal.mutateAsync({ on: next, reason }),
    });
  };

  return (
    <>
      <PageHeader
        eyebrow={`${modelsLabel(d)} · via AI gateway`}
        title="AI control centre"
        actions={
          <div className="flex items-center gap-3 rounded-full border border-border bg-white py-2 pl-[18px] pr-2">
            <span className="flex items-center gap-2 text-[14px] font-semibold">
              AI mode {d ? (d.globalOn ? 'on' : 'off') : '…'}
              <AiChip feature="all features" />
            </span>
            <Toggle size="lg" label="AI mode" checked={!!d?.globalOn} disabled={!d || setGlobal.isPending} onChange={(v) => void onGlobal(v)} />
          </div>
        }
      />

      {d && d.environmentMode !== 'live' && <EnvironmentNote mode={d.environmentMode} />}
      {d && !d.globalOn && (
        <div role="status" className="flex items-start gap-2.5 rounded-[14px] bg-none-bg px-4 py-3 text-[13px] leading-relaxed text-none-fg">
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>AI is off team-wide.</b> Every feature uses its logic-only fallback and members see no AI badges. Feature switches below are kept and apply when AI mode is back on.
          </span>
        </div>
      )}

      <Tabs
        label="AI control centre sections"
        value={tab}
        onChange={(v) => void navigate({ search: (s) => ({ ...s, tab: v === 'overview' ? undefined : v }), replace: true })}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'usage', label: 'Usage' },
          { value: 'registry', label: 'Registry', count: d?.features.length ?? null },
        ]}
        className="self-start"
      />

      {tab === 'overview' && (
        <TabPanel k="overview">
          {q.isError ? (
            <Card>
              <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            </Card>
          ) : !d ? (
            <div className="flex flex-col gap-3">
              <SkeletonCard lines={2} />
              <SkeletonCard lines={6} />
            </div>
          ) : (
            <AiOverviewTab data={d} isSuper={isSuper} />
          )}
        </TabPanel>
      )}
      {tab === 'usage' && (
        <TabPanel k="usage">
          <AiUsageTab />
        </TabPanel>
      )}
      {tab === 'registry' && (
        <TabPanel k="registry">
          <AiRegistryTab isSuper={isSuper} overview={d} />
        </TabPanel>
      )}
    </>
  );
}

function EnvironmentNote({ mode }: { mode: 'mock' | 'off' }) {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-[14px] border border-under-bg bg-under-bg/70 px-4 py-3 text-[13px] leading-relaxed text-under-fg">
      <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      {mode === 'mock' ? (
        <span>
          <b>Mock mode.</b> The gateway returns canned responses. Nothing is sent to the model and nothing is billed, so spend and token numbers here are illustrative.
        </span>
      ) : (
        <span>
          <b>No API key configured.</b> The gateway can’t reach the model, so every feature uses its logic-only fallback until a key is added to the server environment.
        </span>
      )}
    </div>
  );
}
