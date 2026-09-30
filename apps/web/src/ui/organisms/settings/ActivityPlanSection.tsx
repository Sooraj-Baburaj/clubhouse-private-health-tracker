import { Check, Minus, Moon, Send } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { MyPlanResponse, PlanItemDto, WeekStripDay } from '@clubhouse/contracts';
import { fadeUp, stagger } from '@clubhouse/ui';
import { dateLabel, relativeTime } from '@/features/format';
import { usePlan, useProposePlanChange, useRestWeek, useSetPlanDays } from '@/features/plan';
import { Tag } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { ActivityIcon } from '@/ui/molecules/ActivityIcon';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';
import { ErrorCard } from '@/ui/organisms/progress/Kit';
import { cn } from '@/lib/cn';
import { TimeInput, WeekdayChips } from './Kit';

type Days = Record<string, { weekdays: number[]; time: string }>;
const fromPlan = (p: MyPlanResponse): Days => Object.fromEntries(p.items.map((i) => [i.itemId, { weekdays: i.days.map((d) => d.weekday).sort(), time: i.days[0]?.time ?? '07:00' }]));

export function ActivityPlanSection() {
  const q = usePlan();
  const d = q.data;
  if (!d) return q.isError ? <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="your plan" /> : <Skeleton h={260} r={28} />;
  return <PlanBody plan={d} />;
}

function PlanBody({ plan }: { plan: MyPlanResponse }) {
  const setDays = useSetPlanDays();
  const initialKey = JSON.stringify(fromPlan(plan));
  const initial = useMemo(() => JSON.parse(initialKey) as Days, [initialKey]);
  const [days, setDaysState] = useState<Days>(initial);
  // Only reset when the saved plan actually changed (a refetch with the same days keeps unsaved edits).
  useEffect(() => setDaysState(initial), [initial]);
  const dirty = JSON.stringify(days) !== JSON.stringify(initial);
  const save = () => setDays.mutate({ items: plan.items.map((i) => ({ itemId: i.itemId, days: (days[i.itemId]?.weekdays ?? []).map((weekday) => ({ weekday, time: days[i.itemId]?.time ?? '07:00' })) })) });

  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="flex flex-col gap-3.5">
      {!plan.hasPlan ? (
        <motion.div variants={fadeUp}>
          <EmptyState illustration="rings" title="No activity plan yet" body="Your admin hasn’t set one. Every session you log still counts — or suggest a plan below." />
        </motion.div>
      ) : (
        <>
          {plan.note && (
            <motion.p variants={fadeUp} className="m-0 rounded-[22px] bg-accent-200 px-4 py-3 text-[13px] text-accent-800">
              <b>From your admin:</b> {plan.note}
            </motion.p>
          )}
          <motion.div variants={fadeUp}>
            <WeekStrip week={plan.week} anyDay={plan.anyDayStillCounts} />
          </motion.div>
          {plan.items.map((it) => (
            <motion.div variants={fadeUp} key={it.itemId}>
              <PlanItemCard it={it} value={days[it.itemId] ?? { weekdays: [], time: '07:00' }} onChange={(v) => setDaysState((d) => ({ ...d, [it.itemId]: v }))} />
            </motion.div>
          ))}
          {dirty && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="sticky bottom-3 z-10 flex gap-2">
              <Button variant="secondary" className="flex-1 bg-bg" onClick={() => setDaysState(initial)}>
                Undo
              </Button>
              <Button className="flex-1" loading={setDays.isPending} onClick={save}>
                Save my days
              </Button>
            </motion.div>
          )}
        </>
      )}
      <motion.div variants={fadeUp}>
        <ProposeCard plan={plan} />
      </motion.div>
      {plan.hasPlan && (
        <motion.div variants={fadeUp}>
          <RestWeekCard plan={plan} />
        </motion.div>
      )}
    </motion.div>
  );
}

const STATUS: Record<WeekStripDay['status'], { cls: string; icon: React.ReactNode; word: string }> = {
  done: { cls: 'bg-accent text-on-accent-fill', icon: <Check className="h-4 w-4" strokeWidth={3} />, word: 'done' },
  missed: { cls: 'bg-transparent border-2 border-neutral-400 text-neutral-600', icon: <Minus className="h-4 w-4" strokeWidth={3} />, word: 'no session' },
  upcoming: { cls: 'bg-transparent border-2 border-dashed border-accent text-accent-700', icon: null, word: 'planned' },
  today: { cls: 'bg-text text-bg', icon: null, word: 'today' },
  rest: { cls: 'bg-neutral-100 text-neutral-600', icon: <Moon className="h-3.5 w-3.5" strokeWidth={2.75} />, word: 'rest' },
  none: { cls: 'bg-neutral-100 text-neutral-500', icon: null, word: 'free' },
};

