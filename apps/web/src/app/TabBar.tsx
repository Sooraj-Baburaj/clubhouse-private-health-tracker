import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useUi, type TabKey } from './uiStore';

const LEFT: { key: TabKey; to: '/' | '/diet'; label: string }[] = [
  { key: 'today', to: '/', label: 'Today' },
  { key: 'diet', to: '/diet', label: 'Diet' },
];
const RIGHT: { key: TabKey; to: '/progress' | '/chat'; label: string }[] = [
  { key: 'progress', to: '/progress', label: 'Progress' },
  { key: 'chat', to: '/chat', label: 'Chat' },
];

function TabLink({ t, active, badge }: { t: { key: TabKey; to: string; label: string }; active: boolean; badge?: number }) {
  return (
    <Link to={t.to} search={{}} aria-current={active ? 'page' : undefined} className={cn('relative flex min-h-12 min-w-[64px] flex-col items-center gap-[3px] pt-0.5 text-[13px] font-bold no-underline transition-colors', active ? 'text-accent-700' : 'text-neutral-700')}>
      <span className="relative h-1.5 w-[26px]">{active && <motion.span layoutId="tab-indicator" className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 520, damping: 34 }} />}</span>
      <span>{t.label}</span>
      {!!badge && (
        <span aria-label={`${badge} unread`} className="absolute -top-0.5 right-2 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-2 px-1 text-[10px] font-extrabold text-on-accent2-fill ring-2 ring-bg">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

/** Design tab bar: Today · Diet · [+] · Progress · Chat, 88 px incl. the home-indicator inset. */
export function TabBar({ active, chatUnread }: { active: TabKey | null; chatUnread: number }) {
  const openLogSheet = useUi((s) => s.openLogSheet);
  return (
    <nav aria-label="Main" className="absolute inset-x-0 bottom-0 z-20 flex items-start justify-around bg-bg px-2 pt-2.5 shadow-[0_-1px_0_color-mix(in_srgb,var(--color-text)_10%,transparent)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 14px)' }}>
      {LEFT.map((t) => (
        <TabLink key={t.key} t={t} active={active === t.key} />
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
        <TabLink key={t.key} t={t} active={active === t.key} badge={t.key === 'chat' ? chatUnread : undefined} />
      ))}
    </nav>
  );
}
