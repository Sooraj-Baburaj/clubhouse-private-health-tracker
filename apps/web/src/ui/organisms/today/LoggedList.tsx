import { Clock, Scale } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ActivityLogDto, FoodLogDto, MemeMomentDto, WeightEntryDto } from '@clubhouse/contracts';
import { displayWeight } from '@clubhouse/domain';
import { fmt, SLOT_LABEL, timeOf } from '@/features/format';
import { AIBadge, Tag } from '@/ui/atoms/Badges';
import { ActivityIcon } from '@/ui/molecules/ActivityIcon';
import { usePendingIds } from '@/ui/molecules/StatusPills';
import { LogRow } from './LogRow';
import { MemeMomentCard } from './MemeMomentCard';

export type LogEntry = { kind: 'food'; log: FoodLogDto; at: string } | { kind: 'activity'; log: ActivityLogDto; at: string } | { kind: 'weight'; log: WeightEntryDto; at: string };

export function buildEntries(food: FoodLogDto[], acts: ActivityLogDto[], weight: WeightEntryDto | null): LogEntry[] {
  const out: LogEntry[] = [
    ...food.filter((f) => !f.deleted).map((log) => ({ kind: 'food' as const, log, at: log.loggedAt })),
    ...acts.filter((a) => !a.deleted).map((log) => ({ kind: 'activity' as const, log, at: log.loggedAt })),
  ];
  if (weight && !weight.deleted) out.push({ kind: 'weight', log: weight, at: weight.clientUpdatedAt });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

function PendingClock({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <span className="inline-flex items-center gap-1 text-neutral-700" title="Waiting to sync">
      <Clock className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
      <span className="sr-only">Waiting to sync</span>
    </span>
  );
}

function FoodRow({ log, pending, tz, onOpen }: { log: FoodLogDto; pending: boolean; tz: string; onOpen: () => void }) {
  const names = log.items.map((i) => i.name).join(', ') || 'Meal';
  const thumb = !log.imageExpired ? (log.thumbUrl ?? log.imageUrl) : null;
  return (
    <LogRow
      label={`${SLOT_LABEL[log.mealSlot]}: ${names}, ${fmt(log.totals.kcal)} kcal${log.aiGenerated ? ', made with AI' : ''}${pending ? ', waiting to sync' : ''}. Open actions`}
      onOpen={onOpen}
      lead={SLOT_LABEL[log.mealSlot]}
      title={
        <>
          {thumb && <img src={thumb} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" loading="lazy" />}
          <span className="truncate">{names}</span>
          {log.aiGenerated && <AIBadge className="shrink-0" />}
        </>
      }
      meta={
        (pending || log.addedLate) && (
          <>
            <span>{timeOf(log.loggedAt, tz)}</span>
            {log.addedLate && <Tag className="px-2 py-0 text-[11px]">added later</Tag>}
            <PendingClock pending={pending} />
          </>
        )
      }
      right={fmt(log.totals.kcal)}
    />
  );
}

function ActivityRow({ log, pending, onOpen }: { log: ActivityLogDto; pending: boolean; onOpen: () => void }) {
  return (
    <LogRow
      label={`${log.typeName}, ${log.durationMin} minutes, ${fmt(log.kcalBurned)} kcal burned${pending ? ', waiting to sync' : ''}. Open actions`}
      onOpen={onOpen}
      lead={
        <span className="inline-flex items-center gap-1.5">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-2-200 text-accent-2-800">
            <ActivityIcon icon={log.icon} className="h-4 w-4" />
          </span>
          Move
        </span>
      }
      title={
        <span className="truncate">
          {log.typeName} · {log.durationMin} min{log.distanceKm ? ` · ${log.distanceKm} km` : ''}
        </span>
      }
      meta={
        (pending || log.addedLate) && (
          <>
            {log.addedLate && <Tag className="px-2 py-0 text-[11px]">added later</Tag>}
            <PendingClock pending={pending} />
          </>
        )
      }
      right={<span className="text-accent-2-800">−{fmt(log.kcalBurned)}</span>}
    />
  );
}

function WeightRow({ log, units, pending, onOpen }: { log: WeightEntryDto; units: 'metric' | 'imperial'; pending: boolean; onOpen: () => void }) {
  return (
    <LogRow
      label={`Weigh-in ${displayWeight(log.weightKg, units)}${pending ? ', waiting to sync' : ''}. Open actions`}
      onOpen={onOpen}
      lead={
        <span className="inline-flex items-center gap-1.5">
          <Scale className="h-4 w-4" strokeWidth={2.75} aria-hidden />
          Weigh-in
        </span>
      }
      title={<span className="truncate">{displayWeight(log.weightKg, units)}</span>}
      meta={pending || log.note ? <>{log.note && <span className="truncate">{log.note}</span>}<PendingClock pending={pending} /></> : undefined}
      right=""
    />
  );
}

/** "Logged": food, activity and weigh-in rows (newest first) with meme moments inline under their log. */
export function LoggedList({ entries, moments, units, tz, onOpen }: { entries: LogEntry[]; moments: MemeMomentDto[]; units: 'metric' | 'imperial'; tz: string; onOpen: (e: LogEntry) => void }) {
  const pending = usePendingIds();
  const ids = new Set(entries.map((e) => e.log.id));
  const loose = moments.filter((m) => !m.logId || !ids.has(m.logId));
  return (
    <section className="flex flex-col" aria-labelledby="logged-title">
      <h2 id="logged-title" className="mb-1.5 font-heading text-[20px]">
        Logged
      </h2>
      <AnimatePresence initial={false}>
        {loose.map((m) => (
          <MemeMomentCard key={m.fireId} moment={m} />
        ))}
      </AnimatePresence>
      <ul className="m-0 flex list-none flex-col p-0">
        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <motion.li key={`${e.kind}:${e.log.id}`} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
              {e.kind === 'food' && <FoodRow log={e.log} pending={pending.has(e.log.id)} tz={tz} onOpen={() => onOpen(e)} />}
              {e.kind === 'activity' && <ActivityRow log={e.log} pending={pending.has(e.log.id)} onOpen={() => onOpen(e)} />}
              {e.kind === 'weight' && <WeightRow log={e.log} units={units} pending={pending.has(e.log.id)} onOpen={() => onOpen(e)} />}
              <AnimatePresence initial={false}>
                {moments
                  .filter((m) => m.logId === e.log.id)
                  .map((m) => (
                    <MemeMomentCard key={m.fireId} moment={m} />
                  ))}
              </AnimatePresence>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
