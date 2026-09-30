import { useNavigate, useSearch } from '@tanstack/react-router';
import { Check, FileUp, Plus, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AdminMemberRow } from '@clubhouse/contracts';
import { useMembers, useTeamSettings } from '@/features/directory';
import { cn } from '@/lib/cn';
import { fmtDateTime, fmtInt, fmtRelative, plural } from '@/lib/format';
import { Button, DataTable, EmptyState, FilterSelect, Mono, PageHeader, PersonCell, Pill, RolePill, RowAction, SearchInput, StatusPill, type Column } from '@/ui';
import { ImportMembersModal } from './ImportMembersModal';
import { MemberEditDrawer } from './MemberEditDrawer';
import { NewMemberModal } from './NewMemberModal';
import { tempPasswordText } from './shared';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'deactivated', label: 'Deactivated' },
];
const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];
const LOGGED_OPTIONS = [
  { value: '', label: 'Logged today: any' },
  { value: 'yes', label: 'Logged today' },
  { value: 'no', label: 'Not logged yet' },
];

function eyebrowFor(rows: AdminMemberRow[] | undefined): string {
  if (!rows) return 'Members';
  const invited = rows.filter((r) => r.status === 'invited').length;
  const deactivated = rows.filter((r) => r.status === 'deactivated').length;
  return [plural(rows.length - deactivated, 'member'), invited ? `${invited} invited` : null, deactivated ? `${deactivated} deactivated` : null].filter(Boolean).join(' · ');
}

