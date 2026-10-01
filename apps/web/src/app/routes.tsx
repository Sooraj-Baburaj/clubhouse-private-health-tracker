import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { MealSlot } from '@clubhouse/contracts';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage';
import { VerifyPage } from '@/pages/auth/VerifyPage';
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage';
import { LogFoodPage } from '@/pages/log/LogFoodPage';
import { LogActivityPage } from '@/pages/log/LogActivityPage';
import { MomentumPage } from '@/pages/momentum/MomentumPage';
import { HabitsPage } from '@/pages/habits/HabitsPage';
import { HabitDetailPage } from '@/pages/habits/HabitDetailPage';
import { InboxPage } from '@/pages/inbox/InboxPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { SettingsSectionPage } from '@/pages/settings/SettingsSectionPage';
import { MemberDayPage } from '@/pages/team/MemberDayPage';
import { AppShell } from './AppShell';
import { RootLayout } from './RootLayout';

const Empty = () => null;

const rootRoute = createRootRoute({ component: RootLayout });

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const changePasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: '/change-password', component: ChangePasswordPage });
const verifyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/verify', component: VerifyPage });
const onboardingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/onboarding', validateSearch: z.object({ step: z.coerce.number().int().min(1).max(4).optional() }), component: OnboardingPage });

const shellRoute = createRoute({ getParentRoute: () => rootRoute, id: 'shell', component: AppShell });

export const todaySearch = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const todayRoute = createRoute({ getParentRoute: () => shellRoute, path: '/', validateSearch: todaySearch, component: Empty });
const dietRoute = createRoute({ getParentRoute: () => shellRoute, path: '/diet', validateSearch: z.object({ slot: MealSlot.optional() }), component: Empty });
const progressRoute = createRoute({ getParentRoute: () => shellRoute, path: '/progress', validateSearch: z.object({ section: z.string().optional() }), component: Empty });
const chatRoute = createRoute({ getParentRoute: () => shellRoute, path: '/chat', validateSearch: z.object({ seq: z.coerce.number().optional(), tag: z.string().optional() }), component: Empty });

export const logFoodSearch = z.object({
  slot: MealSlot.optional(),
  mode: z.enum(['camera', 'search']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  shared: z.coerce.number().optional(),
  edit: z.string().uuid().optional(),
  q: z.string().optional(),
});
const logFoodRoute = createRoute({ getParentRoute: () => shellRoute, path: '/log/food', validateSearch: logFoodSearch, component: LogFoodPage });
export const logActivitySearch = z.object({ plan: z.string().uuid().optional(), type: z.string().optional(), date: z.string().optional(), edit: z.string().uuid().optional(), done: z.coerce.number().optional() });
const logActivityRoute = createRoute({ getParentRoute: () => shellRoute, path: '/log/activity', validateSearch: logActivitySearch, component: LogActivityPage });
const logWeightRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/log/weight',
  beforeLoad: () => {
    throw redirect({ to: '/', search: {} });
  },
});
const habitsRoute = createRoute({ getParentRoute: () => shellRoute, path: '/habits', validateSearch: z.object({ day: z.enum(['yesterday']).optional() }), component: HabitsPage });
const habitDetailRoute = createRoute({ getParentRoute: () => shellRoute, path: '/habits/$habitId', component: HabitDetailPage });
const momentumRoute = createRoute({ getParentRoute: () => shellRoute, path: '/momentum', component: MomentumPage });
const inboxRoute = createRoute({ getParentRoute: () => shellRoute, path: '/inbox', component: InboxPage });
const settingsRoute = createRoute({ getParentRoute: () => shellRoute, path: '/settings', component: SettingsPage });
const settingsSectionRoute = createRoute({ getParentRoute: () => shellRoute, path: '/settings/$section', component: SettingsSectionPage });
const memberDayRoute = createRoute({ getParentRoute: () => shellRoute, path: '/team/$memberId', validateSearch: z.object({ date: z.string().optional() }), component: MemberDayPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  changePasswordRoute,
  verifyRoute,
  onboardingRoute,
  shellRoute.addChildren([todayRoute, dietRoute, progressRoute, chatRoute, logFoodRoute, logActivityRoute, logWeightRoute, habitsRoute, habitDetailRoute, momentumRoute, inboxRoute, settingsRoute, settingsSectionRoute, memberDayRoute]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: false });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export const TAB_PATHS = { '/': 'today', '/diet': 'diet', '/progress': 'progress', '/chat': 'chat' } as const;
