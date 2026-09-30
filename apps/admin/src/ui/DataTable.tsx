import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { Button } from './Button';
import { FilterSelect, SearchInput } from './Field';
import { EmptyState, ErrorState, SkeletonRows } from './States';

export interface Column<T> {
  id: string;
  header: ReactNode;
  /** CSS grid track, e.g. `minmax(200px,1.6fr)` or `120px`. */
  width: string;
  cell: (row: T, index: number) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number | boolean | null | undefined;
  align?: 'start' | 'end' | 'center';
  className?: string;
  /** Accessible name when `header` is not plain text. */
  headerLabel?: string;
}

export interface FilterDef<T> {
  id: string;
  label: string;
  /** Include an `{ value: '', label: 'All …' }` option; '' means "no filter". */
  options: { value: string; label: string }[];
  predicate: (row: T, value: string) => boolean;
  initial?: string;
}

export interface DataTableProps<T> {
  label: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Client-side search. Pass `value`/`onChange` to control it (e.g. sync with the URL). */
  search?: { placeholder?: string; text: (row: T) => string; value?: string; onChange?: (v: string) => void };
  filters?: FilterDef<T>[];
  /** Extra toolbar content on the right (buttons, server-side filters). */
  toolbar?: ReactNode;
  initialSort?: { id: string; dir: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | false | undefined;
  selection?: { selected: Set<string>; onChange: (s: Set<string>) => void };
  empty?: ReactNode;
  noMatches?: ReactNode;
  minWidth?: number;
  /** Client-side paging: render this many rows, then "Show more". */
  pageSize?: number;
  footer?: ReactNode;
  className?: string;
  /** Hide the "Showing N of M" line. */
  hideCount?: boolean;
}

const INTERACTIVE = 'button,a,input,select,textarea,label,[role="switch"],[role="checkbox"]';

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Design data table: CSS-grid rows, mono uppercase header, #EEECE7 dividers, horizontal scroll with min-width.
 * Built-in search, filters, sortable headers (aria-sort), optional selection, keyboard row navigation
 * (↑/↓ move, Enter opens) and a staggered row entrance.
 */
export function DataTable<T>(p: DataTableProps<T>) {
  const reduce = useReducedMotion();
  const [innerQuery, setInnerQuery] = useState('');
  const query = p.search?.value ?? innerQuery;
  const setQuery = p.search?.onChange ?? setInnerQuery;
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => Object.fromEntries((p.filters ?? []).map((f) => [f.id, f.initial ?? ''])));
  const [sort, setSort] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(p.initialSort ?? null);
  const [limit, setLimit] = useState(p.pageSize ?? Infinity);

  const all = p.rows ?? [];
  const visible = useMemo(() => {
    let out = all;
    const q = query.trim().toLowerCase();
    if (q && p.search) out = out.filter((r) => p.search!.text(r).toLowerCase().includes(q));
    for (const f of p.filters ?? []) {
      const v = filterValues[f.id] ?? '';
      if (v) out = out.filter((r) => f.predicate(r, v));
    }
    if (sort) {
      const col = p.columns.find((c) => c.id === sort.id);
      if (col?.sortValue) {
        const sv = col.sortValue;
        out = [...out].sort((a, b) => compare(sv(a), sv(b)) * (sort.dir === 'asc' ? 1 : -1));
      }
    }
    return out;
  }, [all, query, filterValues, sort, p.columns, p.filters, p.search]);

  const shown = Number.isFinite(limit) ? visible.slice(0, limit) : visible;
  const sel = p.selection;
  const tracks = [sel ? '28px' : null, ...p.columns.map((c) => c.width)].filter(Boolean).join(' ');
  const minWidth = p.minWidth ?? 780;
  const hasToolbar = !!(p.search || p.filters?.length || p.toolbar);
  const allSelected = sel && visible.length > 0 && visible.every((r) => sel.selected.has(p.rowKey(r)));

  const toggleSort = (c: Column<T>) => {
    if (!c.sortValue) return;
    setSort((s) => (s?.id === c.id ? (s.dir === 'asc' ? { id: c.id, dir: 'desc' } : null) : { id: c.id, dir: 'asc' }));
  };

