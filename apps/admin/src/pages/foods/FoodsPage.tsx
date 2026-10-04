import { useNavigate, useSearch } from '@tanstack/react-router';
import { BadgeCheck, Database, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FOOD_SOURCES, type AdminFoodRow } from '@clubhouse/contracts';
import { energyMismatch, isWeightUnit, weightUnitFor } from '@clubhouse/domain';
import { useDebounced } from '@clubhouse/ui';
import { useFoodList, useVerifyFood, type FoodListQuery } from '@/features/foods';
import { fmtDateTime, fmtInt, fmtNum, fmtRelative, humanize } from '@/lib/format';
import {
  Button,
  DataTable,
  EmptyState,
  FilterSelect,
  Mono,
  PageHeader,
  PersonCell,
  Pill,
  RowAction,
  type Column,
} from '@/ui';
import { FoodDrawer, SourcePill } from './FoodDrawer';
import { ImportFoodsModal } from './ImportFoodsModal';
import { MergeFoodModal } from './MergeFoodModal';

const LIMIT = 200;

/** The portion members see first, with its weight (≈ when estimated) and calories. */
function defaultPortion(r: AdminFoodRow) {
  const o = r.servingOptions.find((x) => x.label === r.defaultServing) ?? r.servingOptions[0];
  if (!o) return null;
  const weight = o.unit && isWeightUnit(o.unit) ? '' : ` · ${o.estimated ? '≈' : ''}${Math.round(o.grams)} ${weightUnitFor(o.unit)}`;
  return { text: `${o.label}${weight}`, kcal: (r.per100g.kcal * o.grams) / 100 };
}

