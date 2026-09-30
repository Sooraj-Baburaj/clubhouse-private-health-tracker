import { BadgeCheck, GitMerge, Search } from 'lucide-react';
import { useState } from 'react';
import type { AdminFoodRow } from '@clubhouse/contracts';
import { useDebounced } from '@clubhouse/ui';
import { useFoodList, useMergeFoods } from '@/features/foods';
import { cn } from '@/lib/cn';
import { fmtInt, humanize, plural } from '@/lib/format';
import { AiChip, Button, confirmAction, Modal, Pill } from '@/ui';

/** Pick a target food and merge the source into it (logs move, source is removed). */
export function MergeFoodModal({
  source,
  open,
  onClose,
  onMerged,
}: {
  source: AdminFoodRow | null;
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}) {
  return (
    <Modal
      open={open && !!source}
      onClose={onClose}
      eyebrow="Merge duplicates"
      title={source ? `Merge “${source.name}”` : 'Merge'}
      width={560}
    >
      {source && <MergeBody source={source} onClose={onClose} onMerged={onMerged} />}
    </Modal>
  );
}

function MergeBody({
  source,
  onClose,
  onMerged,
}: {
  source: AdminFoodRow;
  onClose: () => void;
  onMerged: () => void;
}) {
  const merge = useMergeFoods();
  const [q, setQ] = useState(() => source.name.split(/[,(]/)[0]?.trim() ?? '');
  const [target, setTarget] = useState<AdminFoodRow | null>(null);
  const debounced = useDebounced(q.trim(), 250);
  const list = useFoodList({ q: debounced, limit: 25 }, debounced.length >= 2);
  const candidates = (list.data ?? []).filter((f) => f.id !== source.id);

  const go = async () => {
    if (!target) return;
    const ok = await confirmAction({
      eyebrow: 'Merge duplicates',
      title: `Merge into “${target.name}”?`,
      body: (
        <>
          Everything that points at <b className="text-ink">{source.name}</b> moves to{' '}
          <b className="text-ink">{target.name}</b>, then {source.name} is removed. This can’t be
          undone.
        </>
      ),
      impact: [
        `Logs and favourites (used ${plural(source.uses, 'time')}) move to ${target.name}`,
        `${source.name} disappears from search`,
        `${target.name} keeps its own nutrition (${fmtInt(target.per100g.kcal)} kcal / 100 g)`,
      ],
      confirmLabel: 'Merge',
      onConfirm: () => merge.mutateAsync({ sourceId: source.id, targetId: target.id }),
    });
    if (ok !== null) {
      onClose();
      onMerged();
    }
  };

  return (
    <>
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        Pick the food to keep. Its name and nutrition stay; the duplicate’s logs and favourites move
        over.
      </p>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          aria-label="Search for the food to keep"
          data-autofocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods"
          className="h-[42px] w-full rounded-full border border-border bg-white pl-10 pr-4 text-[14px] outline-none focus:border-accent [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      <div
        role="radiogroup"
        aria-label="Food to keep"
        className="flex max-h-[300px] flex-col overflow-y-auto rounded-[14px] border border-border bg-white"
      >
        {debounced.length < 2 ? (
          <span className="px-4 py-3 text-[13px] text-muted">Type at least 2 letters.</span>
        ) : list.isPending ? (
          <div className="flex flex-col gap-2 p-3">
            <div className="skeleton h-8" />
            <div className="skeleton h-8" />
          </div>
        ) : list.isError ? (
          <span className="px-4 py-3 text-[13px] text-accent-dark">
            Couldn’t search. Try again.
          </span>
        ) : candidates.length === 0 ? (
          <span className="px-4 py-3 text-[13px] text-muted">No other foods match.</span>
        ) : (
          candidates.map((f) => {
            const on = target?.id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTarget(f)}
                className={cn(
                  'flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 text-left last:border-b-0 transition-colors',
                  on ? 'bg-accent-tint/50' : 'hover:bg-bg',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      'h-4 w-4 shrink-0 rounded-full border-2',
                      on
                        ? 'border-accent bg-accent shadow-[inset_0_0_0_2px_#fff]'
                        : 'border-border',
                    )}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold">
                      <span className="truncate">{f.name}</span>
                      {f.verified && (
                        <BadgeCheck
                          aria-label="Verified"
                          className="h-3.5 w-3.5 shrink-0 text-accent"
                        />
                      )}
                      {f.source === 'ai' && <AiChip feature="food.photo" />}
                    </span>
                    <span className="truncate text-[12px] text-muted">
                      {f.brand ? `${f.brand} · ` : ''}
                      {humanize(f.source)} · used {plural(f.uses, 'time')}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[12px]">
                  {fmtInt(f.per100g.kcal)} kcal
                </span>
              </button>
            );
          })
        )}
      </div>
      {target && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <Pill tone="over">{source.name}</Pill>
          <GitMerge aria-hidden className="h-4 w-4 text-muted" />
          <Pill tone="in">{target.name}</Pill>
        </div>
      )}
      <div className="mt-1 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger-solid"
          disabled={!target}
          loading={merge.isPending}
          icon={<GitMerge className="h-4 w-4" />}
          onClick={() => void go()}
        >
          Merge
        </Button>
      </div>
    </>
  );
}
