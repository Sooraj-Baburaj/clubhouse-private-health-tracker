import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@clubhouse/client';
import { useDocumentVisible, useInterval, useOnline } from '@clubhouse/ui';
import { live } from '@/infrastructure/realtime';
import { qk } from '@/features/keys';
import { DietPage } from '@/pages/diet/DietPage';
import { LogSheet } from '@/pages/log/LogSheet';
import { WeightSheet } from '@/pages/log/WeightSheet';
import { ProgressPage } from '@/pages/progress/ProgressPage';
import { TeamPage } from '@/pages/team/TeamPage';
import { TodayPage } from '@/pages/today/TodayPage';
import { EdgeSwipe } from '@/ui/molecules/EdgeSwipe';
import { ConnectivityPill } from '@/ui/molecules/StatusPills';
import { SnapPill } from '@/ui/organisms/meal/SnapPill';
import { ChatFab } from '@/ui/organisms/team/ChatFab';
import { useMeData } from '@/features/me';
import { AuthGate } from './AuthGate';
import { ChatLayer } from './ChatLayer';
import { CHAT_PATH, preloadMealFlow, TAB_PATHS } from './routes';
import { TabBar } from './TabBar';
import { useUi, type TabKey } from './uiStore';
import { PaneContext } from './pane';

const TABS: Record<TabKey, () => ReactNode> = { today: TodayPage, diet: DietPage, progress: ProgressPage, team: TeamPage };

export function AppShell() {
  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  );
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const tabFromPath = (TAB_PATHS as Record<string, TabKey>)[location.pathname] ?? null;
  const setTab = useUi((s) => s.setTab);
  const lastTab = useUi((s) => s.lastTab);
  const activeTab = tabFromPath ?? lastTab;
  // The chat is a layer over the tabs, not a stack screen: the tab it was opened from stays underneath.
  const isChat = location.pathname === CHAT_PATH;
  const isStack = tabFromPath === null && !isChat;
  useEffect(() => {
    if (tabFromPath) setTab(tabFromPath);
  }, [tabFromPath, setTab]);

  const unread = useUnreadAndLive(isChat);
  const me = useMeData();
  // Fetch the meal flow's code straight after the first render, so Snap and logging work offline from the start.
  useEffect(() => {
    void preloadMealFlow().catch(() => undefined);
  }, []);
  // Snapping from a past day on Today logs to that day, like the log sheet.
  const search = useSearch({ strict: false });
  const snapDate = location.pathname === '/' && typeof search.date === 'string' ? search.date : undefined;

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[520px] flex-col overflow-hidden bg-bg text-text shadow-lg">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-col items-center gap-1.5 pt-[calc(env(safe-area-inset-top,0px)+8px)]">
        {me.team.maintenanceBanner && (
          <div role="status" className="pointer-events-auto mx-4 rounded-full bg-accent-200 px-4 py-1.5 text-center text-[12px] font-bold text-accent-800">
            {me.team.maintenanceBanner.message}
          </div>
        )}
        <ConnectivityPill />
      </div>
      <TabsHost active={activeTab} hidden={isStack || isChat} />
      <StackHost isStack={isStack} pathKey={location.pathname} />
      <ChatLayer open={isChat} />
      <AnimatePresence>
        {!isStack && !isChat && (
          <motion.div key="tabbar" initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
            <TabBar active={tabFromPath} chatUnread={unread.chat} />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Floating pills above the tab bar, bottom right: Chat on Team, Snap on Today. */}
      <AnimatePresence>
        {tabFromPath === 'team' && <ChatFab key="chat" unread={unread.chat} />}
        {tabFromPath === 'today' && (
          <motion.div key="snap" className="pointer-events-none absolute right-4 z-20" style={{ bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 14px) + 90px)' }} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
            <SnapPill onClick={() => void navigate({ to: '/log/food', search: { view: 'snap', date: snapDate } })} />
          </motion.div>
        )}
      </AnimatePresence>
      <LogSheet />
      <WeightSheet />
    </div>
  );
}