/** Food database curation: server-side search/filters, edit drawer, verify, promote, merge, delete, CSV import. */
export function FoodsPage() {
  const search = useSearch({ from: '/shell/foods' });
  const navigate = useNavigate({ from: '/foods' });
  const [text, setText] = useState(search.q ?? '');
  const debounced = useDebounced(text.trim(), 300);

  // Debounced search → URL (the URL drives the server query).
  useEffect(() => {
    if (debounced !== (search.q ?? ''))
      void navigate({ search: (s) => ({ ...s, q: debounced || undefined }), replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const source =
    search.source && (FOOD_SOURCES as readonly string[]).includes(search.source)
      ? search.source
      : '';
  const verifiedParam =
    search.verified === 'yes' || search.verified === 'no' ? search.verified : '';
  const listKey: FoodListQuery = useMemo(
    () => ({
      q: search.q || undefined,
      source: source || undefined,
      verified: verifiedParam === 'yes' ? '1' : verifiedParam === 'no' ? '0' : undefined,
      limit: LIMIT,
    }),
    [search.q, source, verifiedParam],
  );
  const q = useFoodList(listKey);
  const verify = useVerifyFood(listKey);

  const [opened, setOpened] = useState<AdminFoodRow | null>(null);
  const openId = opened?.id ?? null;
  const [mergeSource, setMergeSource] = useState<AdminFoodRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Latest copy from the list when it's there; otherwise the snapshot (e.g. it dropped out of the current filter after a save).
  const openFood = opened ? (q.data?.find((f) => f.id === opened.id) ?? opened) : null;

  const setParam = (k: 'source' | 'verified', v: string) =>
    void navigate({ search: (s) => ({ ...s, [k]: v || undefined }), replace: true });

  const rows = q.data;
  const unverified = rows?.filter((r) => !r.verified).length ?? 0;
  const aiCount = rows?.filter((r) => r.source === 'ai').length ?? 0;

  const num = (
    id: keyof AdminFoodRow['per100g'],
    header: string,
    digits = 1,
  ): Column<AdminFoodRow> => ({
    id,
    header,
    width: id === 'kcal' ? '84px' : '56px',
    align: 'end',
    sortValue: (r) => r.per100g[id],
    cell: (r) => (
      <Mono className={id === 'kcal' ? 'font-semibold' : 'text-muted'}>
        {id === 'kcal' ? fmtInt(r.per100g.kcal) : fmtNum(r.per100g[id], digits)}
      </Mono>
    ),
  });

  const columns: Column<AdminFoodRow>[] = [
    {
      id: 'name',
      header: 'Food',
      width: 'minmax(220px,1.6fr)',
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 flex-col leading-[1.35]">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold">{r.name}</span>
            {r.verified && (
              <BadgeCheck aria-label="Verified" className="h-3.5 w-3.5 shrink-0 text-accent" />
            )}
          </span>
          <span className="truncate text-[12px] text-muted">
            {[r.brand, r.category && humanize(r.category)].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      id: 'source',
      header: 'Source',
      width: '110px',
      sortValue: (r) => r.source,
      cell: (r) => <SourcePill food={r} />,
    },
    {
      id: 'verified',
      header: 'Status',
      width: '104px',
      sortValue: (r) => r.verified,
      cell: (r) =>
        r.verified ? <Pill tone="in">Verified</Pill> : <Pill tone="under">Unverified</Pill>,
    },
    {
      id: 'owner',
      header: 'Owner',
      width: 'minmax(130px,0.9fr)',
      sortValue: (r) => r.owner?.name ?? null,
      cell: (r) =>
        r.owner ? (
          <PersonCell person={r.owner} size={24} />
        ) : (
          <span className="text-[13px] text-muted">Database</span>
        ),
    },
    {
      id: 'team',
      header: 'Scope',
      width: '84px',
      sortValue: (r) => (r.team ? 2 : r.owner ? 1 : 0),
      cell: (r) =>
        r.team ? (
          <Pill tone="accent">Team</Pill>
        ) : r.owner ? (
          <Pill tone="outline">Private</Pill>
        ) : (
          <Pill tone="muted">Global</Pill>
        ),
    },
    {
      id: 'portion',
      header: 'Default portion',
      width: 'minmax(150px,1fr)',
      sortValue: (r) => defaultPortion(r)?.kcal ?? null,
      cell: (r) => {
        const d = defaultPortion(r);
        return d ? (
          <div className="flex min-w-0 flex-col leading-[1.35]">
            <span className="truncate text-[13px]">{d.text}</span>
            <Mono className="text-[12px] text-muted">{fmtInt(d.kcal)} kcal</Mono>
          </div>
        ) : (
          <span className="text-[13px] text-muted">—</span>
        );
      },
    },
    {
      id: 'portions',
      header: 'Portions',
      width: '72px',
      align: 'end',
      sortValue: (r) => r.servingOptions.length,
      cell: (r) => <Mono className="text-muted">{r.servingOptions.length}</Mono>,
    },
    num('kcal', 'kcal/100g'),
    num('protein', 'P'),
    num('carbs', 'C'),
    num('fat', 'F'),
    num('fibre', 'Fb'),
    {
      id: 'uses',
      header: 'Uses',
      width: '64px',
      align: 'end',
      sortValue: (r) => r.uses,
      cell: (r) => <Mono>{fmtInt(r.uses)}</Mono>,
    },
    {
      id: 'created',
      header: 'Added',
      width: '96px',
      sortValue: (r) => r.createdAt,
      cell: (r) => (
        <span className="text-[13px] text-muted" title={fmtDateTime(r.createdAt)}>
          {fmtRelative(r.createdAt)}
        </span>
      ),
    },
    {
      id: 'act',
      header: '',
      headerLabel: 'Actions',
      width: '72px',
      align: 'end',
      cell: (r) =>
        r.verified ? null : (
          <RowAction
            onClick={() => verify.mutate({ id: r.id, verified: true })}
            disabled={verify.isPending && verify.variables?.id === r.id}
            label={`Verify ${r.name}`}
          >
            Verify
          </RowAction>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={
          rows
            ? `${fmtInt(rows.length)}${rows.length >= LIMIT ? '+' : ''} foods · ${fmtInt(unverified)} unverified · ${fmtInt(aiCount)} AI estimates`
            : 'Curation'
        }
        title="Food database"
        description="Tidy up member-created and AI-estimated foods: check the numbers and portions, verify, merge duplicates, and promote good ones to the whole team. Macros are per 100 g; recipes are read-only."
        actions={
          <Button icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
        }
      />
      <DataTable
        label="Foods"
        columns={columns}
        rows={rows}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(r) => r.id}
        minWidth={1480}
        pageSize={100}
        initialSort={{ id: 'created', dir: 'desc' }}
        // Search runs on the server (names, brands and aliases); the table's own text filter is a pass-through.
        search={{
          placeholder: 'Search foods, brands, aliases',
          text: () => text,
          value: text,
          onChange: setText,
        }}
        filters={[
          {
            id: 'scope',
            label: 'Scope',
            options: [
              { value: '', label: 'Any scope' },
              { value: 'team', label: 'Team foods' },
              { value: 'private', label: 'Private (member)' },
              { value: 'global', label: 'Global database' },
            ],
            predicate: (r, v) =>
              v === 'team' ? r.team : v === 'private' ? !r.team && !!r.owner : !r.team && !r.owner,
          },
          {
            id: 'usage',
            label: 'Usage',
            options: [
              { value: '', label: 'Any usage' },
              { value: 'unused', label: 'Never used' },
              { value: 'used', label: 'Used in logs' },
            ],
            predicate: (r, v) => (v === 'unused' ? r.uses === 0 : r.uses > 0),
          },
          {
            id: 'energy',
            label: 'Energy check',
            options: [
              { value: '', label: 'Any numbers' },
              { value: 'off', label: 'Energy doesn’t add up' },
            ],
            predicate: (r) => energyMismatch(r.per100g) > 0.15,
          },
        ]}
        toolbar={
          <>
            <FilterSelect
              label="Source"
              value={source}
              onChange={(v) => setParam('source', v)}
              options={[
                { value: '', label: 'All sources' },
                ...FOOD_SOURCES.map((s) => ({
                  value: s,
                  label: s === 'usda' ? 'USDA' : s === 'ai' ? 'AI estimate' : humanize(s),
                })),
              ]}
            />
            <FilterSelect
              label="Verified"
              value={verifiedParam}
              onChange={(v) => setParam('verified', v)}
              options={[
                { value: '', label: 'Verified or not' },
                { value: 'yes', label: 'Verified' },
                { value: 'no', label: 'Unverified' },
              ]}
            />
          </>
        }
        onRowClick={(r) => setOpened(r)}
        rowClassName={(r) => r.id === openId && 'bg-accent-tint/30'}
        footer={
          <>
            {q.isFetching && !q.isPending && <span>Updating…</span>}
            {rows && rows.length >= LIMIT && (
              <span>Showing the first {LIMIT} matches. Search or filter to narrow down.</span>
            )}
          </>
        }
        empty={
          <EmptyState
            icon={<Database className="h-5 w-5" />}
            title={search.q || source || verifiedParam ? 'No foods match' : 'No foods yet'}
            body={
              search.q || source || verifiedParam
                ? 'Try another search, or clear the source and verified filters.'
                : 'Import the seed CSVs or a file of your own to get started.'
            }
            action={
              search.q || source || verifiedParam ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setText('');
                    void navigate({ search: {}, replace: true });
                  }}
                >
                  Clear search and filters
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Upload className="h-3.5 w-3.5" />}
                  onClick={() => setImportOpen(true)}
                >
                  Import CSV
                </Button>
              )
            }
          />
        }
      />
      <FoodDrawer
        food={openFood}
        onClose={() => setOpened(null)}
        onMerge={(f) => setMergeSource(f)}
      />
      <MergeFoodModal
        source={mergeSource}
        open={!!mergeSource}
        onClose={() => setMergeSource(null)}
        onMerged={() => setOpened(null)}
      />
      <ImportFoodsModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
