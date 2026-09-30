import { motion } from 'motion/react';
import type { TodayResponse } from '@clubhouse/contracts';
import { firstName } from '@/features/format';
import { Avatar } from '@/ui/atoms/Avatar';
import { useListMotion } from './motion';

/** "Crew today": who has logged (accent ring) and "{n} of {total} logged"; tap a face for their day. */
export function CrewRow({ t, onOpen }: { t: TodayResponse; onOpen: (memberId: string) => void }) {
  const m = useListMotion(0.04);
  if (!t.crew.length) return null;
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="crew-title">
      <div className="flex items-baseline">
        <h2 id="crew-title" className="flex-1 font-heading text-[20px]">
          Crew today
        </h2>
        <span className="text-[13px] text-neutral-700">
          {t.crewLogged} of {t.crewTotal} logged
        </span>
      </div>
      <motion.ul variants={m.container} initial="hidden" animate="show" className="scroll-hidden snap-x-chips -mx-[22px] m-0 flex list-none gap-2.5 overflow-x-auto px-[22px] pb-1">
        {t.crew.map((c) => (
          <motion.li key={c.id} variants={m.item} className="shrink-0">
            <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={() => onOpen(c.id)} aria-label={`${c.name}, ${c.logged ? 'logged today' : 'not logged yet'}`} className="flex min-w-[52px] flex-col items-center gap-1 rounded-[18px] py-0.5">
              <Avatar name={c.name} initials={c.initials} url={c.avatarUrl} size={46} ring active={c.logged} />
              <span className="max-w-[60px] truncate text-[11px] text-neutral-700">{firstName(c.name)}</span>
            </motion.button>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}
