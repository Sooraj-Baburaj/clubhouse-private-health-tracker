import { EyeOff, Flame, Utensils } from 'lucide-react';
import { motion } from 'motion/react';
import type { MemberDayResponse } from '@clubhouse/contracts';
import { AnimatedNumber, Bar, fadeUp, stagger } from '@clubhouse/ui';
import { firstName, fmt, SLOT_LABEL, timeOf } from '@/features/format';
import { BandPill } from '@/ui/atoms/Badges';
import { ActivityIcon } from '@/ui/molecules/ActivityIcon';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';
import { StatTile } from '@/ui/molecules/StatTile';

const ICON = { green: 'check', yellow: 'dash', red: 'alert', neutral: 'progress' } as const;

export function MemberDaySummary({ d }: { d: MemberDayResponse }) {
  const s = d.summary;
  const pct = s.targetKcal ? s.eaten / s.targetKcal : 0;
  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="flex flex-col gap-3">
      <motion.div variants={fadeUp} className="flex flex-col gap-2 rounded-[32px] bg-surface p-5">
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Eaten</span>
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-[46px] leading-none tabular">
            <AnimatedNumber value={s.eaten} />
          </span>
          <span className="text-[14px] text-neutral-700">{s.targetKcal ? `of ${fmt(s.targetKcal)} kcal` : 'kcal'}</span>
        </div>
        {s.targetKcal ? <Bar value={pct} height={14} className="bg-neutral-300" fillStyle={{ background: 'var(--color-accent)' }} label={`${Math.round(pct * 100)} percent of their target`} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          {s.band && s.bandLabel ? <BandPill band={{ band: s.band, label: s.bandLabel, icon: ICON[s.band] }} /> : <span className="text-[13px] text-neutral-700">No band yet</span>}
        </div>
      </motion.div>
      <motion.div variants={fadeUp} className="grid grid-cols-3 gap-2">
        <StatTile label="Meals" value={s.mealsLogged} sub="logged" />
        <StatTile label="Burned" value={fmt(s.burned)} sub="kcal" />
        <StatTile
          label="Streak"
          value={
            <span className="inline-flex items-center gap-1">
              <Flame aria-hidden className="h-4 w-4 text-accent-700" strokeWidth={2.75} />
              {s.streak}
            </span>
          }
          sub="days"
        />
      </motion.div>
      {d.habits && (
        <motion.div variants={fadeUp}>
          <ListGroup title="Habits">
            <ListRow
              title={`${d.habits.done} of ${d.habits.total} kept`}
              sub={d.habits.doneNames ? (d.habits.doneNames.length ? d.habits.doneNames.join(', ') : 'None ticked yet') : 'They keep which ones private'}
              right={<Bar value={d.habits.total ? d.habits.done / d.habits.total : 0} height={8} className="w-20 bg-neutral-300" fillStyle={{ background: 'var(--color-accent-2)' }} label={`${d.habits.done} of ${d.habits.total} habits kept`} />}
            />
          </ListGroup>
        </motion.div>
      )}
      {s.activities.length > 0 && (
        <motion.div variants={fadeUp}>
          <ListGroup title="Moves">
            {s.activities.map((a, i) => (
              <ListRow key={i} title={a.typeName} right={<span className="text-[13px] font-bold tabular">{a.durationMin} min</span>} />
            ))}
          </ListGroup>
        </motion.div>
      )}
    </motion.div>
  );
}

export function MemberDayFull({ d }: { d: MemberDayResponse }) {
  if (!d.full) {
    return (
      <EmptyState
        illustration="rings"
        title="They share daily summaries only"
        body={`${firstName(d.person.name)} keeps meal-by-meal details private. You still see how the day is going above.`}
        action={<EyeOff aria-hidden className="h-5 w-5 text-neutral-600" strokeWidth={2.75} />}
      />
    );
  }
  const { foodLogs, activityLogs } = d.full;
  if (!foodLogs.length && !activityLogs.length) return <EmptyState title="Nothing logged yet" body="Check back later — the day isn’t over." />;
  return (
    <div className="flex flex-col gap-3">
      {foodLogs.length > 0 && (
        <ListGroup title="Meals">
          {foodLogs.map((f) => (
            <ListRow
              key={f.id}
              title={
                <span className="flex items-center gap-2">
                  {f.thumbUrl && !f.imageExpired ? <img src={f.thumbUrl} alt="" className="h-9 w-9 rounded-[12px] object-cover" /> : <Utensils aria-hidden className="h-4 w-4 text-neutral-600" strokeWidth={2.75} />}
                  <span className="min-w-0 truncate">{SLOT_LABEL[f.mealSlot]}</span>
                </span>
              }
              sub={`${f.items.map((i) => i.name).join(', ')} · ${timeOf(f.loggedAt)}`}
              right={<span className="text-[13px] font-bold tabular">{fmt(f.totals.kcal)} kcal</span>}
            />
          ))}
        </ListGroup>
      )}
      {activityLogs.length > 0 && (
        <ListGroup title="Activity">
          {activityLogs.map((a) => (
            <ListRow
              key={a.id}
              title={
                <span className="flex items-center gap-2">
                  <ActivityIcon icon={a.icon} className="h-4 w-4 text-accent-2-700" />
                  {a.typeName}
                </span>
              }
              sub={`${a.durationMin} min${a.distanceKm ? ` · ${a.distanceKm} km` : ''}`}
              right={<span className="text-[13px] font-bold tabular">{fmt(a.kcalBurned)} kcal</span>}
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}