  const onRowKey = (e: React.KeyboardEvent<HTMLDivElement>, row: T) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
    } else if ((e.key === 'Enter' || e.key === ' ') && p.onRowClick) {
      e.preventDefault();
      p.onRowClick(row);
    }
  };

  let body: ReactNode;
  if (p.loading || (p.rows === undefined && !p.error)) body = <SkeletonRows rows={6} />;
  else if (p.error) body = <ErrorState error={p.error} onRetry={p.onRetry} />;
  else if (all.length === 0) body = p.empty ?? <EmptyState title="Nothing here yet" />;
  else if (visible.length === 0)
    body = p.noMatches ?? (
      <EmptyState
        title="No matches"
        body="Try a different search or clear the filters."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setQuery('');
              setFilterValues(Object.fromEntries((p.filters ?? []).map((f) => [f.id, ''])));
            }}
          >
            Clear filters
          </Button>
        }
      />
    );
  else
    body = (
      <div role="rowgroup">
        {shown.map((row, i) => {
          const key = p.rowKey(row);
          const clickable = !!p.onRowClick;
          return (
            <motion.div
              key={key}
              role="row"
              tabIndex={clickable ? 0 : -1}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: reduce ? 0 : Math.min(i, 14) * 0.022, ease: [0.2, 0.8, 0.2, 1] }}
              onKeyDown={(e) => onRowKey(e, row)}
              onClick={
                clickable
                  ? (e) => {
                      const hit = (e.target as HTMLElement).closest(INTERACTIVE);
                      if (hit && hit !== e.currentTarget) return;
                      p.onRowClick!(row);
                    }
                  : undefined
              }
              className={cn(
                'grid items-center gap-3 border-b border-hairline px-5 py-3 text-[14px] outline-none transition-colors last:border-b-0 focus-visible:bg-accent-tint/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                clickable && 'cursor-pointer hover:bg-bg/70',
                sel?.selected.has(key) && 'bg-accent-tint/30',
                p.rowClassName?.(row),
              )}
              style={{ gridTemplateColumns: tracks }}
            >
              {sel && (
                <span role="cell">
                  <input
                    type="checkbox"
                    aria-label="Select row"
                    className="h-4 w-4 accent-[#B6316C]"
                    checked={sel.selected.has(key)}
                    onChange={(e) => {
                      const next = new Set(sel.selected);
                      if (e.target.checked) next.add(key);
                      else next.delete(key);
                      sel.onChange(next);
                    }}
                  />
                </span>
              )}
              {p.columns.map((c) => (
                <div role="cell" key={c.id} className={cn('min-w-0', c.align === 'end' && 'justify-self-end text-right', c.align === 'center' && 'justify-self-center text-center', c.className)}>
                  {c.cell(row, i)}
                </div>
              ))}
            </motion.div>
          );
        })}
      </div>
    );

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', p.className)}>
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {p.search && <SearchInput value={query} onChange={setQuery} placeholder={p.search.placeholder ?? 'Search'} />}
          {p.filters?.map((f) => (
            <FilterSelect key={f.id} label={f.label} value={filterValues[f.id] ?? ''} onChange={(v) => setFilterValues((s) => ({ ...s, [f.id]: v }))} options={f.options} />
          ))}
          {p.toolbar && <div className="ml-auto flex flex-wrap items-center gap-2">{p.toolbar}</div>}
        </div>
      )}
      <div className="overflow-x-auto rounded-[16px] border border-border bg-card">
        <div role="table" aria-label={p.label} aria-rowcount={visible.length} style={{ minWidth }}>
          <div role="rowgroup">
            <div role="row" className="grid items-center gap-3 border-b border-border px-5 py-3" style={{ gridTemplateColumns: tracks }}>
              {sel && (
                <span role="columnheader">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="h-4 w-4 accent-[#B6316C]"
                    checked={!!allSelected}
                    onChange={(e) => sel.onChange(e.target.checked ? new Set(visible.map(p.rowKey)) : new Set())}
                  />
                </span>
              )}
              {p.columns.map((c) => {
                const active = sort?.id === c.id;
                const ariaSort = active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined;
                return (
                  <div role="columnheader" aria-sort={ariaSort} key={c.id} className={cn('th min-w-0', c.align === 'end' && 'justify-self-end text-right', c.align === 'center' && 'justify-self-center')}>
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggleSort(c)} aria-label={`Sort by ${c.headerLabel ?? (typeof c.header === 'string' ? c.header : c.id)}`} className={cn('th inline-flex items-center gap-1 rounded hover:text-ink', active && 'text-ink')}>
                        {c.header}
                        {active ? sort!.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {body}
        </div>
      </div>
      {(p.footer || (!p.hideCount && p.rows && all.length > 0)) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
          {!p.hideCount && p.rows && all.length > 0 ? (
            <span>
              Showing {fmtInt(shown.length)} of {fmtInt(visible.length)}
              {visible.length !== all.length && ` (filtered from ${fmtInt(all.length)})`}
              {sel && sel.selected.size > 0 && ` · ${fmtInt(sel.selected.size)} selected`}
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {shown.length < visible.length && (
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + (p.pageSize ?? 100))}>
                Show more
              </Button>
            )}
            {p.footer}
          </div>
        </div>
      )}
    </div>
  );
}

/** Mono cell text (numbers, times). */
export function Mono({ children, muted, className }: { children: ReactNode; muted?: boolean; className?: string }) {
  return <span className={cn('font-mono text-[12px]', muted && 'text-muted', className)}>{children}</span>;
}

/** Text-button action in a table row (design: "Edit" in accent). */
export function RowAction({ children, onClick, tone = 'accent', disabled, label }: { children: ReactNode; onClick: () => void; tone?: 'accent' | 'ink' | 'danger'; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('rounded-md border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold transition-colors disabled:opacity-40', tone === 'accent' && 'text-accent hover:text-accent-dark', tone === 'ink' && 'text-ink hover:text-accent', tone === 'danger' && 'text-accent-dark hover:underline')}
    >
      {children}
    </button>
  );
}
