import { AtSign, Bell, CalendarCheck, ClipboardList, Dumbbell, Flame, Info, Laugh, ListChecks, Medal, Megaphone, MessageCircle, Scale, Trophy, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import type { NotificationDto, NotificationType } from '@clubhouse/contracts';
import { relativeTime } from '@/features/format';
import { cn } from '@/lib/cn';

const ICONS: Record<NotificationType, LucideIcon> = {
  breakfast_reminder: UtensilsCrossed,
  morning_snack_reminder: UtensilsCrossed,
  lunch_reminder: UtensilsCrossed,
  evening_snack_reminder: UtensilsCrossed,
  dinner_reminder: UtensilsCrossed,
  activity_reminder: Dumbbell,
  momentum_at_risk: Flame,
  weekly_recap: CalendarCheck,
  chat_mention: AtSign,
  chat_digest: MessageCircle,
  meme_fired: Laugh,
  milestone: Trophy,
  plan_updated: ClipboardList,
  announcement: Megaphone,
  weigh_in_reminder: Scale,
  habit_reminder: ListChecks,
  board_results: Medal,
  system: Info,
  ai_budget_alert: Info,
};

export function InboxRow({ n, onOpen }: { n: NotificationDto; onOpen: () => void }) {
  const unread = !n.readAt;
  const Icon = ICONS[n.type as NotificationType] ?? Bell;
  return (
    <motion.button
      type="button"
      layout
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      aria-label={`${unread ? 'Unread: ' : ''}${n.title}. ${n.body}. ${relativeTime(n.createdAt)}`}
      className="flex min-h-16 w-full items-start gap-3 border-0 bg-transparent px-4 py-3 text-left active:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]"
    >
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', unread ? 'bg-accent text-on-accent-fill' : 'bg-neutral-100 text-neutral-700')}>
        <Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 text-[15px]', unread ? 'font-extrabold' : 'font-semibold')}>{n.title}</span>
          <span className="shrink-0 text-[11px] text-neutral-700">{relativeTime(n.createdAt)}</span>
        </span>
        <span className="line-clamp-2 text-[13px] text-neutral-700">{n.body}</span>
      </span>
      {unread && <span aria-hidden className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-2" />}
    </motion.button>
  );
}
