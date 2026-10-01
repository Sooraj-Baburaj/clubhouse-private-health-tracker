import { useNavigate, useSearch } from '@tanstack/react-router';
import { Target } from 'lucide-react';
import { useState } from 'react';
import type { AdminGoalRow } from '@clubhouse/contracts';
import { CALORIE_FLOOR } from '@clubhouse/domain';
import { useEatBackToggle, useGoals } from '@/features/goals';
import { fmtInt } from '@/lib/format';
import { DataTable, EmptyState, Mono, PageHeader, PersonCell, Pill, RowAction, TabPanel, Tabs, Toggle, type Column } from '@/ui';
import { GoalDrawer } from './GoalDrawer';
import { asGoalType, GOAL_LABEL, goalText, macrosText, NUTRIENT_LABEL, weightText } from './parts';
import { TeamThresholdsTab } from './ThresholdsEditor';

type Tab = 'members' | 'thresholds';

/** Goals & targets (design): per-member targets table + drawer, and the team band-threshold editor. */
export function GoalsPage() {
  const search = useSearch({ from: '/shell/goals' });
  const navigate = useNavigate({ from: '/goals' });
  const q = useGoals();
  const eatBack = useEatBackToggle();
  const tab: Tab = search.tab === 'thresholds' ? 'thresholds' : 'members';

  const memberId = search.member ?? null;
  const row = memberId ? (q.data?.find((r) => r.userId === memberId) ?? null) : null;
  // Keep the last row while the drawer animates out.
  const [lastRow, setLastRow] = useState<AdminGoalRow | null>(null);
  if (row && row !== lastRow) setLastRow(row);

  const openMember = (id: string) => void navigate({ search: (s) => ({ ...s, member: id }) });
  const closeDrawer = () => void navigate({ search: (s) => ({ ...s, member: undefined }), replace: true });
  const setTab = (t: Tab) => void navigate({ search: (s) => ({ ...s, tab: t === 'members' ? undefined : t }), replace: true });

  const overriddenCount = (q.data ?? []).filter((r) => r.targets?.overridden.length).length;

  const columns: Column<AdminGoalRow>[] = [
    { id: 'member', header: 'Member', width: 'minmax(180px,1.3fr)', sortValue: (r) => r.person.name, cell: (r) => <PersonCell person={r.person} size={28} /> },
    { id: 'goal', header: 'Goal', width: 'minmax(150px,1.1fr)', sortValue: (r) => `${r.goalType ?? 'z'}${r.paceKgWeek ?? 0}`, cell: (r) => <span className={r.goalType ? undefined : 'text-muted'}>{goalText(r.goalType, r.paceKgWeek)}</span> },
    { id: 'weight', header: 'Weight', width: '130px', sortValue: (r) => r.weightKg, cell: (r) => <Mono>{weightText(r.weightKg, r.targetWeightKg)}</Mono> },
    {
      id: 'kcal',
      header: 'Calories',
      width: '96px',
      align: 'end',
      sortValue: (r) => r.targets?.kcal,
      cell: (r) => (
        <Mono className={r.targets?.overridden.includes('kcal') ? 'font-semibold text-accent-dark' : undefined}>
          {r.targets ? fmtInt(r.targets.kcal) : '—'}
        </Mono>
      ),
    },
    { id: 'macros', header: 'P / C / F / Fibre (g)', headerLabel: 'Protein, carbs, fat, fibre in grams', width: 'minmax(150px,1.1fr)', cell: (r) => <Mono muted>{macrosText(r.targets)}</Mono> },
    {
      id: 'override',
      header: 'Targets',
      width: '120px',
      sortValue: (r) => (r.targets ? r.targets.overridden.length : -1),
      cell: (r) =>
        !r.targets ? (
          <Pill tone="none">Not set</Pill>
        ) : r.targets.overridden.length ? (
          <Pill tone="accent" title={`${r.targets.overridden.map((n) => NUTRIENT_LABEL[n as keyof typeof NUTRIENT_LABEL] ?? n).join(', ')} overridden${r.targets.overriddenBy ? ` by ${r.targets.overriddenBy.name}` : ''}${r.targets.overrideReason ? `: “${r.targets.overrideReason}”` : ''}`}>
            Override
          </Pill>
        ) : (
          <Pill tone="muted">Calculated</Pill>
        ),
    },
    {
      id: 'eatback',
      header: 'Eat-back',
      headerLabel: 'Eat back exercise calories',
      width: '84px',
      sortValue: (r) => r.eatBackExercise,
      cell: (r) => <Toggle checked={r.eatBackExercise} onChange={(on) => eatBack.mutate({ userId: r.userId, on })} label={`Eat back exercise calories for ${r.person.name}`} />,
    },
    {
      id: 'act',
      header: '',
      headerLabel: 'Actions',
      width: '60px',
      align: 'end',
      cell: (r) => (
        <RowAction label={`Edit goals for ${r.person.name}`} onClick={() => openMember(r.userId)}>
          Edit
        </RowAction>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Logic engine · Mifflin–St Jeor"
        title="Goals & targets"
        description={`Targets are calculated from each member’s profile and goal. Override only when needed; overrides never go below the safe floor (${fmtInt(CALORIE_FLOOR.female)} kcal for women, ${fmtInt(CALORIE_FLOOR.male)} kcal otherwise) without a Super Admin’s reason.`}
      />
      <Tabs
        label="Goals sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'members', label: 'Members', count: overriddenCount || null },
          { value: 'thresholds', label: 'Team thresholds' },
        ]}
      />
      <TabPanel k={tab}>
        {tab === 'members' ? (
          <DataTable
            label="Member goals and targets"
            columns={columns}
            rows={q.data}
            loading={q.isPending}
            error={q.error}
            onRetry={() => void q.refetch()}
            rowKey={(r) => r.userId}
            initialSort={{ id: 'member', dir: 'asc' }}
            minWidth={1000}
            onRowClick={(r) => openMember(r.userId)}
            rowClassName={(r) => r.userId === memberId && 'bg-accent-tint/30'}
            search={{ placeholder: 'Search members', text: (r) => `${r.person.name} ${goalText(r.goalType, r.paceKgWeek)}` }}
            filters={[
              {
                id: 'goal',
                label: 'Goal type',
                options: [{ value: '', label: 'All goals' }, ...(['lose', 'maintain', 'gain'] as const).map((g) => ({ value: g, label: GOAL_LABEL[g] })), { value: 'none', label: 'No goal set' }],
                predicate: (r, v) => (v === 'none' ? !asGoalType(r.goalType) : r.goalType === v),
              },
              {
                id: 'override',
                label: 'Override state',
                options: [
                  { value: '', label: 'Any targets' },
                  { value: 'override', label: 'Overridden' },
                  { value: 'calc', label: 'Calculated' },
                  { value: 'none', label: 'No targets yet' },
                ],
                predicate: (r, v) => (v === 'none' ? !r.targets : v === 'override' ? !!r.targets?.overridden.length : !!r.targets && !r.targets.overridden.length),
              },
            ]}
            empty={<EmptyState icon={<Target className="h-5 w-5" />} title="No members yet" body="Targets show up here once members finish their profile." />}
          />
        ) : (
          <TeamThresholdsTab />
        )}
      </TabPanel>
      <GoalDrawer row={row ?? (memberId ? null : lastRow)} open={!!memberId} onClose={closeDrawer} notFound={!!memberId && !!q.data && !row} />
    </>
  );
}
