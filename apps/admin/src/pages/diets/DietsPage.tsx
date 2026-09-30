import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { LayoutTemplate, Plus, Salad, Sparkles, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AdminDietListRow, AdminDietPlan } from '@clubhouse/contracts';
import { useDietList, useDietTemplates } from '@/features/diets';
import { fmtDate, fmtDateTime, fmtInt, fmtRelative, plural } from '@/lib/format';
import {
  AiChip,
  Button,
  DataTable,
  EmptyState,
  Mono,
  PageHeader,
  PersonCell,
  Pill,
  RowAction,
  TabPanel,
  Tabs,
  type Column,
} from '@/ui';
import { BulkAssignModal, DraftWithAiModal, StartDraftModal } from './DietModals';
import { MEAL_SLOTS, useAiDraftAvailable } from './shared';

type Tab = 'members' | 'templates';

function templateKcal(t: AdminDietPlan): number | null {
  const any = t.dayTotals.find((d) => d.dayType === 'any') ?? t.dayTotals[0];
  return any ? any.totals.kcal : null;
}

/** Diet plans: member list with published/draft status, templates, start/AI draft, bulk assign. */
export function DietsPage() {
  const search = useSearch({ from: '/shell/diets' });
  const navigate = useNavigate({ from: '/diets' });
  const tab: Tab = search.tab === 'templates' ? 'templates' : 'members';
  const list = useDietList();
  const templates = useDietTemplates();
  const ai = useAiDraftAvailable();

  const [start, setStart] = useState<{ userId?: string; asTemplate?: boolean } | null>(null);
  const [aiOpen, setAiOpen] = useState<{ userId?: string } | null>(null);
  const [bulk, setBulk] = useState<{ templateId?: string } | null>(null);

  const rows = list.data;
  const tpls = templates.data ?? [];
  const focusMember = search.member;

  // ?member=… preselects that member: highlight the row, and open "Start draft" when they have nothing yet.
  const [autoFor, setAutoFor] = useState<string | null>(null);
  if (focusMember && rows && autoFor !== focusMember) {
    setAutoFor(focusMember);
    const r = rows.find((x) => x.userId === focusMember);
    if (r && !r.published && !r.draft) setStart({ userId: focusMember });
  }

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      total: all.length,
      published: all.filter((r) => r.published).length,
      drafts: all.filter((r) => r.draft).length,
      none: all.filter((r) => !r.published && !r.draft).length,
    };
  }, [rows]);

  const open = (planId: string) => void navigate({ to: '/diets/$planId', params: { planId } });

  const columns: Column<AdminDietListRow>[] = [
    {
      id: 'member',
      header: 'Member',
      width: 'minmax(200px,1.3fr)',
      sortValue: (r) => r.person.name,
      cell: (r) => <PersonCell person={r.person} sub={r.dietPrefs || 'No diet preferences'} />,
    },
    {
      id: 'target',
      header: 'Target',
      width: '104px',
      align: 'end',
      sortValue: (r) => r.targetKcal,
      cell: (r) => (
        <Mono muted={r.targetKcal == null}>
          {r.targetKcal != null ? `${fmtInt(r.targetKcal)} kcal` : 'not set'}
        </Mono>
      ),
    },
    {
      id: 'published',
      header: 'Published plan',
      width: 'minmax(220px,1.5fr)',
      sortValue: (r) => r.published?.publishedAt ?? null,
      cell: (r) =>
        r.published ? (
          <div className="flex min-w-0 flex-col leading-[1.35]">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-semibold">{r.published.name}</span>
              {r.published.aiGenerated && <AiChip feature="diet.draft" />}
            </span>
            <Mono muted className="truncate">
              v{r.published.version} · {fmtInt(r.published.kcal)} kcal ·{' '}
              <span title={fmtDateTime(r.published.publishedAt)}>
                {fmtDate(r.published.publishedAt)}
              </span>
            </Mono>
          </div>
        ) : (
          <span className="text-[13px] text-muted">No plan yet</span>
        ),
    },
    {
      id: 'draft',
      header: 'Draft',
      width: 'minmax(170px,1fr)',
      sortValue: (r) => r.draft?.updatedAt ?? null,
      cell: (r) =>
        r.draft ? (
          <div className="flex min-w-0 flex-col leading-[1.35]">
            <span className="flex min-w-0 items-center gap-1.5">
              <Pill tone="under">Draft</Pill>
              <span className="truncate text-[13px] font-medium">{r.draft.name}</span>
            </span>
            <span className="text-[12px] text-muted" title={fmtDateTime(r.draft.updatedAt)}>
              Updated {fmtRelative(r.draft.updatedAt)}
            </span>
          </div>
        ) : (
          <span className="text-[13px] text-muted">—</span>
        ),
    },
    {
      id: 'act',
      header: '',
      headerLabel: 'Actions',
      width: '210px',
      align: 'end',
      cell: (r) => (
        <div className="flex flex-wrap justify-end gap-x-2">
          {r.published && (
            <RowAction
              tone="ink"
              onClick={() => open(r.published!.id)}
              label={`Open published plan for ${r.person.name}`}
            >
              Open published
            </RowAction>
          )}
          {r.draft ? (
            <RowAction onClick={() => open(r.draft!.id)} label={`Open draft for ${r.person.name}`}>
              Open draft
            </RowAction>
          ) : (
            <RowAction
              onClick={() => setStart({ userId: r.userId })}
              label={`Start draft for ${r.person.name}`}
            >
              Start draft
            </RowAction>
          )}
        </div>
      ),
    },
  ];

  const tplColumns: Column<AdminDietPlan>[] = [
    {
      id: 'name',
      header: 'Template',
      width: 'minmax(220px,1.6fr)',
      sortValue: (t) => t.name,
      cell: (t) => (
        <div className="flex min-w-0 flex-col leading-[1.35]">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold">{t.name}</span>
            {t.aiGenerated && <AiChip feature="diet.draft" />}
          </span>
          {t.note && <span className="truncate text-[12px] text-muted">{t.note}</span>}
        </div>
      ),
    },
    {
      id: 'options',
      header: 'Options',
      width: '150px',
      sortValue: (t) => t.options.length,
      cell: (t) => {
        const covered = MEAL_SLOTS.filter((s) => t.options.some((o) => o.mealSlot === s)).length;
        return (
          <div className="flex flex-col leading-[1.35]">
            <Mono>{plural(t.options.length, 'option')}</Mono>
            <span className="text-[12px] text-muted">
              {covered}/{MEAL_SLOTS.length} slots
            </span>
          </div>
        );
      },
    },
    {
      id: 'kcal',
      header: 'Day kcal',
      width: '110px',
      align: 'end',
      sortValue: (t) => templateKcal(t),
      cell: (t) => <Mono>{templateKcal(t) != null ? `~${fmtInt(templateKcal(t))}` : '—'}</Mono>,
    },
    {
      id: 'ai',
      header: 'Source',
      width: '110px',
      sortValue: (t) => t.aiGenerated,
      cell: (t) =>
        t.aiGenerated ? (
          <Pill tone="ai" title="AI feature: diet.draft">
            AI draft
          </Pill>
        ) : (
          <Pill tone="muted">Hand-built</Pill>
        ),
    },
    {
      id: 'act',
      header: '',
      headerLabel: 'Actions',
      width: '170px',
      align: 'end',
      cell: (t) => (
        <div className="flex justify-end gap-x-2">
          <RowAction tone="ink" onClick={() => open(t.id)} label={`Open ${t.name}`}>
            Open
          </RowAction>
          <RowAction onClick={() => setBulk({ templateId: t.id })} label={`Bulk assign ${t.name}`}>
            Bulk assign
          </RowAction>
        </div>
      ),
    },
  ];

  const aiButton = (
    <span className="inline-flex" title={ai.reason ?? undefined}>
      <Button
        variant="outline"
        disabled={!ai.available}
        onClick={() => setAiOpen({ userId: focusMember })}
        aria-describedby={ai.reason ? 'ai-draft-off' : undefined}
        icon={<Sparkles className="h-4 w-4" />}
      >
        Draft with AI <AiChip feature="diet.draft" />
      </Button>
    </span>
  );

  return (
    <>
      <PageHeader
        eyebrow="Several options per meal slot"
        title="Diet plans"
        description={
          rows
            ? `${plural(counts.total, 'member')} · ${fmtInt(counts.published)} with a published plan · ${plural(counts.drafts, 'draft')} in progress · ${fmtInt(counts.none)} without a plan`
            : 'Build plans with 2–5 options per meal slot, publish with a note, and see what members actually pick.'
        }
        actions={
          <>
            {aiButton}
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() =>
                setStart(tab === 'templates' ? { asTemplate: true } : { userId: focusMember })
              }
            >
              {tab === 'templates' ? 'New template' : 'Start draft'}
            </Button>
          </>
        }
      />
      {ai.reason && (
        <p id="ai-draft-off" className="-mt-2 text-right text-[12px] text-muted sm:self-end">
          {ai.reason}{' '}
          <Link to="/ai" className="font-semibold text-accent hover:text-accent-dark">
            AI settings
          </Link>
        </p>
      )}
      <Tabs<Tab>
        label="Diet plan views"
        value={tab}
        onChange={(v) =>
          void navigate({
            search: (s) => ({ ...s, tab: v === 'members' ? undefined : v }),
            replace: true,
          })
        }
        tabs={[
          { value: 'members', label: 'Members', count: rows?.length },
          { value: 'templates', label: 'Templates', count: templates.data?.length },
        ]}
        className="self-start"
      />
      {tab === 'members' ? (
        <TabPanel k="members">
          <DataTable
            label="Members and their diet plans"
            columns={columns}
            rows={rows}
            loading={list.isPending}
            error={list.error}
            onRetry={() => void list.refetch()}
            rowKey={(r) => r.userId}
            initialSort={{ id: 'member', dir: 'asc' }}
            search={{
              placeholder: 'Search members or plans',
              text: (r) =>
                `${r.person.name} ${r.dietPrefs} ${r.published?.name ?? ''} ${r.draft?.name ?? ''}`,
              value: search.q ?? '',
              onChange: (v) =>
                void navigate({ search: (s) => ({ ...s, q: v || undefined }), replace: true }),
            }}
            filters={[
              {
                id: 'status',
                label: 'Plan status',
                options: [
                  { value: '', label: 'All members' },
                  { value: 'published', label: 'Has a plan' },
                  { value: 'draft', label: 'Has a draft' },
                  { value: 'none', label: 'No plan' },
                ],
                predicate: (r, v) =>
                  v === 'published'
                    ? !!r.published
                    : v === 'draft'
                      ? !!r.draft
                      : !r.published && !r.draft,
              },
              {
                id: 'ai',
                label: 'AI drafted',
                options: [
                  { value: '', label: 'Any source' },
                  { value: 'ai', label: 'AI-drafted plan' },
                  { value: 'hand', label: 'Hand-built plan' },
                ],
                predicate: (r, v) =>
                  !!r.published &&
                  (v === 'ai' ? r.published.aiGenerated : !r.published.aiGenerated),
              },
            ]}
            onRowClick={(r) =>
              r.draft
                ? open(r.draft.id)
                : r.published
                  ? open(r.published.id)
                  : setStart({ userId: r.userId })
            }
            rowClassName={(r) =>
              r.userId === focusMember && 'bg-accent-tint/40 shadow-[inset_3px_0_0_#B6316C]'
            }
            empty={
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No members yet"
                body="Add members first, then build their diet plans here."
              />
            }
          />
        </TabPanel>
      ) : (
        <TabPanel k="templates">
          <DataTable
            label="Diet plan templates"
            columns={tplColumns}
            rows={templates.data}
            loading={templates.isPending}
            error={templates.error}
            onRetry={() => void templates.refetch()}
            rowKey={(t) => t.id}
            initialSort={{ id: 'name', dir: 'asc' }}
            minWidth={720}
            search={{
              placeholder: 'Search templates',
              text: (t) => `${t.name} ${t.note ?? ''} ${t.options.map((o) => o.name).join(' ')}`,
            }}
            filters={[
              {
                id: 'src',
                label: 'Source',
                options: [
                  { value: '', label: 'Any source' },
                  { value: 'ai', label: 'AI drafts' },
                  { value: 'hand', label: 'Hand-built' },
                ],
                predicate: (t, v) => (v === 'ai' ? t.aiGenerated : !t.aiGenerated),
              },
            ]}
            toolbar={
              <Button
                variant="outline"
                size="md"
                icon={<LayoutTemplate className="h-4 w-4" />}
                disabled={!tpls.length}
                onClick={() => setBulk({})}
              >
                Bulk assign
              </Button>
            }
            onRowClick={(t) => open(t.id)}
            empty={
              <EmptyState
                icon={<Salad className="h-5 w-5" />}
                title="No templates yet"
                body="Save any plan as a template from the builder, or start one from scratch. Templates can be assigned to many members at once."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setStart({ asTemplate: true })}
                  >
                    New template
                  </Button>
                }
              />
            }
          />
        </TabPanel>
      )}

      <StartDraftModal
        open={!!start}
        onClose={() => setStart(null)}
        rows={rows ?? []}
        templates={tpls}
        initialUserId={start?.userId}
        asTemplate={start?.asTemplate}
      />
      <DraftWithAiModal
        open={!!aiOpen}
        onClose={() => setAiOpen(null)}
        rows={rows ?? []}
        initialUserId={aiOpen?.userId}
      />
      <BulkAssignModal
        open={!!bulk}
        onClose={() => setBulk(null)}
        templates={tpls}
        rows={rows ?? []}
        initialTemplateId={bulk?.templateId}
      />
    </>
  );
}
