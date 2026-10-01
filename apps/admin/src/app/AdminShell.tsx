import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { adminApi, api, ApiError, configure } from '@clubhouse/client';
import { Drawer, useMediaQuery } from '@clubhouse/ui';
import { cn } from '@/lib/cn';
import { ErrorState } from '@/ui';
import { useMeAdmin } from '@/features/me';
import { queryClient } from './queryClient';
import { ReauthDialog } from './ReauthDialog';
import { useReauth } from './reauth';

export const NAV: { label: string; items: { to: string; label: string; superOnly?: boolean; tag?: 'ai' }[] }[] = [
  { label: 'Team', items: [
    { to: '/', label: 'Overview' },
    { to: '/members', label: 'Members' },
    { to: '/goals', label: 'Goals & targets' },
    { to: '/diets', label: 'Diet plans' },
    { to: '/foods', label: 'Food database' },
    { to: '/plans', label: 'Activity plans' },
  ] },
  { label: 'Community', items: [
    { to: '/chat', label: 'Chat moderation' },
    { to: '/memes', label: 'Memes & triggers' },
  ] },
  { label: 'System', items: [
    { to: '/ai', label: 'AI control centre', tag: 'ai' },
    { to: '/notifications', label: 'Notifications' },
    { to: '/settings', label: 'Team settings' },
    { to: '/retention', label: 'Retention & data', superOnly: true },
    { to: '/audit', label: 'Audit log' },
    { to: '/sessions', label: 'Admin sessions' },
    { to: '/jobs', label: 'Jobs & health' },
  ] },
];

configure({
  baseUrl: '/api',
  onUnauthorized: (err) => {
    if (err.code === 'admin_reauth_required') useReauth.getState().show();
  },
});

export { useMeAdmin };

/** Admin gate (ADM-ACC-01) + layout (ADM-ACC-02): left navigation on desktop, a drawer below 1024 px. */
export function AdminShell() {
  const me = useMeAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const wide = useMediaQuery('(min-width: 1024px)');
  const [navOpen, setNavOpen] = useState(false);
  const ai = useQuery({ queryKey: ['admin', 'ai-mini'], queryFn: () => adminApi.ai.overview(), enabled: me.data?.user.role !== 'member' && !!me.data, staleTime: 60_000 });

  useEffect(() => {
    const e = me.error;
    if (e instanceof ApiError) {
      if (e.status === 401 && e.code === 'mfa_required') void navigate({ to: '/verify' });
      else if (e.status === 401) void navigate({ to: '/login' });
      else if (e.code === 'password_change_required') void navigate({ to: '/change-password' });
    }
    if (me.data) {
      if (me.data.mfaPending) void navigate({ to: '/verify' });
      else if (me.data.user.mustChangePassword) void navigate({ to: '/change-password' });
      else if (me.data.user.role === 'member') void navigate({ to: '/forbidden' });
    }
  }, [me.data, me.error, navigate]);

  // Close the nav drawer on navigation (adjust state during render on path change).
  const [navPath, setNavPath] = useState(location.pathname);
  if (navPath !== location.pathname) {
    setNavPath(location.pathname);
    setNavOpen(false);
  }
  useEffect(() => {
    const p = location.pathname.replace(/^\/admin/, '') || '/';
    const item = NAV.flatMap((g) => g.items).find((i) => (i.to === '/' ? p === '/' : p === i.to || p.startsWith(`${i.to}/`)));
    document.title = item ? `${item.label} · Clubhouse Admin` : 'Clubhouse Admin';
  }, [location.pathname]);

  if (!me.data || me.data.user.role === 'member' || me.data.mfaPending || me.data.user.mustChangePassword) {
    const hardError = me.error && !(me.error instanceof ApiError && (me.error.status === 401 || me.error.code === 'password_change_required'));
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        {hardError ? (
          <div className="w-full max-w-[440px] rounded-[16px] border border-border bg-card">
            <ErrorState error={me.error} onRetry={() => void me.refetch()} />
          </div>
        ) : (
          <div role="status" aria-label="Loading" className="flex flex-col items-center gap-3">
            <div className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-ink font-display text-[15px] font-extrabold text-white">C</div>
            <div className="skeleton h-2 w-28" />
          </div>
        )}
      </div>
    );
  }
  const user = me.data.user;
  const sidebar = (
    <Sidebar
      userName={user.displayName}
      role={user.role}
      aiOn={ai.data?.globalOn ?? me.data.ai.teamOn}
      onSignOut={async () => {
        await api.auth.logout().catch(() => undefined);
        queryClient.clear();
        void navigate({ to: '/login' });
      }}
    />
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      {wide ? (
        <aside className="sticky top-0 h-dvh overflow-auto border-r border-border bg-card">{sidebar}</aside>
      ) : (
        <>
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
            <button type="button" aria-label="Open navigation" onClick={() => setNavOpen(true)} className="grid h-10 w-10 place-items-center rounded-full border border-border bg-white">
              <Menu className="h-5 w-5" />
            </button>
            <Brand />
          </header>
          <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="Navigation" side="left" width="min(280px, 86vw)" className="bg-card shadow-2xl" backdropClassName="bg-[rgba(23,23,28,0.18)]">
            {sidebar}
          </Drawer>
        </>
      )}
      <main className="flex min-w-0 flex-col gap-8 px-4 pb-20 pt-6 sm:px-6 lg:px-10 lg:pt-8">
        <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }} className="flex min-w-0 flex-col gap-5">
          <Outlet />
        </motion.div>
      </main>
      <ReauthDialog />
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      <div className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-ink font-display text-[15px] font-extrabold text-white">C</div>
      <div className="flex flex-col leading-tight">
        <span className="font-display text-[16px] font-extrabold tracking-[-0.03em]">Clubhouse</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Admin</span>
      </div>
    </div>
  );
}

function Sidebar({ userName, role, aiOn, onSignOut }: { userName: string; role: string; aiOn: boolean; onSignOut: () => void }) {
  const location = useLocation();
  const initials = userName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const isActive = (to: string) => (to === '/' ? location.pathname === '/' || location.pathname === '' : location.pathname === to || location.pathname.startsWith(`${to}/`));
  return (
    <nav aria-label="Admin" className="flex min-h-full flex-col gap-[18px] px-3.5 py-5">
      <Brand />
      {NAV.map((g) => (
        <div key={g.label} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{g.label}</div>
          {g.items
            .filter((i) => !i.superOnly || role === 'super_admin')
            .map((i) => {
              const on = isActive(i.to);
              return (
                <Link key={i.to} to={i.to} aria-current={on ? 'page' : undefined} className={cn('relative flex items-center justify-between rounded-[10px] px-2.5 py-2 text-[14px] font-medium transition-colors', on ? 'text-accent-dark' : 'text-ink hover:bg-bg')}>
                  {on && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[10px] bg-accent-tint" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <span className="relative">{i.label}</span>
                  {i.tag === 'ai' && <span className="relative font-mono text-[10px] text-accent">{aiOn ? 'ON' : 'OFF'}</span>}
                </Link>
              );
            })}
        </div>
      ))}
      <div className="mt-auto flex items-center gap-2.5 border-t border-border px-2 pt-3.5">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-accent-tint text-[13px] font-semibold text-accent-dark">{initials}</div>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] font-semibold">{userName}</span>
          <span className="text-[12px] text-muted">{role === 'super_admin' ? 'Super Admin' : 'Admin'}</span>
        </div>
        <button type="button" onClick={onSignOut} className="text-[12px] font-medium text-accent hover:text-accent-dark">
          Sign out
        </button>
      </div>
    </nav>
  );
}
