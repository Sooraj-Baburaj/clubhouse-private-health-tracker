import { Bell, ChevronLeft, ChevronRight, Flame, Pause, Palmtree } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { TodayResponse } from '@clubhouse/contracts';
import { cn } from '@/lib/cn';
import { Avatar } from '@/ui/atoms/Avatar';
import { IconButton } from '@/ui/atoms/IconButton';
import { shortDay } from './dates';

function StreakPill({ streak, onClick }: { streak: TodayResponse['streak']; onClick: () => void }) {
  const paused = streak.status === 'paused';
  const vacation = streak.status === 'vacation';
  const label = vacation ? 'On a break' : paused ? 'Streak paused · log to resume' : streak.current > 0 ? `${streak.current}-day streak` : 'Start a streak today';
  const Icon = vacation ? Palmtree : paused ? Pause : Flame;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      aria-label={`${label}. Open momentum`}
      className={cn('flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-extrabold', paused ? 'bg-neutral-100 text-neutral-800' : 'bg-accent-200 text-accent-800')}
    >
      <Icon className="h-4 w-4" strokeWidth={2.75} aria-hidden />
      {label}
      {streak.atRisk && !paused && <span className="ml-0.5 h-2 w-2 rounded-full bg-accent-2" aria-label="needs a log today" />}
    </motion.button>
  );
}

/** Today 1b header: "{Tue 30 Sep} · {goal word}" with a ‹ › day switcher, bell (Inbox) and avatar (Settings), then the streak pill. */
export function TodayHeader({
  date,
  isToday,
  canGoForward,
  goalWord,
  streak,
  inboxUnread,
  person,
  onPrev,
  onNext,
  onToday,
  onStreak,
  onInbox,
  onSettings,
}: {
  date: string;
  isToday: boolean;
  canGoForward: boolean;
  goalWord: string | null;
  streak: TodayResponse['streak'] | null;
  inboxUnread: number;
  person: { name: string; initials: string; avatarUrl: string | null };
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onStreak: () => void;
  onInbox: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <IconButton label="Previous day" tone="ghost" size={44} onClick={onPrev} className="-ml-3">
          <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.75} />
        </IconButton>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={date}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            aria-live="polite"
            className="min-w-0 truncate text-[12px] font-bold uppercase tracking-[0.1em] text-accent-700"
          >
            {shortDay(date)}
            {goalWord ? ` · ${goalWord}` : ''}
          </motion.span>
        </AnimatePresence>
        <IconButton label="Next day" tone="ghost" size={44} onClick={onNext} disabled={!canGoForward}>
          <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.75} />
        </IconButton>
        <span className="flex-1" />
        <IconButton label={inboxUnread ? `Inbox, ${inboxUnread} unread` : 'Inbox'} onClick={onInbox} badge={inboxUnread}>
          <Bell className="h-[17px] w-[17px]" strokeWidth={2.75} />
        </IconButton>
        <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={onSettings} aria-label="Settings and profile" className="ml-2 rounded-full">
          <Avatar name={person.name} initials={person.initials} url={person.avatarUrl} size={44} />
        </motion.button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {streak && <StreakPill streak={streak} onClick={onStreak} />}
        <AnimatePresence>
          {!isToday && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={onToday}
              className="min-h-10 rounded-full bg-text px-3.5 text-[13px] font-bold text-bg"
            >
              Back to today
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
