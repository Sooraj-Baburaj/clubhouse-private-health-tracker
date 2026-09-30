import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DEFAULT_THRESHOLDS, NUTRIENTS, Thresholds, type Nutrient, type NutrientThreshold } from '@clubhouse/contracts';
import { bandFromThreshold } from '@clubhouse/domain';
import { useTeamSettings } from '@/features/directory';
import { useSaveThresholds } from '@/features/goals';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { BandPill, Button, Card, CardHeader, ErrorState, Input, NumberInput, SkeletonCard, Toggle } from '@/ui';
import { NUTRIENT_LABEL, Refusal } from './parts';

const PREVIEW_PCTS = [80, 100, 120] as const;
const NUM_FIELDS = [
  { key: 'yellowUnderBelow', label: 'Under below', hint: 'Yellow “under” below this %' },
  { key: 'greenUpTo', label: 'Green up to', hint: 'Green up to this %' },
  { key: 'yellowOverUpTo', label: 'Soft over up to', hint: 'Yellow “a bit over” up to this %' },
] as const;
const LABEL_FIELDS = [
  { key: 'under', label: 'Under' },
  { key: 'ok', label: 'On track' },
  { key: 'overSoft', label: 'A bit over' },
  { key: 'over', label: 'Over' },
] as const;

type NumKey = (typeof NUM_FIELDS)[number]['key'];

/** Ordering and label checks on top of the zod schema. */
export function thresholdProblems(t: NutrientThreshold): string | null {
  const { yellowUnderBelow: u, greenUpTo: g, yellowOverUpTo: o } = t;
  if (u != null && g != null && u > g) return '“Under below” must not be higher than “green up to”.';
  if (g != null && o != null && o < g) return '“Soft over up to” must be at least “green up to”.';
  if (g == null && o != null) return '“Soft over up to” needs a “green up to” value.';
  if (Object.values(t.labels).some((l) => !l.trim())) return 'Every label needs some words.';
  return null;
}

/** 80 / 100 / 120 % → band pills for one nutrient (day closed). */
export function BandPreview({ nutrient, t, compact }: { nutrient: Nutrient; t: NutrientThreshold; compact?: boolean }) {
  return (
    <div className={cn('flex gap-1.5', compact ? 'flex-wrap' : 'flex-col')}>
      {PREVIEW_PCTS.map((pct) => {
        const r = bandFromThreshold(nutrient, pct, t, true);
        return (
          <span key={pct} className="flex items-center gap-1.5" title={`${pct}% of target → ${r.label}`}>
            <span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted">{pct}%</span>
            <BandPill band={r.band} label={r.label} />
          </span>
        );
      })}
    </div>
  );
}

/** Team thresholds tab (Appendix E editor). */
export function TeamThresholdsTab() {
  const team = useTeamSettings();
  if (team.isPending) return <SkeletonCard lines={7} />;
  if (team.isError)
    return (
      <Card>
        <ErrorState error={team.error} onRetry={() => void team.refetch()} />
      </Card>
    );
  const saved = team.data.settings.thresholds;
  return <ThresholdsForm key={JSON.stringify(saved)} saved={saved} />;
}

