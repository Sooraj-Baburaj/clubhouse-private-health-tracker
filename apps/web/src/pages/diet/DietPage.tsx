import { useSearch } from '@tanstack/react-router';
import { MotionConfig, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DietOptionDto, MealSlot } from '@clubhouse/contracts';
import { AnimatedNumber, fadeUp, stagger, toast } from '@clubhouse/ui';
import { deleteUpsert, optionTotals, sortOptions, useDiet, useLogOption, useOptionFeedback } from '@/features/diet';
import { fmt, SLOT_LABEL } from '@/features/format';
import { useSaveFoodLog } from '@/features/logs';
import { useMeData } from '@/features/me';
import { AIBadge } from '@/ui/atoms/Badges';
import { Segmented } from '@/ui/atoms/Segmented';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { SwapIdeaCard, UpdatedBanner } from '@/ui/organisms/diet/DietBanners';
import { NoPlan } from '@/ui/organisms/diet/NoPlan';
import { OptionActionsSheet, PortionSheet, PreviousPlanSheet } from '@/ui/organisms/diet/Sheets';
import { SlotCard } from '@/ui/organisms/diet/SlotCard';
import { ErrorCard } from '@/ui/organisms/progress/Kit';

/** Diet tab (plan §8.9): pick a plate per slot from the admin's plan and log it. */
export function DietPage() {
  const me = useMeData();
  const search = useSearch({ strict: false }) as { slot?: MealSlot };
  const [dayType, setDayType] = useState<'training' | 'rest' | undefined>(undefined);
  const q = useDiet(undefined, dayType);
  const d = q.data;
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Partial<Record<MealSlot, boolean>>>({});
  const [logFor, setLogFor] = useState<{ option: DietOptionDto; slot: MealSlot } | null>(null);
  const [actionsFor, setActionsFor] = useState<DietOptionDto | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  const [flash, setFlash] = useState<MealSlot | null>(null);
  const logOption = useLogOption();
  const feedback = useOptionFeedback();
  const saveFood = useSaveFoodLog();
  const refs = useRef<Partial<Record<MealSlot, HTMLElement | null>>>({});

  const slots = useMemo(() => (d?.slots ?? []).map((s) => ({ slot: s, options: sortOptions(s.options) })), [d]);
  const selectedOf = (slot: MealSlot, options: DietOptionDto[]) => {
    const id = picked[slot];
    return options.find((o) => o.id === id) ?? options[0] ?? null;
  };
  const total = slots.reduce((sum, s) => sum + (selectedOf(s.slot.slot, s.options)?.nutrition.kcal ?? 0), 0);

  // ?slot= deep link: scroll that slot into view and flash it.
  useEffect(() => {
    if (!search.slot || !d?.plan) return;
    const slot = search.slot;
    const t = setTimeout(() => {
      refs.current[slot]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setFlash(slot);
      setTimeout(() => setFlash(null), 1600);
    }, 300);
    return () => clearTimeout(t);
  }, [search.slot, d?.plan]);

  const confirmLog = (portions: number[] | undefined) => {
    if (!logFor || !d) return;
    const { option, slot } = logFor;
    const kcal = optionTotals(option, portions).kcal;
    logOption.mutate(
      { option, slot, date: d.date, portions },
      {
        onSuccess: (r) => {
          setLogFor(null);
          if (r.queued) return;
          toast.success(`${SLOT_LABEL[slot]} logged · ${fmt(kcal)} kcal`, {
            action: { label: 'Undo', onClick: () => saveFood.mutate({ id: r.logId, data: deleteUpsert(r.upsert) }) },
          });
        },
      },
    );
  };

  let body: React.ReactNode;
  if (!d) {
    body = q.isError ? (
      <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="your plan" />
    ) : (
      <div className="flex flex-col gap-3.5" aria-busy>
        <Skeleton h={14} w={180} r={8} />
        <Skeleton h={34} w={240} r={12} />
        <Skeleton h={18} w={280} r={8} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} h={170} r={30} />
        ))}
      </div>
    );
  } else if (!d.plan) {
    body = <NoPlan d={d} targets={d.targets ?? (me.targets ? { kcal: me.targets.kcal, protein: me.targets.protein, carbs: me.targets.carbs, fat: me.targets.fat, fibre: me.targets.fibre } : null)} />;
  } else {
    const plan = d.plan;
    const target = d.targets?.kcal ?? me.targets?.kcal ?? null;
    const visible = slots.filter((s) => s.options.length > 0);
    body = (
      <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="flex flex-col gap-3.5">
        <motion.div variants={fadeUp} className="flex flex-col gap-0.5">
          <span className="eyebrow flex flex-wrap items-center gap-1.5">
            {plan.name}
            {plan.publishedBy ? ` · set by ${plan.publishedBy.name}` : ''}
            {plan.aiGenerated && me.ai.teamOn && <AIBadge title="Drafted with AI" />}
          </span>
          <h1 className="font-heading text-[30px] leading-[1.1]">Pick your plates</h1>
          <span className="text-[14px] text-neutral-700">
            Today’s picks add up to{' '}
            <b className="text-text tabular">
              <AnimatedNumber value={total} /> kcal
            </b>
            {target ? ` of your ${fmt(target)}.` : '.'}
          </span>
          {plan.aiGenerated && plan.reviewedBy && <span className="text-[12px] text-neutral-700">Drafted with AI, reviewed by {plan.reviewedBy.name}</span>}
        </motion.div>
        {d.updatedBanner && (
          <motion.div variants={fadeUp}>
            <UpdatedBanner by={d.updatedBanner.by} on={d.updatedBanner.on} note={d.updatedBanner.note} onViewPrevious={d.previous ? () => setPrevOpen(true) : undefined} />
          </motion.div>
        )}
        {d.swapIdea && me.ai.teamOn && (
          <motion.div variants={fadeUp}>
            <SwapIdeaCard text={d.swapIdea} />
          </motion.div>
        )}
        {plan.hasDayTypes && (
          <motion.div variants={fadeUp} className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-neutral-700">Plates for a</span>
            <Segmented
              size="sm"
              label="Day type"
              value={dayType ?? d.dayType}
              onChange={(v) => {
                setPicked({});
                setExpanded({});
                setDayType(v);
              }}
              options={[
                { value: 'training', label: 'Training day' },
                { value: 'rest', label: 'Rest day' },
              ]}
            />
          </motion.div>
        )}
        {visible.length === 0 ? (
          <EmptyState title="No options for this day yet" body="Your admin hasn’t added plates for this day type. Try the other one, or log from search." />
        ) : (
          visible.map(({ slot, options }) => (
            <motion.div variants={fadeUp} key={`${d.dayType}-${slot.slot}`}>
              <SlotCard
                ref={(el) => {
                  refs.current[slot.slot] = el;
                }}
                slot={slot}
                options={options}
                selectedId={selectedOf(slot.slot, options)?.id ?? null}
                onSelect={(id) => {
                  setPicked((p) => ({ ...p, [slot.slot]: id }));
                  setExpanded((e) => ({ ...e, [slot.slot]: true }));
                }}
                expanded={!!expanded[slot.slot]}
                onLog={(option) => setLogFor({ option, slot: slot.slot })}
                onActions={setActionsFor}
                highlight={flash === slot.slot}
                aiOn={me.ai.teamOn}
              />
            </motion.div>
          ))
        )}
      </motion.div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-3.5 px-5 pb-6 pt-2.5">{body}</div>
      <PortionSheet option={logFor?.option ?? null} slotLabel={logFor ? SLOT_LABEL[logFor.slot] : ''} onClose={() => setLogFor(null)} onConfirm={confirmLog} busy={logOption.isPending} />
      <OptionActionsSheet
        option={actionsFor}
        onClose={() => setActionsFor(null)}
        onFeedback={(o, reaction) => feedback.mutate({ optionId: o.id, reaction })}
        onView={(o) => {
          setPicked((p) => ({ ...p, [o.mealSlot]: o.id }));
          setExpanded((e) => ({ ...e, [o.mealSlot]: true }));
        }}
      />
      <PreviousPlanSheet planId={d?.previous?.id ?? null} open={prevOpen && !!d?.previous} onClose={() => setPrevOpen(false)} until={d?.previous?.viewableUntil ?? null} />
    </MotionConfig>
  );
}
