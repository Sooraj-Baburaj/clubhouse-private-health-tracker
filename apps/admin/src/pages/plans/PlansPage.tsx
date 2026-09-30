import { useNavigate, useSearch } from '@tanstack/react-router';
import { CalendarCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import type { AdminPlanRow } from '@clubhouse/contracts';
import { weekStartOf, weekdayOf } from '@clubhouse/domain';
import { useMembers } from '@/features/directory';
import { usePlanProposals, usePlanRestWeeks, usePlans } from '@/features/plans';
import { fmtDate, todayLocal } from '@/lib/format';
import {
  Button,
  DataTable,
  DayChips,
  EmptyState,
  Mono,
  PageHeader,
  PersonCell,
  Pill,
  RowAction,
  TabPanel,
  Tabs,
  type Column,
  type DayState,
} from '@/ui';
import { AssignPlanDrawer } from './AssignPlanDrawer';
import { PlanEditorDrawer } from './PlanEditorDrawer';
import { itemSummary } from './PlanItemsEditor';
import { ProposalsPanel, RankingPanel, RestWeeksPanel } from './PlanPanels';

type Tab = 'plans' | 'ranking' | 'proposals' | 'rest';
const TABS: Tab[] = ['plans', 'ranking', 'proposals', 'rest'];

/** Share of the week that has passed (Mon = 1/7 … Sun = 7/7), for "behind" pacing. */
function weekElapsed(): number {
  return (weekdayOf(todayLocal()) + 1) / 7;
}

function isBehind(r: AdminPlanRow): boolean {
  return r.planned > 0 && r.done < Math.floor(r.planned * weekElapsed());
}

function dayStates(r: AdminPlanRow): { weekday: number; state: DayState }[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const x = r.days.find((y) => y.weekday === d);
    return { weekday: d, state: x?.done ? 'done' : x?.planned ? 'planned' : 'none' };
  });
}