function ThresholdsForm({ saved }: { saved: Thresholds }) {
  const save = useSaveThresholds();
  const [draft, setDraft] = useState<Thresholds>(saved);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const isDefault = JSON.stringify(draft) === JSON.stringify(DEFAULT_THRESHOLDS);
  const problems = useMemo(() => Object.fromEntries(NUTRIENTS.map((n) => [n, thresholdProblems(draft[n])])) as Record<Nutrient, string | null>, [draft]);
  const hasProblems = Object.values(problems).some(Boolean);

  const setNum = (n: Nutrient, k: NumKey, v: number | null) => setDraft((d) => ({ ...d, [n]: { ...d[n], [k]: v } }));
  const setLabel = (n: Nutrient, k: keyof NutrientThreshold['labels'], v: string) => setDraft((d) => ({ ...d, [n]: { ...d[n], labels: { ...d[n].labels, [k]: v } } }));
  const setRed = (n: Nutrient, v: boolean) => setDraft((d) => ({ ...d, [n]: { ...d[n], redOver: v } }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (hasProblems) return setError('Fix the highlighted rows first.');
    const parsed = Thresholds.safeParse(draft);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return setError(i ? `${NUTRIENT_LABEL[i.path[0] as Nutrient] ?? 'Thresholds'}: percentages must be between 0 and 1000 (under below up to 300).` : 'Check the values.');
    }
    try {
      await save.mutateAsync(parsed.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const cellInput = 'h-9 text-[13px]';

  return (
    <Card>
      <CardHeader
        title="Band thresholds"
        eyebrow="Appendix E · team-wide"
        aside="Percent of each member’s target. Blank (—) means that band never applies."
      />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[1180px] border-collapse text-[13px]">
            <caption className="sr-only">Band thresholds per nutrient</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="th py-2 pr-3">Nutrient</th>
                {NUM_FIELDS.map((f) => (
                  <th key={f.key} scope="col" className="th w-[104px] py-2 pr-3" title={f.hint}>
                    {f.label} %
                  </th>
                ))}
                <th scope="col" className="th w-[76px] py-2 pr-3" title="Past the soft-over limit, show red. Off keeps it yellow.">
                  Red over
                </th>
                {LABEL_FIELDS.map((f) => (
                  <th key={f.key} scope="col" className="th w-[120px] py-2 pr-3">
                    “{f.label}” label
                  </th>
                ))}
                <th scope="col" className="th w-[190px] py-2">
                  Preview
                </th>
              </tr>
            </thead>
            <tbody>
              {NUTRIENTS.map((n) => {
                const t = draft[n];
                const problem = problems[n];
                return (
                  <tr key={n} className={cn('border-b border-hairline align-top last:border-b-0', problem && 'bg-accent-tint/25')}>
                    <th scope="row" className="py-3 pr-3 text-left">
                      <span className="flex flex-col gap-1">
                        <span className="text-[14px] font-semibold">{NUTRIENT_LABEL[n]}</span>
                        {problem && (
                          <span role="alert" className="max-w-[160px] text-[12px] font-semibold leading-snug text-accent-dark">
                            {problem}
                          </span>
                        )}
                      </span>
                    </th>
                    {NUM_FIELDS.map((f) => (
                      <td key={f.key} className="py-3 pr-3">
                        <NumberInput aria-label={`${NUTRIENT_LABEL[n]} ${f.label.toLowerCase()} percent`} className={cellInput} value={t[f.key]} onValue={(v) => setNum(n, f.key, v)} min={0} max={f.key === 'yellowUnderBelow' ? 300 : 1000} step={1} placeholder="—" invalid={!!problem} />
                      </td>
                    ))}
                    <td className="py-3 pr-3">
                      <div className="flex h-9 items-center">
                        <Toggle checked={t.redOver} onChange={(v) => setRed(n, v)} label={`${NUTRIENT_LABEL[n]}: red when over`} />
                      </div>
                    </td>
                    {LABEL_FIELDS.map((f) => (
                      <td key={f.key} className="py-3 pr-3">
                        <Input aria-label={`${NUTRIENT_LABEL[n]} “${f.label}” label`} className={cellInput} value={t.labels[f.key]} maxLength={24} onChange={(e) => setLabel(n, f.key, e.target.value)} />
                      </td>
                    ))}
                    <td className="py-3">
                      <BandPreview nutrient={n} t={t} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px] leading-relaxed text-muted">
          Below “under below” shows the <b>under</b> label; up to “green up to” is <b>on track</b>; up to “soft over up to” is <b>a bit over</b>; beyond that is <b>over</b> (red only when “Red over” is on). The preview assumes the day is finished; before 8 pm calories and carbs stay neutral while members are still eating.
        </p>
        {error && <Refusal title="Thresholds not saved">{error}</Refusal>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} className="mr-auto" disabled={isDefault} onClick={() => setDraft(DEFAULT_THRESHOLDS)}>
            Reset to defaults
          </Button>
          {dirty && (
            <Button variant="secondary" onClick={() => setDraft(saved)}>
              Discard changes
            </Button>
          )}
          <Button type="submit" loading={save.isPending} disabled={!dirty}>
            Save thresholds
          </Button>
        </div>
      </form>
    </Card>
  );
}
