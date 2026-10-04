import { Link, useRouter } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import type { MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import { useUi, type TabKey } from './uiStore';

type Tab = { key: TabKey; to: '/' | '/diet' | '/progress' | '/team'; label: string };
const LEFT: Tab[] = [
  { key: 'today', to: '/', label: 'Today' },
  { key: 'diet', to: '/diet', label: 'Diet' },
];
const RIGHT: Tab[] = [
  { key: 'progress', to: '/progress', label: 'Progress' },
  { key: 'team', to: '/team', label: 'Team' },
];

function TabLink({ t, active, badge, onClick }: { t: Tab; active: boolean; badge?: number; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const label = badge ? `${t.label}, ${badge} unread message${badge === 1 ? '' : 's'}` : t.label;
  return (
    <Link
      to={t.to}
      search={{}}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn('relative flex min-h-12 min-w-[64px] flex-col items-center gap-[3px] pt-0.5 text-[13px] font-bold no-underline transition-colors', active ? 'text-accent-700' : 'text-neutral-700')}
    >
      <span className="relative h-1.5 w-[26px]">{active && <motion.span layoutId="tab-indicator" className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 520, damping: 34 }} />}</span>
      <span aria-hidden>{t.label}</span>
      {!!badge && (
        <span aria-hidden className="absolute -top-0.5 right-1 grid h-[22px] min-w-[22px] place-items-center rounded-full border-2 border-bg bg-accent-2 px-1.5 text-[11px] font-extrabold text-on-accent2-fill">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

/**
 * Design tab bar: Today · Diet · [+] · Progress · Team, 88 px incl. the home-indicator inset. Team carries the chat
 * unread count: switching to Team with unread messages opens the chat over it (back lands on the board), and tapping
 * the tab you're on scrolls it to the top.
 */
export function TabBar({ active, chatUnread }: { active: TabKey | null; chatUnread: number }) {
  const router = useRouter();
  const openLogSheet = useUi((s) => s.openLogSheet);
  const reselectTab = useUi((s) => s.reselectTab);
  const onTab = (t: Tab) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (active === t.key) {
      e.preventDefault();
      reselectTab(t.key);
      return;
    }
    if (t.key === 'team' && chatUnread > 0) {
      e.preventDefault();
      // Two history entries, so back from the chat lands on the board.
      void router.navigate({ to: '/team' }).then(() => router.navigate({ to: '/chat', search: {} }));
    }
  };
  return (
    <nav aria-label="Main" className="absolute inset-x-0 bottom-0 z-20 flex items-start justify-around bg-bg px-2 pt-2.5 shadow-[0_-1px_0_color-mix(in_srgb,var(--color-text)_10%,transparent)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 14px)' }}>
      {LEFT.map((t) => (
        <TabLink key={t.key} t={t} active={active === t.key} onClick={onTab(t)} />
      ))}
      <motion.button
        type="button"
        onClick={openLogSheet}
        aria-label="Log something"
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.04 }}
        className="-mt-[22px] grid h-[60px] w-[60px] place-items-center rounded-full border-[5px] border-bg bg-accent text-on-accent-fill shadow-md"
      >
        <Plus className="h-6 w-6" strokeWidth={3} />
      </motion.button>
      {RIGHT.map((t) => (
        <TabLink key={t.key} t={t} active={active === t.key} badge={t.key === 'team' ? chatUnread : undefined} onClick={onTab(t)} />
      ))}
    </nav>
  );
}
