import { useNavigate } from '@tanstack/react-router';
import { HelpCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { SummaryResponse, TodayResponse } from '@clubhouse/contracts';
import { fmt, relativeTime, SLOT_LABEL } from '@/features/format';
import { AIBadge } from '@/ui/atoms/Badges';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { ListRow } from '@/ui/molecules/ListGroup';
import { shortDay } from './dates';

const NUTRIENT_NAME = { kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fibre: 'Fibre' } as const;

/**
 * Dark coach card. AI mode (≤3 sentences, AI badge, "updated N min ago", "why?") when the AI summary is on and not
 * opted out; otherwise the logic status line in the same card, so there is never a blank card with AI off.
 */
export function CoachCard({ summary, ai, date, isToday }: { summary: TodayResponse['summary']; ai: SummaryResponse | undefined; date: string; isToday: boolean }) {
  const navigate = useNavigate();
  const [why, setWhy] = useState(false);
  const aiText = ai?.mode === 'ai' && ai.sentences.length ? ai.sentences.join(' ') : summary.mode === 'ai' ? summary.text : null;
  const updatedAt = ai?.mode === 'ai' ? ai.updatedAt : summary.updatedAt;
  const text = aiText ?? summary.text;
  const next = summary.why.nextSlot;
  return (
    <>
      <motion.div layout className="flex flex-col gap-1.5 rounded-[28px] bg-text px-[18px] py-4 text-bg">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent-400">{aiText ? 'Coach' : 'Where you are'}</span>
          {aiText && <AIBadge tone="dark" title="Written by AI" />}
          <span className="flex-1" />
          {aiText && updatedAt && <span className="text-[11px] text-neutral-400">updated {relativeTime(updatedAt)}</span>}
          <button type="button" onClick={() => setWhy(true)} className="-my-2 -mr-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-[12px] font-bold text-neutral-300" aria-label="Why? Show the numbers behind this">
            <HelpCircle className="h-4 w-4" strokeWidth={2.75} aria-hidden />
            why?
          </button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={text} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="m-0 text-[15px] leading-normal">
            {text}
          </motion.p>
        </AnimatePresence>
        {!aiText && next && isToday && (
          <button
            type="button"
            onClick={() => void navigate({ to: '/log/food', search: { slot: next, mode: 'search' } })}
            className="mt-1 min-h-10 self-start rounded-full bg-accent px-4 text-[13px] font-bold text-on-accent-fill"
          >
            Log {SLOT_LABEL[next].toLowerCase()}
          </button>
        )}
      </motion.div>
      <MemberSheet open={why} onClose={() => setWhy(false)} title="The numbers behind it">
        <p className="m-0 text-[14px] text-neutral-700">{aiText ? 'The coach reads these numbers from the logic engine, then puts them in words.' : 'Worked out by the logic engine from what you logged.'}</p>
        <div className="flex flex-col rounded-[28px] bg-surface py-1">
          <ListRow title="Left for the day" right={<span className="font-bold tabular">{fmt(summary.why.remainingKcal)} kcal</span>} />
          {summary.why.lowestNutrient && (
            <ListRow title="Furthest from target" sub={NUTRIENT_NAME[summary.why.lowestNutrient.nutrient]} right={<span className="font-bold tabular">{Math.round(summary.why.lowestNutrient.pct)}%</span>} />
          )}
          {summary.why.nextSlot && <ListRow title="Next meal" right={<span className="font-bold">{SLOT_LABEL[summary.why.nextSlot]}</span>} />}
          {summary.why.weekAvgKcal != null && <ListRow title="7-day average eaten" right={<span className="font-bold tabular">{fmt(summary.why.weekAvgKcal)} kcal</span>} />}
        </div>
        <span className="text-[12px] text-neutral-700">For {shortDay(date)}.</span>
      </MemberSheet>
    </>
  );
}