function WeekStrip({ week, anyDay }: { week: WeekStripDay[]; anyDay: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-[28px] bg-surface p-4">
      <span className="text-[13px] font-bold">This week</span>
      <div className="grid grid-cols-7 gap-1.5">
        {week.map((d) => {
          const s = STATUS[d.status];
          const detail = d.done.length ? d.done.map((x) => `${x.typeName} ${x.durationMin} min`).join(', ') : d.planned.map((x) => `${x.typeName} ${x.time}`).join(', ');
          return (
            <div key={d.date} className="flex flex-col items-center gap-1" title={detail || undefined}>
              <span className="text-[11px] font-bold text-neutral-700">{dateLabel(d.date, { weekday: 'narrow' })}</span>
              <span role="img" aria-label={`${dateLabel(d.date, { weekday: 'long' })}: ${s.word}${detail ? ` — ${detail}` : ''}`} className={cn('grid aspect-square w-full max-w-10 place-items-center rounded-full text-[11px] font-extrabold', s.cls)}>
                {s.icon ?? (d.planned.length ? d.planned.length : '')}
              </span>
            </div>
          );
        })}
      </div>
      {anyDay && <span className="text-[12px] text-neutral-700">Missed a planned day? Any day this week still counts.</span>}
    </div>
  );
}

function PlanItemCard({ it, value, onChange }: { it: PlanItemDto; value: { weekdays: number[]; time: string }; onChange: (v: { weekdays: number[]; time: string }) => void }) {
  const target = it.perWeek ? `${it.perWeek}× a week` : it.perMonth ? `${it.perMonth}× a month` : null;
  return (
    <div className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-2-200 text-accent-2-800">
          <ActivityIcon icon={it.icon} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-heading text-[18px] leading-tight">{it.typeName}</span>
          <span className="text-[12px] text-neutral-700">
            {[target, it.targetMin ? `${it.targetMin} min each` : null].filter(Boolean).join(' · ')}
            {it.note ? ` · ${it.note}` : ''}
          </span>
        </span>
        <Tag tone={it.done >= it.target && it.target > 0 ? 'accent2' : 'neutral'}>
          {it.done} of {it.target}
        </Tag>
      </div>
      <WeekdayChips label={`Days for ${it.typeName}`} value={value.weekdays} hint={it.suggestedDays} onChange={(weekdays) => onChange({ ...value, weekdays })} />
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="text-neutral-700">{value.weekdays.length ? `${value.weekdays.length} day${value.weekdays.length === 1 ? '' : 's'} picked` : it.suggestedDays.length ? 'Dotted days are suggestions' : 'Pick the days that suit you'}</span>
        <span className="flex items-center gap-2 font-bold">
          at
          <TimeInput label={`Time for ${it.typeName}`} value={value.time} onChange={(time) => onChange({ ...value, time })} />
        </span>
      </div>
    </div>
  );
}

function ProposeCard({ plan }: { plan: MyPlanResponse }) {
  const [text, setText] = useState('');
  const propose = useProposePlanChange();
  return (
    <div className="flex flex-col gap-2.5">
      <form
        className="flex flex-col gap-2 rounded-[28px] bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) propose.mutate(text.trim(), { onSuccess: () => setText('') });
        }}
      >
        <label htmlFor="plan-propose" className="text-[15px] font-bold">
          {plan.hasPlan ? 'Suggest a change' : 'Suggest a plan'}
        </label>
        <textarea
          id="plan-propose"
          value={text}
          maxLength={500}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Swap Thursday gym for a swim — the pool opens early"
          className="resize-none rounded-[22px] border border-divider bg-bg px-4 py-3 text-[15px] outline-none focus:border-accent"
        />
        <Button type="submit" size="sm" className="self-end" loading={propose.isPending} disabled={text.trim().length < 3} icon={<Send className="h-4 w-4" strokeWidth={2.75} />}>
          Send to admin
        </Button>
      </form>
      {plan.proposals.length > 0 && (
        <ListGroup title="Your suggestions">
          {plan.proposals.map((p) => (
            <ListRow key={p.id} title={p.text} sub={`${p.status} · ${relativeTime(p.createdAt)}${p.adminReply ? ` · “${p.adminReply}”` : ''}`} />
          ))}
        </ListGroup>
      )}
    </div>
  );
}

function RestWeekCard({ plan }: { plan: MyPlanResponse }) {
  const rest = useRestWeek();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const current = plan.restWeek && plan.restWeek.weekStart === plan.weekStart ? plan.restWeek : null;
  return (
    <div className="flex flex-col gap-2 rounded-[28px] bg-surface p-4">
      <span className="flex items-center gap-2 text-[15px] font-bold">
        <Moon aria-hidden className="h-4 w-4" strokeWidth={2.75} />
        Rest week
      </span>
      {current ? (
        <span className="text-[13px] text-neutral-700">
          Requested for this week · <b className="text-text">{current.status}</b>
        </span>
      ) : open ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            rest.mutate({ weekStart: plan.weekStart, reason: reason.trim() || undefined }, { onSuccess: () => setOpen(false) });
          }}
        >
          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional) — travel, a niggle, exams…" aria-label="Reason for a rest week" className="min-h-12 rounded-full border border-divider bg-bg px-4 text-[15px] outline-none focus:border-accent" />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" loading={rest.isPending}>
              Ask for this week
            </Button>
          </div>
        </form>
      ) : (
        <>
          <span className="text-[13px] text-neutral-700">Body asking for a break? Ask your admin to pause this week’s plan — your activity streak waits for you.</span>
          <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>
            Request a rest week
          </Button>
        </>
      )}
    </div>
  );
}
