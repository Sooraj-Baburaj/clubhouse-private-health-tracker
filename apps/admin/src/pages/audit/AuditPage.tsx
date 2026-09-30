import { useNavigate, useSearch } from '@tanstack/react-router';
import { Download, ScrollText, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '@clubhouse/client';
import type { AdminMemberRow, AuditRow } from '@clubhouse/contracts';
import { useDebounced } from '@clubhouse/ui';
import { cleanAuditFilters, useAuditLog, type AuditFilters } from '@/features/audit';
import { fmtDateTime, fmtInt, fmtRelative, humanize } from '@/lib/format';
import { Button, Card, DataTable, EmptyState, Field, FormGrid, Input, MemberSelect, Mono, PageHeader, PersonCell, Pill, Toggle, type Column } from '@/ui';
import { AuditDiff } from './AuditDiff';

const ROLE_LABEL: Record<string, string> = { super_admin: 'Super Admin', admin: 'Admin', member: 'Member' };

/** Known values offered as suggestions; any text still works (action matches as a prefix). */
const ACTION_SUGGESTIONS = ['member.', 'member.role_change', 'member.deactivate', 'member.delete_data', 'member.reset_password', 'targets.override', 'goal.update', 'diet.publish', 'plan.update', 'chat.clear', 'ai.', 'settings.update', 'retention.update', 'session.revoke', 'jobs.run', 'admin.sign_in'];
const TARGET_TYPES = ['user', 'profile', 'team', 'diet_plan', 'diet_option', 'activity_plan', 'rest_week', 'plan_proposal', 'chat_message', 'meme', 'trigger', 'ai', 'food', 'session', 'job', 'export'];

const isAdmin = (m: AdminMemberRow) => m.role !== 'member';

/** Audit log (ADM-AUD): every admin action, filterable, newest first, CSV export. */
export function AuditPage() {
  const search = useSearch({ from: '/shell/audit' });
  const navigate = useNavigate({ from: '/audit' });
  const setSearch = (patch: Partial<typeof search>) => void navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

  // Free-text filters are debounced into the URL.
  const [actionDraft, setActionDraft] = useState(search.action ?? '');
  const [targetDraft, setTargetDraft] = useState(search.targetType ?? '');
  const debAction = useDebounced(actionDraft, 350);
  const debTarget = useDebounced(targetDraft, 350);
  // `pushed` remembers what this page last wrote, so typing isn't overwritten when the URL catches up.
  const pushed = useRef({ action: search.action, targetType: search.targetType });
  useEffect(() => {
    const v = debAction.trim() || undefined;
    if (v === search.action) return;
    pushed.current.action = v;
    setSearch({ action: v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debAction]);
  useEffect(() => {
    const v = debTarget.trim() || undefined;
    if (v === search.targetType) return;
    pushed.current.targetType = v;
    setSearch({ targetType: v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debTarget]);
  // Follow URL changes that came from elsewhere (back/forward, links, "Clear filters").
  useEffect(() => {
    if (search.action === pushed.current.action) return;
    pushed.current.action = search.action;
    setActionDraft(search.action ?? '');
  }, [search.action]);
  useEffect(() => {
    if (search.targetType === pushed.current.targetType) return;
    pushed.current.targetType = search.targetType;
    setTargetDraft(search.targetType ?? '');
  }, [search.targetType]);

  // Date range isn't part of the route's search params, so it lives in page state.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rangeError = from && to && to < from ? 'End date is before the start date' : null;

  const filters: AuditFilters = {
    actorId: search.actorId,
    memberId: search.memberId,
    action: search.action,
    targetType: search.targetType,
    highImpact: search.highImpact === '1' ? '1' : undefined,
    from: from || undefined,
    to: rangeError ? undefined : to || undefined,
  };
  const clean = cleanAuditFilters(filters);
  const active = Object.keys(clean).length;
  const q = useAuditLog(filters);
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.rows) ?? [], [q.data]);
  const highCount = rows.filter((r) => r.highImpact).length;

  const clearAll = () => {
    setActionDraft('');
    setTargetDraft('');
    setFrom('');
    setTo('');
    void navigate({ search: {}, replace: true });
  };

  const columns: Column<AuditRow>[] = [
    {
      id: 'when',
      header: 'When',
      width: '120px',
      sortValue: (r) => r.createdAt,
      cell: (r) => (
        <span title={fmtDateTime(r.createdAt)} className="flex flex-col font-mono text-[12px] leading-snug">
          <span>{fmtRelative(r.createdAt)}</span>
          <span className="text-muted">{fmtDateTime(r.createdAt)}</span>
        </span>
      ),
    },
    {
      id: 'actor',
      header: 'Actor',
      width: 'minmax(160px,1fr)',
      sortValue: (r) => r.actor?.name ?? '',
      cell: (r) => (r.actor ? <PersonCell person={r.actor} size={28} sub={r.actorRole ? (ROLE_LABEL[r.actorRole] ?? humanize(r.actorRole)) : undefined} /> : <span className="text-[13px] text-muted">System</span>),
    },
    {
      id: 'action',
      header: 'Action',
      width: 'minmax(170px,1.1fr)',
      sortValue: (r) => r.action,
      cell: (r) => (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <span className="font-semibold leading-snug">{readableAction(r.action)}</span>
          <Mono muted className="break-all">
            {r.action}
          </Mono>
          {r.highImpact && (
            <Pill tone="over" className="!py-[1px] !text-[11px]">
              High impact
            </Pill>
          )}
        </div>
      ),
    },
    {
      id: 'target',
      header: 'Target',
      width: 'minmax(150px,1fr)',
      sortValue: (r) => r.targetType,
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px]">
            {humanize(r.targetType)}
            {r.targetId && (
              <Mono muted className="ml-1.5">
                <span title={r.targetId}>{shortId(r.targetId)}</span>
              </Mono>
            )}
          </span>
          {r.member && <PersonCell person={r.member} size={22} className="text-[13px]" />}
        </div>
      ),
    },
    { id: 'diff', header: 'Before → after', headerLabel: 'Before and after', width: 'minmax(240px,2fr)', cell: (r) => <AuditDiff before={r.before} after={r.after} /> },
    {
      id: 'reason',
      header: 'Reason',
      width: 'minmax(140px,1fr)',
      sortValue: (r) => r.reason ?? '',
      cell: (r) =>
        r.reason ? (
          <span className="line-clamp-3 text-[13px] leading-snug" title={r.reason}>
            {r.reason}
          </span>
        ) : (
          <span className="text-[13px] text-muted">—</span>
        ),
    },
    { id: 'ip', header: 'IP', width: '120px', sortValue: (r) => r.ip ?? '', cell: (r) => <Mono muted className="break-all">{r.ip ?? '—'}</Mono> },
  ];

  const csvHref = adminApi.audit.csvUrl(clean);

  return (
    <>
      <PageHeader
        eyebrow="Every admin action"
        title="Audit log"
        description="An append-only record of what admins changed, kept for at least 12 months. High-impact actions carry the reason that was given."
        actions={
          <a href={csvHref} download className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgba(182,49,108,0.25)] bg-white px-[18px] text-[14px] font-semibold text-ink transition-colors hover:border-accent hover:text-ink">
            <Download aria-hidden className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="th m-0 font-mono">Filters{active > 0 && <span className="ml-2 text-accent">{active} on</span>}</h2>
          {active > 0 && (
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={clearAll}>
              Clear filters
            </Button>
          )}
        </div>
        <FormGrid min={200}>
          <Field label="Actor">
            <MemberSelect aria-label="Actor" value={search.actorId ?? ''} onChange={(id) => setSearch({ actorId: id || undefined })} placeholder="All admins" includeInactive filter={isAdmin} />
          </Field>
          <Field label="Member affected">
            <MemberSelect aria-label="Member affected" value={search.memberId ?? ''} onChange={(id) => setSearch({ memberId: id || undefined })} placeholder="Anyone" includeInactive />
          </Field>
          <Field label="Action" hint="Starts with, e.g. member.">
            <Input value={actionDraft} onChange={(e) => setActionDraft(e.target.value)} list="audit-actions" placeholder="Any action" maxLength={60} className="font-mono text-[13px]" spellCheck={false} />
          </Field>
          <Field label="Target type">
            <Input value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)} list="audit-targets" placeholder="Any target" maxLength={40} className="font-mono text-[13px]" spellCheck={false} />
          </Field>
          <Field label="From">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="font-mono text-[13px]" />
          </Field>
          <Field label="To" error={rangeError}>
            <Input type="date" value={to} min={from || undefined} invalid={!!rangeError} onChange={(e) => setTo(e.target.value)} className="font-mono text-[13px]" />
          </Field>
        </FormGrid>
        <div className="flex items-center gap-3 border-t border-hairline pt-3">
          <Toggle label="High-impact only" checked={search.highImpact === '1'} onChange={(v) => setSearch({ highImpact: v ? '1' : undefined })} />
          <span className="flex flex-col">
            <span className="text-[14px] font-semibold">High-impact only</span>
            <span className="text-[12px] text-muted">Role changes, data deletion, overrides, chat clears and other audited-with-reason actions.</span>
          </span>
        </div>
        <datalist id="audit-actions">
          {Array.from(new Set([...ACTION_SUGGESTIONS, ...rows.map((r) => r.action)])).map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <datalist id="audit-targets">
          {Array.from(new Set([...TARGET_TYPES, ...rows.map((r) => r.targetType)])).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Card>

      <DataTable
        label="Audit log"
        columns={columns}
        rows={q.data ? rows : undefined}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(r) => String(r.id)}
        minWidth={1240}
        initialSort={{ id: 'when', dir: 'desc' }}
        rowClassName={(r) => r.highImpact && 'bg-accent-tint/25 shadow-[inset_3px_0_0_var(--color-accent)]'}
        search={{ placeholder: 'Search loaded entries', text: (r) => `${r.actor?.name ?? 'system'} ${r.action} ${readableAction(r.action)} ${r.targetType} ${r.targetId ?? ''} ${r.member?.name ?? ''} ${r.reason ?? ''} ${r.ip ?? ''}` }}
        toolbar={
          <span className="text-[12px] text-muted" aria-live="polite">
            {q.isFetching && !q.isFetchingNextPage && q.data ? 'Updating…' : `${fmtInt(rows.length)} loaded${highCount ? ` · ${fmtInt(highCount)} high impact` : ''}${q.hasNextPage ? ' · more available' : ''}`}
          </span>
        }
        footer={
          q.hasNextPage ? (
            <Button size="sm" variant="secondary" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
              Load more
            </Button>
          ) : rows.length > 0 ? (
            <span>That’s everything{active ? ' for these filters' : ''}.</span>
          ) : null
        }
        empty={
          <EmptyState
            icon={<ScrollText className="h-5 w-5" />}
            title={active ? 'No entries match these filters' : 'No admin actions yet'}
            body={active ? 'Try a wider date range or clear a filter.' : 'Changes made in the admin panel are recorded here.'}
            action={
              active ? (
                <Button size="sm" variant="secondary" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        }
      />
    </>
  );
}

function readableAction(action: string): string {
  const [area, ...rest] = action.split('.');
  const verb = rest.join(' ');
  return verb ? `${humanize(area ?? '')}: ${verb.replace(/_/g, ' ')}` : humanize(action);
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
