import { Grid3x3 } from 'lucide-react';
import { useHabitAdherence } from '@/features/habits';
import { fmtDate } from '@/lib/format';
import { Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/ui';
import { HEAT_LEGEND, HabitIcon, heatShade } from './shared';

/** Member × habit heatmap, last 4 weeks: share of scheduled days kept. Individual check-ins stay private. */
export function AdherencePanel({ onOpen }: { onOpen: (habitId: string) => void }) {
  const q = useHabitAdherence();
  const d = q.data;
  const cols = `150px repeat(${Math.max(d?.habits.length ?? 1, 1)}, minmax(64px, 1fr)) 70px`;
  return (
    <Card>
      <CardHeader title="Member × habit · last 4 weeks" aside={d ? `${fmtDate(d.from)} – ${fmtDate(d.to)}. Share of scheduled days kept. Individual check-ins stay private.` : 'Share of scheduled days kept. Individual check-ins stay private.'} />
      {q.isPending ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 rounded-[8px]" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : !d || !d.habits.length || !d.rows.length ? (
        <EmptyState compact icon={<Grid3x3 className="h-5 w-5" />} title={d?.habits.length ? 'No members yet' : 'No active habits'} body="The heatmap fills in once members have habits that were due." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="block w-full min-w-[820px]">
              <caption className="sr-only">Habit adherence per member over the last four weeks</caption>
              <thead className="block">
                <tr className="grid items-end gap-1.5" style={{ gridTemplateColumns: cols }}>
                  <th scope="col">
                    <span className="sr-only">Member</span>
                  </th>
                  {d.habits.map((h) => (
                    <th key={h.id} scope="col" className="font-normal">
                      <button type="button" onClick={() => onOpen(h.id)} className="flex w-full flex-col items-center gap-1 rounded-[8px] p-1 text-center hover:bg-bg" title={`Edit ${h.name}`}>
                        <HabitIcon icon={h.icon} hue={h.hue} size={28} className="rounded-[8px]" />
                        <span className="text-[11px] font-semibold leading-tight">{h.name}</span>
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="text-center font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-muted">
                    Avg
                  </th>
                </tr>
              </thead>
              <tbody className="mt-1.5 flex flex-col gap-1.5">
                {d.rows.map((r) => (
                  <tr key={r.person.id} className="grid items-center gap-1.5" style={{ gridTemplateColumns: cols }}>
                    <th scope="row" className="truncate text-left text-[13px] font-semibold">
                      {r.person.name}
                    </th>
                    {r.cells.map((c, i) => {
                      const h = d.habits[i]!;
                      if (!c) {
                        return (
                          <td key={h.id} title={`${r.person.name} · ${h.name}: not assigned`} className="grid h-9 place-items-center rounded-[8px] bg-bg font-mono text-[11px] text-[#B5B5BC]">
                            —
                          </td>
                        );
                      }
                      const shade = heatShade(c.pct);
                      return (
                        <td
                          key={h.id}
                          title={c.pct == null ? `${r.person.name} · ${h.name}: nothing due yet` : `${r.person.name} · ${h.name}: ${c.kept} of ${c.scheduled} kept`}
                          className="grid h-9 place-items-center rounded-[8px] font-mono text-[11px] transition-colors"
                          style={{ background: shade.bg, color: shade.fg }}
                        >
                          {c.pct == null ? 'New' : `${c.pct}%`}
                        </td>
                      );
                    })}
                    <td className="text-center font-mono text-[12px] font-medium">{r.avg == null ? '—' : `${r.avg}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3.5 border-t border-hairline pt-3 text-[12px] text-muted">
            {HEAT_LEGEND.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-3.5 w-3.5 rounded-[4px] border border-hairline" style={{ background: l.bg }} />
                {l.label}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
