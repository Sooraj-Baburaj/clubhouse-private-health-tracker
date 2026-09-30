import { AlertTriangle, Plus, Zap } from 'lucide-react';
import { useMemo } from 'react';
import { MEME_TONES, TRIGGER_EVENTS, type AdminTriggerDto } from '@clubhouse/contracts';
import { useToggleTrigger, useTriggers } from '@/features/memes';
import { fmtInt, fmtNum, fmtPct, plural } from '@/lib/format';
import { Button, DataTable, EmptyState, Mono, Pill, Toggle, type Column } from '@/ui';
import { actionLabel, EVENT_LABELS, eventLabel, TONE_LABELS, TonePill } from './shared';

/** Triggers tab: the design's Event / Condition / Action / Fired / On table, plus health signals. */
export function TriggersTab({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const q = useTriggers();
  const toggle = useToggleTrigger();
  const rows = useMemo(() => (q.data ? [...q.data].sort((a, b) => a.sortOrder - b.sortOrder) : undefined), [q.data]);
  const annoying = (q.data ?? []).filter((t) => t.enabled && t.annoying);

  const columns: Column<AdminTriggerDto>[] = [
    {
      id: 'name',
      header: 'Trigger',
      width: 'minmax(190px,1.2fr)',
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-semibold" title={r.name}>
            {r.name}
          </span>
          <span className="flex flex-wrap items-center gap-1">
            <TonePill tone={r.tone} />
            {r.annoying && (
              <Pill tone="over" icon={<AlertTriangle aria-hidden className="h-3 w-3" />} title={`Members dismiss ${fmtPct(r.dismissRate, true)} of what this sends. Consider a longer cooldown or switching it off.`}>
                Annoying?
              </Pill>
            )}
            {r.catalogKey && <Pill tone="muted">Starter</Pill>}
          </span>
        </div>
      ),
    },
    { id: 'event', header: 'Event', width: '130px', sortValue: (r) => r.summary.event, cell: (r) => <span className="text-[13px] font-semibold">{eventLabel(r.summary.event)}</span> },
    { id: 'cond', header: 'Condition', width: 'minmax(200px,1.3fr)', cell: (r) => <span className="line-clamp-2 text-[13px]" title={r.summary.condition}>{r.summary.condition}</span> },
    { id: 'action', header: 'Action', width: 'minmax(170px,1.1fr)', cell: (r) => <span className="line-clamp-2 text-[13px]" title={r.summary.action}>{r.summary.action || actionLabel(r.action)}</span> },
    {
      id: 'fired',
      header: 'Fired',
      width: '92px',
      align: 'end',
      sortValue: (r) => r.firedCount,
      cell: (r) => (
        <span className="flex flex-col items-end leading-tight">
          <Mono>{fmtInt(r.firedCount)}</Mono>
          <Mono muted className="text-[11px]">
            {fmtNum(r.firesPerWeek, 1)}/wk
          </Mono>
        </span>
      ),
    },
    { id: 'reactions', header: 'Reactions', width: '90px', align: 'end', sortValue: (r) => r.reactions, cell: (r) => <Mono>{fmtInt(r.reactions)}</Mono> },
    {
      id: 'dismiss',
      header: 'Dismissed',
      width: '96px',
      align: 'end',
      sortValue: (r) => r.dismissRate,
      cell: (r) => <Mono className={r.annoying ? 'font-semibold text-over-fg' : undefined}>{fmtPct(r.dismissRate, true)}</Mono>,
    },
    {
      id: 'on',
      header: 'On',
      width: '60px',
      align: 'end',
      sortValue: (r) => r.enabled,
      cell: (r) => <Toggle checked={r.enabled} onChange={(enabled) => toggle.mutate({ id: r.id, enabled })} label={`${r.enabled ? 'Switch off' : 'Switch on'} ${r.name}`} />,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {annoying.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-[14px] border border-over-bg bg-over-bg/40 px-4 py-3 text-[13px] leading-snug">
          <AlertTriangle aria-hidden className="mt-[1px] h-4 w-4 shrink-0 text-over-fg" />
          <span>
            <b>{plural(annoying.length, 'trigger')} might be annoying:</b> {annoying.map((t) => t.name).join(', ')}. Members dismiss a large share of what {annoying.length === 1 ? 'it sends' : 'they send'}. Open one to see the numbers.
          </span>
        </div>
      )}
      <DataTable
        label="Meme triggers"
        columns={columns}
        rows={rows}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(r) => r.id}
        onRowClick={(r) => onOpen(r.id)}
        minWidth={1060}
        search={{ placeholder: 'Search triggers', text: (r) => `${r.name} ${r.summary.event} ${r.summary.condition} ${r.summary.action}` }}
        filters={[
          { id: 'event', label: 'Event', options: [{ value: '', label: 'All events' }, ...TRIGGER_EVENTS.map((e) => ({ value: e, label: EVENT_LABELS[e] }))], predicate: (r, v) => r.event === v },
          { id: 'enabled', label: 'On or off', options: [{ value: '', label: 'On and off' }, { value: 'on', label: 'Switched on' }, { value: 'off', label: 'Switched off' }], predicate: (r, v) => r.enabled === (v === 'on') },
          { id: 'tone', label: 'Tone', options: [{ value: '', label: 'All tones' }, ...MEME_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }))], predicate: (r, v) => r.tone === v },
          { id: 'health', label: 'Health', options: [{ value: '', label: 'Any health' }, { value: 'annoying', label: 'Annoying?' }, { value: 'fine', label: 'Looks fine' }], predicate: (r, v) => r.annoying === (v === 'annoying') },
        ]}
        toolbar={
          <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={onNew}>
            New trigger
          </Button>
        }
        rowClassName={(r) => !r.enabled && 'text-muted'}
        empty={
          <EmptyState
            icon={<Zap className="h-5 w-5" />}
            title="No triggers yet"
            body="Triggers decide when a meme shows up: after a log, at day end, on a streak, or on a chat message. The starter catalogue installs switched off."
            action={
              <Button icon={<Plus className="h-4 w-4" />} onClick={onNew}>
                New trigger
              </Button>
            }
          />
        }
      />
    </div>
  );
}