/** Tab panes stay mounted (APP-NAV-07): scroll position and state survive tab switches. */
function TabsHost({ active, hidden }: { active: TabKey; hidden: boolean }) {
  const [mounted, setMounted] = useState<TabKey[]>([active]);
  const dir = useUi((s) => s.tabDir);
  const reduce = useReducedMotion();
  // Mount each tab the first time it becomes active (adjust state during render).
  if (!mounted.includes(active)) setMounted([...mounted, active]);
  return (
    <div className="relative min-h-0 flex-1" aria-hidden={hidden || undefined}>
      {mounted.map((key) => {
        const Comp = TABS[key];
        const on = key === active;
        return (
          <Pane key={key} active={on && !hidden}>
            <motion.div
              key={on ? `${key}-on` : `${key}-off`}
              initial={on && !reduce ? { opacity: 0, x: dir * 24 } : false}
              animate={{ opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] } }}
              className="min-h-full"
            >
              <Comp />
            </motion.div>
          </Pane>
        );
      })}
    </div>
  );
}

function Pane({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <PaneContext.Provider value={ref}>
      <section
        ref={ref}
        inert={!active || undefined}
        className="pane absolute inset-0 overflow-y-auto overflow-x-hidden"
        style={{ visibility: active ? 'visible' : 'hidden', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 104px)' }}
      >
        {children}
      </section>
    </PaneContext.Provider>
  );
}

/** Stack screens slide in over the tabs; swipe from the left edge goes back. */
function StackHost({ isStack, pathKey }: { isStack: boolean; pathKey: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const back = () => (window.history.length > 1 ? router.history.back() : void router.navigate({ to: '/' }));
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 90 || info.velocity.x > 500) back();
  };
  return (
    <AnimatePresence initial={false}>
      {isStack && (
        <motion.div
          key={pathKey.split('/').slice(0, 3).join('/')}
          className="absolute inset-0 z-30 bg-bg"
          initial={reduce ? { opacity: 0 } : { x: '100%' }}
          animate={reduce ? { opacity: 1 } : { x: 0, transition: { type: 'spring', stiffness: 420, damping: 40 } }}
          exit={reduce ? { opacity: 0 } : { x: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
          drag={reduce ? false : 'x'}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.5 }}
          dragListener={false}
          onDragEnd={onDragEnd}
        >
          <PaneContext.Provider value={ref}>
            <div ref={ref} className="pane h-full overflow-y-auto overflow-x-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
              <Outlet />
            </div>
          </PaneContext.Provider>
          <EdgeSwipe onBack={back} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Unread counts plus realtime hints; falls back to polling when the socket is down (SYS-CHAT-04). */
function useUnreadAndLive(onChat: boolean) {
  const qc = useQueryClient();
  const visible = useDocumentVisible();
  const online = useOnline();
  const [connected, setConnected] = useState(live.connected);
  useEffect(() => live.onStatus(setConnected), []);
  const unread = useQuery({ queryKey: qk.unread, queryFn: () => api.chat.unread(), refetchInterval: connected ? 120_000 : 30_000, enabled: online });
  useEffect(
    () =>
      live.on((event) => {
        // The chat feed itself is revalidated by the cache manager (infrastructure/cache), which pushes changes into
        // the feed query; invalidating it here too would queue a second /chat/changes pull per event.
        if (event.startsWith('chat.')) void qc.invalidateQueries({ queryKey: qk.unread });
        if (event === 'inbox.new') {
          void qc.invalidateQueries({ queryKey: qk.inbox });
          void qc.invalidateQueries({ queryKey: qk.unread });
        }
        if (event === 'pulse') {
          // A teammate logged something: their Crew today row and the leaderboard may have moved.
          void qc.invalidateQueries({ queryKey: ['today'] });
          void qc.invalidateQueries({ queryKey: ['team'] });
        }
      }),
    [qc],
  );
  useInterval(() => void qc.invalidateQueries({ queryKey: qk.chat }), !connected && onChat && visible && online ? 5000 : null);
  return { chat: unread.data?.chat ?? 0, inbox: unread.data?.inbox ?? 0 };
}