/** Activity plans: plan table + editor drawer, assign to many, weekly ranking, proposals inbox and rest weeks. */
export function PlansPage() {
  const search = useSearch({ from: '/shell/plans' });
  const navigate = useNavigate({ from: '/plans' });
  const tab: Tab = TABS.includes(search.tab as Tab) ? (search.tab as Tab) : 'plans';
  const plans = usePlans();
  const proposals = usePlanProposals();
  const rest = usePlanRestWeeks();
  const members = useMembers();
  const [assignOpen, setAssignOpen] = useState(false);

  const setTab = (t: Tab) =>
    void navigate({ search: (s) => ({ ...s, tab: t === 'plans' ? undefined : t }), replace: true });
  const openMember = (id: string) => void navigate({ search: (s) => ({ ...s, member: id }) });
  const closeMember = () => void navigate({ search: (s) => ({ ...s, member: undefined }) });

  const monday = weekStartOf(todayLocal());
  const pendingProposals = proposals.data?.filter((p) => p.status === 'pending').length ?? 0;
  const pendingRest = rest.data?.filter((r) => r.status === 'pending').length ?? 0;
  const withPlan = plans.data?.filter((r) => r.items.length > 0).length;

  const selectedRow = plans.data?.find((r) => r.userId === search.member);
  const selectedPerson =
    selectedRow?.person ?? members.data?.find((m) => m.id === search.member)?.person ?? null;

  const columns: Column<AdminPlanRow>[] = [
    {
      id: 'person',
      header: 'Member',
      width: 'minmax(170px,1.1fr)',
      sortValue: (r) => r.person.name,
      cell: (r) => (
        <PersonCell person={r.person} size={30} sub={r.items.length ? undefined : 'No plan yet'} />
      ),
    },
    {
      id: 'items',
      header: 'Expected per week',
      width: 'minmax(180px,1.4fr)',
      sortValue: (r) => r.items.length,
      cell: (r) =>
        r.items.length ? (
          <span className="line-clamp-2 text-[14px]">{r.items.map(itemSummary).join(' · ')}</span>
        ) : (
          <span className="text-[13px] text-muted">Nothing expected</span>
        ),
    },
    {
      id: 'days',
      header: 'Days picked by member',
      headerLabel: 'Days picked',
      width: '232px',
      sortValue: (r) => r.days.filter((d) => d.planned || d.done).length,
      cell: (r) => <DayChips days={dayStates(r)} />,
    },
    {
      id: 'week',
      header: 'This week',
      width: '96px',
      sortValue: (r) => (r.planned ? r.done / r.planned : -1),
      cell: (r) =>
        r.planned ? (
          <Mono className={isBehind(r) ? 'text-accent-dark' : undefined}>
            {r.done} of {r.planned}
          </Mono>
        ) : (
          <Mono muted>—</Mono>
        ),
    },
    {
      id: 'flags',
      header: 'Waiting on you',
      headerLabel: 'Waiting on you',
      width: 'minmax(150px,0.9fr)',
      sortValue: (r) => r.pendingProposals + (r.restWeekPending ? 1 : 0),
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.pendingProposals > 0 && (
            <button type="button" onClick={() => setTab('proposals')} className="rounded-full">
              <Pill tone="accent">
                {r.pendingProposals} {r.pendingProposals === 1 ? 'proposal' : 'proposals'}
              </Pill>
            </button>
          )}
          {r.restWeekPending && (
            <button type="button" onClick={() => setTab('rest')} className="rounded-full">
              <Pill tone="under">Rest week request</Pill>
            </button>
          )}
        </div>
      ),
    },
    {
      id: 'act',
      header: '',
      width: '64px',
      align: 'end',
      cell: (r) => (
        <RowAction onClick={() => openMember(r.userId)}>
          {r.items.length ? 'Edit' : 'Set up'}
        </RowAction>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`Week of ${fmtDate(monday)}${withPlan != null ? ` · ${withPlan} ${withPlan === 1 ? 'plan' : 'plans'}` : ''}`}
        title="Activity plans"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAssignOpen(true)}>
            Assign plan
          </Button>
        }
      />
      <Tabs
        label="Activity plan sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'plans', label: 'Plans' },
          { value: 'ranking', label: 'Ranking' },
          { value: 'proposals', label: 'Proposals', count: pendingProposals },
          { value: 'rest', label: 'Rest weeks', count: pendingRest },
        ]}
        className="self-start"
      />
      {tab === 'plans' && (
        <TabPanel k="plans">
          <DataTable
            label="Activity plans"
            columns={columns}
            rows={plans.data}
            loading={plans.isPending}
            error={plans.error}
            onRetry={() => void plans.refetch()}
            rowKey={(r) => r.userId}
            onRowClick={(r) => openMember(r.userId)}
            initialSort={{ id: 'person', dir: 'asc' }}
            minWidth={920}
            search={{
              placeholder: 'Search members or activities',
              text: (r) => `${r.person.name} ${r.items.map((i) => i.typeName).join(' ')}`,
            }}
            filters={[
              {
                id: 'state',
                label: 'Plan state',
                options: [
                  { value: '', label: 'All members' },
                  { value: 'none', label: 'No plan' },
                  { value: 'behind', label: 'Behind this week' },
                  { value: 'waiting', label: 'Has proposals or requests' },
                ],
                predicate: (r, v) =>
                  v === 'none'
                    ? r.items.length === 0
                    : v === 'behind'
                      ? isBehind(r)
                      : r.pendingProposals > 0 || r.restWeekPending,
              },
            ]}
            footer={
              <span className="inline-flex items-center gap-3">
                <Legend cls="bg-accent" label="Done" />
                <Legend cls="bg-accent-tint" label="Planned" />
              </span>
            }
            empty={
              <EmptyState
                icon={<CalendarCheck className="h-5 w-5" />}
                title="No members yet"
                body="Add members first, then assign them an activity plan."
                action={
                  <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
                    Assign plan
                  </Button>
                }
              />
            }
          />
        </TabPanel>
      )}
      {tab === 'ranking' && (
        <TabPanel k="ranking">
          <p className="m-0 text-[13px] text-muted">
            This week so far, by share of planned sessions done. Members on a rest week are left
            out.
          </p>
          <RankingPanel onOpen={openMember} />
        </TabPanel>
      )}
      {tab === 'proposals' && (
        <TabPanel k="proposals">
          <ProposalsPanel onOpen={openMember} />
        </TabPanel>
      )}
      {tab === 'rest' && (
        <TabPanel k="rest">
          <RestWeeksPanel />
        </TabPanel>
      )}
      <PlanEditorDrawer
        userId={search.member ?? null}
        row={selectedRow}
        person={selectedPerson}
        onClose={closeMember}
      />
      <AssignPlanDrawer open={assignOpen} onClose={() => setAssignOpen(false)} rows={plans.data} />
    </>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-2.5 w-2.5 rounded-[3px] ${cls}`} />
      {label}
    </span>
  );
}
