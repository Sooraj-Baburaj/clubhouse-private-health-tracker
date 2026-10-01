import { useNavigate, useSearch } from '@tanstack/react-router';
import { ListChecks, Plus } from 'lucide-react';
import { HABIT_TEMPLATES, type AdminHabitDto } from '@clubhouse/contracts';
import { useAddTemplate, useHabits, useToggleHabit } from '@/features/habits';
import { cn } from '@/lib/cn';
import { fmtPct, plural } from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  KpiCard,
  KpiGrid,
  Mono,
  PageHeader,
  Pill,
  RowAction,
  Segmented,
  TabPanel,
  Toggle,
  type Column,
} from '@/ui';
import { AdherencePanel } from './AdherencePanel';
import { HabitEditorDrawer } from './HabitEditorDrawer';
import { HabitIcon, kindLabel, scheduleLabel } from './shared';

type Tab = 'catalogue' | 'adherence';

/** Habits: catalogue (KPIs, starter templates, table) and the member × habit adherence heatmap; editor in a drawer. */
export function HabitsPage() {
  const search = useSearch({ from: '/shell/habits' });
  const navigate = useNavigate({ from: '/habits' });
  const tab: Tab = search.tab === 'adherence' ? 'adherence' : 'catalogue';
  const q = useHabits();
  const toggle = useToggleHabit();
  const addTemplate = useAddTemplate();

  const setTab = (t: Tab) => void navigate({ search: (s) => ({ ...s, tab: t === 'catalogue' ? undefined : t }), replace: true });
  const open = (id: string) => void navigate({ search: (s) => ({ ...s, habit: id }) });
  const close = () => void navigate({ search: (s) => ({ ...s, habit: undefined }) });

  const habits = q.data?.habits;
  const k = q.data?.kpis;
  const editing = search.habit === 'new' ? null : (habits?.find((h) => h.id === search.habit) ?? null);
  const names = new Set(habits?.map((h) => h.name.toLowerCase()));

  const columns: Column<AdminHabitDto>[] = [
    {
      id: 'name',
      header: 'Habit',
      width: 'minmax(200px,1.5fr)',
      sortValue: (h) => h.name,
      cell: (h) => (
        <div className={cn('flex min-w-0 items-center gap-2.5', !h.enabled && 'opacity-45')}>
          <HabitIcon icon={h.icon} hue={h.hue} />
          <div className="flex min-w-0 flex-col leading-snug">
            <span className="truncate font-semibold">{h.name}</span>
            <span className="truncate text-[12px] text-muted">
              {h.group} · {h.reminderTime ? `Reminder ${h.reminderTime}` : 'No reminder'}
            </span>
          </div>
        </div>
      ),
    },
    { id: 'kind', header: 'Kind', width: '150px', sortValue: (h) => h.kind, cell: (h) => <span className={cn('text-[13px]', !h.enabled && 'opacity-45')}>{kindLabel(h)}</span> },
    { id: 'schedule', header: 'Schedule', width: 'minmax(120px,1fr)', sortValue: (h) => scheduleLabel(h), cell: (h) => <span className={cn('text-[13px]', !h.enabled && 'opacity-45')}>{scheduleLabel(h)}</span> },
    {
      id: 'assigned',
      header: 'Assigned',
      width: '110px',
      sortValue: (h) => (h.assign === 'all' ? 1e6 : h.memberIds.length),
      cell: (h) => <span className={cn('text-[13px]', !h.enabled && 'opacity-45')}>{h.assign === 'all' ? 'Everyone' : plural(h.memberIds.length, 'member')}</span>,
    },
    {
      id: 'adherence',
      header: 'Adherence 14d',
      width: '150px',
      sortValue: (h) => h.adherence14 ?? -1,
      cell: (h) => (
        <div className={cn('flex w-full items-center gap-2.5', !h.enabled && 'opacity-45')} title={h.adherence14 == null ? 'Nothing was due yet' : `${h.adherence14}% of scheduled days kept`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${h.adherence14 ?? 0}%` }} />
          </div>
          <Mono className="w-[34px] text-right">{h.adherence14 == null ? 'New' : fmtPct(h.adherence14)}</Mono>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      width: '90px',
      sortValue: (h) => h.required,
      cell: (h) => <Pill tone={h.required ? 'over' : 'neutral'}>{h.required ? 'Required' : 'Optional'}</Pill>,
    },
    {
      id: 'on',
      header: 'On',
      width: '50px',
      sortValue: (h) => h.enabled,
      cell: (h) => <Toggle checked={h.enabled} onChange={(enabled) => toggle.mutate({ id: h.id, enabled })} label={`${h.enabled ? 'Switch off' : 'Switch on'} ${h.name}`} />,
    },
    { id: 'edit', header: '', width: '50px', align: 'end', cell: (h) => <RowAction onClick={() => open(h.id)}>Edit</RowAction> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Daily checklist · member app"
        title="Habits"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Habits view"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'catalogue', label: 'Catalogue' },
                { value: 'adherence', label: 'Adherence' },
              ]}
            />
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => open('new')}>
              New habit
            </Button>
          </div>
        }
      />

      {tab === 'catalogue' && (
        <TabPanel k="catalogue">
          <KpiGrid>
            <KpiCard index={0} loading={q.isPending} label="Active habits" value={k?.active} sub={k ? `${k.required} required · ${k.off} off` : undefined} />
            <KpiCard index={1} loading={q.isPending} label="Team adherence" value={k ? (k.teamAdherence == null ? '—' : `${k.teamAdherence}%`) : undefined} sub="Last 14 days, active habits" />
            <KpiCard
              index={2}
              loading={q.isPending}
              label="All required kept today"
              value={k ? `${k.requiredToday.kept} / ${k.requiredToday.total}` : undefined}
              sub={k ? (k.requiredToday.pending.length ? `${k.requiredToday.pending.slice(0, 4).join(', ')}${k.requiredToday.pending.length > 4 ? ` and ${k.requiredToday.pending.length - 4} more` : ''} pending` : k.requiredToday.total ? 'Everyone is done' : 'Nothing required today') : undefined}
            />
          </KpiGrid>

          <Card>
            <CardHeader title="Starter templates" aside="Added for everyone. Edit after adding." />
            <div className="flex flex-wrap gap-2">
              {HABIT_TEMPLATES.map((t) => {
                const added = names.has(t.input.name.toLowerCase());
                const busy = addTemplate.isPending && addTemplate.variables === t.key;
                return (
                  <div key={t.key} className={cn('flex items-center gap-2.5 rounded-full border border-hairline bg-bg py-1.5 pl-2 pr-1.5', added && 'opacity-60')}>
                    <HabitIcon icon={t.input.icon} hue={t.input.hue} size={26} className="rounded-full" />
                    <span className="text-[13px] font-medium">{t.label}</span>
                    <button
                      type="button"
                      disabled={added || busy || !q.data}
                      onClick={() => addTemplate.mutate(t.key)}
                      className={cn('h-7 rounded-full border bg-white px-3 text-[12px] font-semibold transition-colors', added ? 'border-hairline text-muted' : 'border-accent-border text-accent hover:border-accent hover:text-accent-dark')}
                    >
                      {added ? 'Added' : busy ? 'Adding…' : '+ Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>

          <DataTable
            label="Habits"
            columns={columns}
            rows={habits}
            loading={q.isPending}
            error={q.error}
            onRetry={() => void q.refetch()}
            rowKey={(h) => h.id}
            onRowClick={(h) => open(h.id)}
            minWidth={960}
            hideCount
            search={{ placeholder: 'Search habits', text: (h) => `${h.name} ${h.group} ${h.kind}` }}
            filters={[
              {
                id: 'state',
                label: 'Habit state',
                options: [
                  { value: '', label: 'All habits' },
                  { value: 'on', label: 'On' },
                  { value: 'off', label: 'Off' },
                  { value: 'required', label: 'Required' },
                  { value: 'optional', label: 'Optional' },
                ],
                predicate: (h, v) => (v === 'on' ? h.enabled : v === 'off' ? !h.enabled : v === 'required' ? h.required : !h.required),
              },
            ]}
            empty={
              <EmptyState
                icon={<ListChecks className="h-5 w-5" />}
                title="No habits yet"
                body="Add a starter template above, or create one from scratch. Members see habits on a checklist in the app."
                action={
                  <Button size="sm" variant="secondary" onClick={() => open('new')}>
                    New habit
                  </Button>
                }
              />
            }
          />
          {habits && habits.length > 0 && (
            <p className="m-0 text-[12px] text-muted">
              {plural(habits.length, 'habit')} · Switching a habit off hides it from members and keeps its history. Archive it from the editor to remove it from this list.
            </p>
          )}
        </TabPanel>
      )}

      {tab === 'adherence' && (
        <TabPanel k="adherence">
          <AdherencePanel onOpen={open} />
        </TabPanel>
      )}

      <HabitEditorDrawer open={!!search.habit && (search.habit === 'new' || !!editing)} habit={editing} onClose={close} />
    </>
  );
}
