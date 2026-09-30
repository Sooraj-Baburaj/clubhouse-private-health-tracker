import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CopyPool, SCHEDULED_NOTIFICATION_TYPES } from '@clubhouse/contracts';
import { useUpdateNotifDefaults, type NotifDefaultsResponse } from '@/features/notifications';
import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';
import { Button, Card, CardHeader, IconButton, Input, Select } from '@/ui';

const MAX_LINES = 10;
const MAX_LEN = 160;

/** Reminder copy pool: up to 10 lines per reminder type; one is picked at random for each reminder. */
export function CopyPoolCard({ data }: { data: NotifDefaultsResponse }) {
  const save = useUpdateNotifDefaults('Reminder copy saved');
  const types = useMemo(() => {
    const base = SCHEDULED_NOTIFICATION_TYPES.filter(
      (t) => t.endsWith('_reminder') || t === 'momentum_at_risk',
    );
    return Array.from(new Set<string>([...base, ...Object.keys(data.copyPool)]));
  }, [data.copyPool]);
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);
  const pool = draft ?? data.copyPool;
  const [type, setType] = useState<string>(() => types[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const lines = pool[type] ?? [];
  const dirty =
    draft != null && JSON.stringify(normalise(draft)) !== JSON.stringify(normalise(data.copyPool));
  const label = (t: string) => data.labels[t]?.label ?? humanize(t);

  const setLines = (next: string[]) => setDraft({ ...pool, [type]: next });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalise(pool);
    // Types that had lines and are now empty are sent as [] so the server clears them.
    for (const k of Object.keys(data.copyPool)) clean[k] ??= [];
    const parsed = CopyPool.safeParse(clean);
    const tooMany = Object.entries(clean).find(([, l]) => l.length > MAX_LINES);
    if (!parsed.success || tooMany) {
      setError(
        tooMany
          ? `${label(tooMany[0])} has more than ${MAX_LINES} lines.`
          : `Each line needs 1–${MAX_LEN} characters.`,
      );
      return;
    }
    setError(null);
    save.mutate({ copyPool: parsed.data }, { onSuccess: () => setDraft(null) });
  };

  return (
    <Card>
      <CardHeader
        title="Reminder copy"
        aside={<span className="font-mono text-[12px]">up to {MAX_LINES} lines each</span>}
      />
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        Each reminder picks one line at random so they don’t feel robotic. Keep it friendly and
        short. Empty types fall back to the built-in lines.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Reminder type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full sm:w-[280px]"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {label(t)} ({(pool[t] ?? []).filter((l) => l.trim()).length})
              </option>
            ))}
          </Select>
          <span className="font-mono text-[11px] text-muted">
            {lines.length} / {MAX_LINES}
          </span>
        </div>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {lines.map((l, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right font-mono text-[11px] text-muted">
                {i + 1}
              </span>
              <div className="relative min-w-0 flex-1">
                <Input
                  aria-label={`${label(type)} line ${i + 1}`}
                  value={l}
                  maxLength={MAX_LEN}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? e.target.value : x)))}
                  className="pr-16"
                  invalid={l.trim().length === 0}
                />
                <span
                  className={cn(
                    'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px]',
                    l.length > MAX_LEN - 20 ? 'text-accent-dark' : 'text-muted',
                  )}
                >
                  {l.length}/{MAX_LEN}
                </span>
              </div>
              <IconButton
                label={`Remove line ${i + 1}`}
                size={34}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
          {lines.length === 0 && (
            <li className="rounded-[12px] border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted">
              No custom lines. The built-in copy is used.
            </li>
          )}
        </ol>
        {error && (
          <span role="alert" className="text-[12px] font-semibold text-accent-dark">
            {error}
          </span>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            disabled={lines.length >= MAX_LINES}
            onClick={() => setLines([...lines, ''])}
          >
            Add line
          </Button>
          <div className="flex gap-2">
            {dirty && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDraft(null)}
                disabled={save.isPending}
              >
                Discard
              </Button>
            )}
            <Button type="submit" size="sm" loading={save.isPending} disabled={!dirty}>
              Save copy
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

/** Trim lines, drop empties and empty types, for comparing and saving. */
function normalise(p: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, lines] of Object.entries(p)) {
    const l = lines.map((x) => x.trim()).filter(Boolean);
    if (l.length) out[k] = l;
  }
  return out;
}
