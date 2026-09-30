import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useUi } from '@/app/uiStore';
import { useMeData } from '@/features/me';
import { cn } from '@/lib/cn';
import { AIBadge } from '@/ui/atoms/Badges';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { MilestoneOverlay } from '@/ui/organisms/log/MilestoneOverlay';
import { useListMotion } from '@/ui/organisms/today/motion';

interface Option {
  key: string;
  label: string;
  sub: string;
  ai?: boolean;
  tone: string;
  go: () => void;
}

/**
 * Global "What are we logging?" sheet opened by the tab-bar +. It is mounted once in the app shell, so it also hosts
 * the milestone celebration that follows a save (the log screens have already navigated away by then).
 */
export function LogSheet() {
  const open = useUi((s) => s.logSheet);
  const close = useUi((s) => s.closeLogSheet);
  const openWeight = useUi((s) => s.openWeightSheet);
  const me = useMeData();
  const navigate = useNavigate();
  const loc = useLocation();
  const search = useSearch({ strict: false });
  const m = useListMotion(0.05, 0.05);
  // Logging from a past day on Today carries that date through.
  const date = loc.pathname === '/' && typeof search.date === 'string' ? search.date : undefined;

  const go = (fn: () => void) => () => {
    close();
    fn();
  };
  const options: Option[] = [
    ...(me.ai.photoAvailable
      ? [{ key: 'snap', label: 'Snap a meal', sub: 'One photo, we read the plate', ai: true, tone: 'bg-accent text-on-accent', go: go(() => void navigate({ to: '/log/food', search: { mode: 'camera', date } })) }]
      : []),
    { key: 'search', label: 'Search food', sub: 'Roti, dosa, dal and plenty more', tone: 'bg-surface text-text', go: go(() => void navigate({ to: '/log/food', search: { mode: 'search', date } })) },
    { key: 'activity', label: 'Log activity', sub: 'Three taps: type, time, done', tone: 'bg-accent-2 text-on-accent', go: go(() => void navigate({ to: '/log/activity', search: { date } })) },
    { key: 'weight', label: 'Log weight', sub: 'Step on, type it in', tone: 'border border-divider bg-transparent text-text', go: openWeight },
  ];

  return (
    <>
      <MemberSheet open={open} onClose={close} title="What are we logging?">
        <motion.ul variants={m.container} initial="hidden" animate="show" className="m-0 flex list-none flex-col gap-2.5 p-0 pb-2">
          {options.map((o) => (
            <motion.li key={o.key} variants={m.item}>
              <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={o.go} className={cn('flex min-h-16 w-full items-center gap-3.5 rounded-[26px] px-4 py-3.5 text-left', o.tone)}>
                <span className="flex flex-1 flex-col">
                  <span className="font-heading text-[18px] leading-tight">{o.label}</span>
                  <span className="text-[12px] opacity-80">{o.sub}</span>
                </span>
                {o.ai && <AIBadge />}
              </motion.button>
            </motion.li>
          ))}
        </motion.ul>
      </MemberSheet>
      <MilestoneOverlay />
    </>
  );
}
