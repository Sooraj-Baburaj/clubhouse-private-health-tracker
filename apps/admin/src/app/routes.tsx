import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';
import { AdminShell } from './AdminShell';
import { RootLayout } from './RootLayout';
import { ErrorState, SkeletonCard } from '@/ui';
import { LoginPage } from '@/pages/auth/LoginPage';
import { VerifyPage } from '@/pages/auth/VerifyPage';
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage';
import { ForbiddenPage } from '@/pages/auth/ForbiddenPage';

/** Pages are code-split per route (plan §7). */
const DashboardPage = lazyRouteComponent(() => import('@/pages/dashboard/DashboardPage'), 'DashboardPage');
const MembersPage = lazyRouteComponent(() => import('@/pages/members/MembersPage'), 'MembersPage');
const MemberDetailPage = lazyRouteComponent(() => import('@/pages/members/MemberDetailPage'), 'MemberDetailPage');
const GoalsPage = lazyRouteComponent(() => import('@/pages/goals/GoalsPage'), 'GoalsPage');
const DietsPage = lazyRouteComponent(() => import('@/pages/diets/DietsPage'), 'DietsPage');
const DietBuilderPage = lazyRouteComponent(() => import('@/pages/diets/DietBuilderPage'), 'DietBuilderPage');
const FoodsPage = lazyRouteComponent(() => import('@/pages/foods/FoodsPage'), 'FoodsPage');
const PlansPage = lazyRouteComponent(() => import('@/pages/plans/PlansPage'), 'PlansPage');
const ChatModerationPage = lazyRouteComponent(() => import('@/pages/chat/ChatModerationPage'), 'ChatModerationPage');
const MemesPage = lazyRouteComponent(() => import('@/pages/memes/MemesPage'), 'MemesPage');
const AiPage = lazyRouteComponent(() => import('@/pages/ai/AiPage'), 'AiPage');
const AiCallsPage = lazyRouteComponent(() => import('@/pages/ai/AiCallsPage'), 'AiCallsPage');
const NotificationsPage = lazyRouteComponent(() => import('@/pages/notifications/NotificationsPage'), 'NotificationsPage');
const TeamSettingsPage = lazyRouteComponent(() => import('@/pages/settings/TeamSettingsPage'), 'TeamSettingsPage');
const RetentionPage = lazyRouteComponent(() => import('@/pages/retention/RetentionPage'), 'RetentionPage');
const AuditPage = lazyRouteComponent(() => import('@/pages/audit/AuditPage'), 'AuditPage');
const SessionsPage = lazyRouteComponent(() => import('@/pages/sessions/SessionsPage'), 'SessionsPage');
const JobsPage = lazyRouteComponent(() => import('@/pages/jobs/JobsPage'), 'JobsPage');

const opt = z.string().optional();

const root = createRootRoute({ component: RootLayout });
const login = createRoute({ getParentRoute: () => root, path: '/login', component: LoginPage });
const verify = createRoute({ getParentRoute: () => root, path: '/verify', component: VerifyPage });
const changePassword = createRoute({ getParentRoute: () => root, path: '/change-password', component: ChangePasswordPage });
const forbidden = createRoute({ getParentRoute: () => root, path: '/forbidden', component: ForbiddenPage });
const shell = createRoute({ getParentRoute: () => root, id: 'shell', component: AdminShell });

const dashboard = createRoute({ getParentRoute: () => shell, path: '/', component: DashboardPage });
const members = createRoute({ getParentRoute: () => shell, path: '/members', component: MembersPage, validateSearch: z.object({ q: opt, status: opt, role: opt, new: z.coerce.number().optional(), import: z.coerce.number().optional() }) });
const memberDetail = createRoute({ getParentRoute: () => shell, path: '/members/$id', component: MemberDetailPage, validateSearch: z.object({ tab: opt }) });
const goals = createRoute({ getParentRoute: () => shell, path: '/goals', component: GoalsPage, validateSearch: z.object({ member: opt, tab: opt }) });
const diets = createRoute({ getParentRoute: () => shell, path: '/diets', component: DietsPage, validateSearch: z.object({ q: opt, tab: opt, member: opt }) });
const dietBuilder = createRoute({ getParentRoute: () => shell, path: '/diets/$planId', component: DietBuilderPage, validateSearch: z.object({ option: opt, tab: opt }) });
const foods = createRoute({ getParentRoute: () => shell, path: '/foods', component: FoodsPage, validateSearch: z.object({ q: opt, source: opt, verified: opt }) });
const plans = createRoute({ getParentRoute: () => shell, path: '/plans', component: PlansPage, validateSearch: z.object({ member: opt, tab: opt }) });
const chat = createRoute({ getParentRoute: () => shell, path: '/chat', component: ChatModerationPage, validateSearch: z.object({ tab: opt, q: opt, member: opt }) });
const memes = createRoute({ getParentRoute: () => shell, path: '/memes', component: MemesPage, validateSearch: z.object({ tab: opt, trigger: opt }) });
const ai = createRoute({ getParentRoute: () => shell, path: '/ai', component: AiPage, validateSearch: z.object({ tab: opt }) });
const aiCalls = createRoute({ getParentRoute: () => shell, path: '/ai/calls', component: AiCallsPage, validateSearch: z.object({ userId: opt, feature: opt, outcome: opt, call: opt }) });
const notifications = createRoute({ getParentRoute: () => shell, path: '/notifications', component: NotificationsPage });
const settings = createRoute({ getParentRoute: () => shell, path: '/settings', component: TeamSettingsPage });
const retention = createRoute({ getParentRoute: () => shell, path: '/retention', component: RetentionPage });
const audit = createRoute({ getParentRoute: () => shell, path: '/audit', component: AuditPage, validateSearch: z.object({ memberId: opt, actorId: opt, highImpact: opt, action: opt, targetType: opt }) });
const sessions = createRoute({ getParentRoute: () => shell, path: '/sessions', component: SessionsPage });
const jobs = createRoute({ getParentRoute: () => shell, path: '/jobs', component: JobsPage });

const routeTree = root.addChildren([
  login,
  verify,
  changePassword,
  forbidden,
  shell.addChildren([dashboard, members, memberDetail, goals, diets, dietBuilder, foods, plans, chat, memes, ai, aiCalls, notifications, settings, retention, audit, sessions, jobs]),
]);

function PagePending() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-3 w-32" />
        <div className="skeleton h-9 w-64" />
      </div>
      <SkeletonCard lines={6} />
    </div>
  );
}

function PageError({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <div className="rounded-[16px] border border-border bg-card">
      <ErrorState error={error} onRetry={reset} />
    </div>
  );
}

export const router = createRouter({ routeTree, basepath: '/admin', defaultPreload: 'intent', defaultPendingComponent: PagePending, defaultErrorComponent: PageError });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
