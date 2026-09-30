import { ShieldCheck } from 'lucide-react';
import type { AdminSessionRow } from '@clubhouse/contracts';
import { useAdminSessions, useRevokeSession } from '@/features/system';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { confirmAction, DataTable, EmptyState, Mono, PageHeader, PersonCell, Pill, RolePill, RowAction, type Column } from '@/ui';

/** Active admin sessions with revoke (NFR-SEC). */
export function SessionsPage() {
  const q = useAdminSessions();
  const revoke = useRevokeSession();

  const onRevoke = async (s: AdminSessionRow) => {
    const ok = await confirmAction({
      title: 'Revoke session?',
      body: `${s.person.name} will be signed out on ${s.deviceLabel ?? 'this device'} and must sign in again.`,
      impact: [`1 session · last seen ${fmtRelative(s.lastSeenAt)}`],
      confirmLabel: 'Revoke',
      onConfirm: () => revoke.mutateAsync(s.id),
    });
    return ok;
  };

  const columns: Column<AdminSessionRow>[] = [
    { id: 'person', header: 'Admin', width: 'minmax(200px,1.4fr)', sortValue: (r) => r.person.name, cell: (r) => <PersonCell person={r.person} sub={r.current ? 'This session' : undefined} /> },
    { id: 'role', header: 'Role', width: '120px', sortValue: (r) => r.role, cell: (r) => <RolePill role={r.role} /> },
    { id: 'device', header: 'Device', width: 'minmax(140px,1fr)', sortValue: (r) => r.deviceLabel ?? '', cell: (r) => <span className="text-[13px]">{r.deviceLabel ?? 'Unknown device'}</span> },
    { id: 'ip', header: 'IP', width: '130px', cell: (r) => <Mono muted>{r.ip ?? '—'}</Mono> },
    { id: 'seen', header: 'Last seen', width: '130px', sortValue: (r) => r.lastSeenAt, cell: (r) => <span title={fmtDateTime(r.lastSeenAt)} className="text-[13px] text-muted">{fmtRelative(r.lastSeenAt)}</span> },
    { id: 'admin', header: 'Admin activity', width: '130px', sortValue: (r) => r.adminLastActiveAt ?? '', cell: (r) => <span className="text-[13px] text-muted">{fmtRelative(r.adminLastActiveAt, '—')}</span> },
    { id: 'act', header: '', width: '90px', align: 'end', cell: (r) => (r.current ? <Pill tone="in">Current</Pill> : <RowAction tone="danger" onClick={() => void onRevoke(r)}>Revoke</RowAction>) },
  ];

  return (
    <>
      <PageHeader eyebrow="Security" title="Admin sessions" description="Everyone signed in to the admin panel. Revoke anything you don’t recognise. The admin area asks for a password again after 12 idle hours." />
      <DataTable
        label="Admin sessions"
        columns={columns}
        rows={q.data}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(r) => r.id}
        initialSort={{ id: 'seen', dir: 'desc' }}
        search={{ placeholder: 'Search by name, device or IP', text: (r) => `${r.person.name} ${r.deviceLabel ?? ''} ${r.ip ?? ''}` }}
        filters={[
          { id: 'role', label: 'Role', options: [{ value: '', label: 'All roles' }, { value: 'admin', label: 'Admin' }, { value: 'super_admin', label: 'Super Admin' }], predicate: (r, v) => r.role === v },
        ]}
        empty={<EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No active admin sessions" />}
      />
    </>
  );
}