/** Members (design "Members"): searchable/sortable/filterable table, New member, Import CSV, quick-edit drawer. */
export function MembersPage() {
  const search = useSearch({ from: '/shell/members' });
  const navigate = useNavigate({ from: '/members' });
  const q = useMembers();
  useTeamSettings(); // warm the team timezone for the modals/drawer
  const [logged, setLogged] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const query = search.q ?? '';
  const status = search.status ?? '';
  const role = search.role ?? '';
  const setSearch = (patch: Partial<typeof search>) => void navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (q.data ?? []).filter(
      (r) =>
        (!needle || `${r.person.name} ${r.username} ${r.email ?? ''}`.toLowerCase().includes(needle)) &&
        (!status || r.status === status) &&
        (!role || r.role === role) &&
        (!logged || (logged === 'yes') === r.loggedToday),
    );
  }, [q.data, query, status, role, logged]);

  const filtered = !!(query || status || role || logged);
  const editing = editId ? (q.data?.find((m) => m.id === editId) ?? null) : null;
  const openEdit = (m: AdminMemberRow) => {
    setEditId(m.id);
    setEditOpen(true);
  };
  const clearFilters = () => {
    setLogged('');
    setSearch({ q: undefined, status: undefined, role: undefined });
  };

  const columns: Column<AdminMemberRow>[] = [
    {
      id: 'member',
      header: 'Member',
      width: 'minmax(200px,1.6fr)',
      sortValue: (r) => r.person.name,
      cell: (r) => <PersonCell person={r.person} sub={`@${r.username}`} dim={r.status === 'deactivated'} />,
    },
    { id: 'role', header: 'Role', width: '118px', sortValue: (r) => ({ member: 0, admin: 1, super_admin: 2 })[r.role], cell: (r) => <RolePill role={r.role} /> },
    {
      id: 'status',
      header: 'Status',
      width: 'minmax(128px,0.9fr)',
      sortValue: (r) => r.status,
      cell: (r) => {
        const t = tempPasswordText(r.tempPasswordExpiresAt);
        return (
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <StatusPill status={r.status} />
            {t && (
              <span className={cn('truncate text-[11px]', t.expired ? 'font-semibold text-accent-dark' : 'text-muted')} title={`Expires ${fmtDateTime(r.tempPasswordExpiresAt)}`}>
                {t.text}
              </span>
            )}
          </span>
        );
      },
    },
    { id: 'streak', header: 'Streak', width: '86px', sortValue: (r) => r.streak, cell: (r) => <Mono muted={!r.streak}>{r.streak ? `${fmtInt(r.streak)} day${r.streak === 1 ? '' : 's'}` : '—'}</Mono> },
    {
      id: 'last',
      header: 'Last active',
      width: '108px',
      sortValue: (r) => r.lastActiveAt ?? '',
      cell: (r) => (
        <span className="text-[13px] text-muted" title={r.lastActiveAt ? fmtDateTime(r.lastActiveAt) : undefined}>
          {fmtRelative(r.lastActiveAt)}
        </span>
      ),
    },
    {
      id: 'logged',
      header: 'Today',
      headerLabel: 'Logged today',
      width: '96px',
      sortValue: (r) => r.loggedToday,
      cell: (r) =>
        r.status === 'deactivated' ? (
          <span className="text-muted">—</span>
        ) : r.loggedToday ? (
          <Pill tone="in" icon={<Check aria-hidden className="h-3 w-3" strokeWidth={2.5} />}>
            Logged
          </Pill>
        ) : (
          <Pill tone="none">Not yet</Pill>
        ),
    },
    {
      id: 'plan',
      header: 'Plan',
      headerLabel: 'Plan adherence this week',
      width: '84px',
      sortValue: (r) => (r.plan && r.plan.target ? r.plan.done / r.plan.target : null),
      cell: (r) =>
        r.plan && r.plan.target ? (
          <span title={`${r.plan.done} of ${r.plan.target} planned sessions this week`}>
            <Mono className={r.plan.done >= r.plan.target ? 'text-in-fg' : undefined}>
              {r.plan.done}/{r.plan.target}
            </Mono>
          </span>
        ) : (
          <Mono muted>—</Mono>
        ),
    },
    { id: 'ai', header: 'AI calls', headerLabel: 'AI calls this month', width: '76px', align: 'end', sortValue: (r) => r.aiCallsMonth, cell: (r) => <Mono muted={!r.aiCallsMonth}>{fmtInt(r.aiCallsMonth)}</Mono> },
    {
      id: 'act',
      header: '',
      headerLabel: 'Actions',
      width: '56px',
      align: 'end',
      cell: (r) => (
        <RowAction label={`Edit ${r.person.name}`} onClick={() => openEdit(r)}>
          Edit
        </RowAction>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={eyebrowFor(q.data)}
        title="Members"
        actions={
          <>
            <SearchInput value={query} onChange={(v) => setSearch({ q: v || undefined })} placeholder="Search members" label="Search members by name, username or email" />
            <Button variant="outline" icon={<FileUp className="h-4 w-4" />} onClick={() => setSearch({ import: 1 })}>
              Import CSV
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setSearch({ new: 1 })}>
              New member
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Status" value={status} onChange={(v) => setSearch({ status: v || undefined })} options={STATUS_OPTIONS} />
          <FilterSelect label="Role" value={role} onChange={(v) => setSearch({ role: v || undefined })} options={ROLE_OPTIONS} />
          <FilterSelect label="Logged today" value={logged} onChange={setLogged} options={LOGGED_OPTIONS} />
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        <DataTable
          label="Members"
          columns={columns}
          rows={q.data ? rows : undefined}
          loading={q.isPending}
          error={q.error}
          onRetry={() => void q.refetch()}
          rowKey={(r) => r.id}
          initialSort={{ id: 'member', dir: 'asc' }}
          minWidth={980}
          onRowClick={(r) => void navigate({ to: '/members/$id', params: { id: r.id }, search: {} })}
          rowClassName={(r) => r.status === 'deactivated' && 'text-muted'}
          empty={
            filtered ? (
              <EmptyState
                title="No members match"
                body="Try a different search or clear the filters."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<UserPlus className="h-5 w-5" />}
                title="No members yet"
                body="Clubhouse is invite-only. Add people one at a time or import a CSV."
                action={
                  <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setSearch({ new: 1 })}>
                    New member
                  </Button>
                }
              />
            )
          }
          footer={filtered && q.data ? <span>{fmtInt(q.data.length)} in total</span> : undefined}
        />
      </div>

      <NewMemberModal open={search.new === 1} onClose={() => setSearch({ new: undefined })} />
      <ImportMembersModal open={search.import === 1} onClose={() => setSearch({ import: undefined })} />
      <MemberEditDrawer member={editing} open={editOpen && !!editing} onClose={() => setEditOpen(false)} />
    </>
  );
}
