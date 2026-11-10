// Routes (TanStack Router, code-based). Signed-in pages sit under the "app" layout, which loads the
// person once and guards by role. Heavy or rare pages are code-split (plan §8).
import type { Me } from '@lf/contracts';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { meQuery, useTenant } from './api/hooks';
import { AppShell } from './components/AppShell';
import { applyAppearance } from './lib/theme';
import { SignInPage } from './routes/auth/SignInPage';
import { ActivityPage } from './routes/student/ActivityPage';
import { AlertsPage } from './routes/student/AlertsPage';
import { GalleryPage } from './routes/student/GalleryPage';
import { DeskHome } from './features/desk/DeskHome';
import { HomePage } from './routes/student/HomePage';
import { StaffHome } from './routes/staff/StaffHome';

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
  interface StaticDataRouteOption {
    title?: string;
  }
}

/** Where each role lands after signing in. */
export function landingFor(role: Me['role']): '/home' | '/desk' | '/supervisor' | '/admin' {
  switch (role) {
    case 'student':
    case 'visitor':
      return '/home';
    case 'desk_officer':
      return '/desk';
    case 'supervisor':
      return '/supervisor';
    case 'it_admin':
      return '/admin';
  }
}

function RootLayout() {
  const tenant = useTenant();
  const title = useRouterState({ select: (s) => s.matches.at(-1)?.staticData.title });
  useEffect(() => {
    if (tenant.data) applyAppearance(tenant.data.appearance);
  }, [tenant.data]);
  useEffect(() => {
    document.title = title ? `${title} · NSU Lost & Found` : 'NSU Lost & Found';
  }, [title]);
  return <Outlet />;
}

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQuery);
    throw redirect({ to: me ? landingFor(me.role) : '/sign-in' });
  },
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  staticData: { title: 'Sign in' },
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab: 'student' | 'visitor'; error?: string } => ({
    tab: search['tab'] === 'visitor' ? 'visitor' : 'student',
    ...(typeof search['error'] === 'string' ? { error: search['error'] } : {}),
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQuery);
    if (me) throw redirect({ to: landingFor(me.role) });
  },
  component: SignInPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/sign-in', search: { tab: 'student' } });
    return { me };
  },
  component: function AppLayout() {
    const { me } = appRoute.useRouteContext();
    return <AppShell me={me} />;
  },
});

/** Role guard for routes under the app layout. */
const only =
  (...roles: Me['role'][]) =>
  ({ context }: { context: { me: Me } }) => {
    if (!roles.includes(context.me.role)) throw redirect({ to: landingFor(context.me.role) });
  };

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/home',
  staticData: { title: 'Home' },
  beforeLoad: only('student', 'visitor'),
  component: function Home() {
    const { me } = appRoute.useRouteContext();
    return <HomePage me={me} />;
  },
});

const activityRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/activity',
  staticData: { title: 'My activity' },
  beforeLoad: only('student', 'visitor'),
  component: function Activity() {
    const { me } = appRoute.useRouteContext();
    return <ActivityPage me={me} />;
  },
});
const galleryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/gallery',
  staticData: { title: 'Gallery' },
  beforeLoad: only('student', 'desk_officer', 'supervisor', 'it_admin'),
  component: GalleryPage,
});
const alertsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/alerts',
  staticData: { title: 'Alerts' },
  beforeLoad: only('student', 'visitor'),
  component: function Alerts() {
    const { me } = appRoute.useRouteContext();
    return <AlertsPage emailed={me.role !== 'visitor'} />;
  },
});

const foundNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/found/new',
  staticData: { title: 'I found something' },
  beforeLoad: only('student', 'desk_officer', 'supervisor'),
  component: lazyRouteComponent(() => import('./features/found-report/FoundReportForm')),
});

const foundPostedRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/found/$id/posted',
  staticData: { title: 'Found item posted' },
  component: lazyRouteComponent(() => import('./features/found-report/PostedPage'), 'PostedPage'),
});

/** Where a label's QR points: desk staff get the record, the finder gets their post. */
const scanRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/i/$id',
  beforeLoad: ({ context, params }) => {
    const desk = context.me.role === 'desk_officer' || context.me.role === 'supervisor';
    throw redirect(
      desk
        ? { to: '/desk/items/$id', params: { id: params.id } }
        : { to: '/found/$id/posted', params: { id: params.id } },
    );
  },
});

const lostNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/lost/new',
  staticData: { title: 'I lost something' },
  beforeLoad: only('student', 'visitor', 'desk_officer', 'supervisor'),
  validateSearch: (search: Record<string, unknown>): { step: number } => {
    const step = Number(search['step']);
    return { step: Number.isInteger(step) && step >= 1 && step <= 4 ? step : 1 };
  },
  component: lazyRouteComponent(() => import('./features/lost-report/LostReportFlow')),
});

const submittedRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/lost/$id/submitted',
  staticData: { title: 'Lost report submitted' },
  component: lazyRouteComponent(
    () => import('./features/lost-report/SubmittedPage'),
    'SubmittedPage',
  ),
});

const reportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/lost/$id',
  staticData: { title: 'My lost report' },
  component: lazyRouteComponent(() => import('./features/lost-report/ReportPage'), 'ReportPage'),
});

const deskRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desk',
  staticData: { title: 'Desk' },
  beforeLoad: only('desk_officer', 'supervisor'),
  component: function Desk() {
    const { me } = appRoute.useRouteContext();
    return <DeskHome me={me} />;
  },
});

const deskOnly = only('desk_officer', 'supervisor');

const deskMoreRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desk/more',
  staticData: { title: 'More' },
  beforeLoad: deskOnly,
  component: lazyRouteComponent(() => import('./features/desk/MorePage'), 'MorePage'),
});

const deskFindRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desk/find',
  staticData: { title: 'Find an item' },
  beforeLoad: deskOnly,
  component: lazyRouteComponent(() => import('./features/desk/FindItemPage'), 'FindItemPage'),
});

const deskLogRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desk/log',
  staticData: { title: 'Log a found item' },
  beforeLoad: deskOnly,
  validateSearch: (search: Record<string, unknown>): { step: number; receive?: string } => {
    const step = Number(search['step']);
    return {
      step: Number.isInteger(step) && step >= 1 && step <= 4 ? step : 1,
      ...(typeof search['receive'] === 'string' && search['receive']
        ? { receive: search['receive'] }
        : {}),
    };
  },
  component: lazyRouteComponent(() => import('./features/desk/LogFoundItemFlow')),
});

const deskItemRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desk/items/$id',
  staticData: { title: 'Found item' },
  beforeLoad: deskOnly,
  component: lazyRouteComponent(() => import('./features/desk/ItemRecordPage'), 'ItemRecordPage'),
});

const deskLabelRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desk/items/$id/label',
  staticData: { title: 'Label' },
  beforeLoad: deskOnly,
  validateSearch: (search: Record<string, unknown>): { saved: boolean } => ({
    saved: search['saved'] === true || search['saved'] === 'true',
  }),
  component: lazyRouteComponent(() => import('./features/desk/LabelPage'), 'LabelPage'),
});

const supervisorRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/supervisor',
  staticData: { title: 'Overview' },
  beforeLoad: only('supervisor'),
  component: function Supervisor() {
    const { me } = appRoute.useRouteContext();
    return <StaffHome me={me} title="Supervisor overview" />;
  },
});

const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin',
  staticData: { title: 'Appearance' },
  beforeLoad: only('it_admin'),
  component: lazyRouteComponent(() => import('./routes/admin/AppearancePage')),
});

const devRoutes = __PROTOTYPE__
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/components',
        staticData: { title: 'Components' },
        component: lazyRouteComponent(() => import('./routes/dev'), 'ComponentsPage'),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/sms',
        staticData: { title: 'Dev SMS' },
        component: lazyRouteComponent(() => import('./routes/dev'), 'DevSmsPage'),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/tools',
        staticData: { title: 'Dev tools' },
        component: lazyRouteComponent(() => import('./routes/dev'), 'DevToolsPage'),
      }),
    ]
  : [];

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  appRoute.addChildren([
    homeRoute,
    activityRoute,
    galleryRoute,
    alertsRoute,
    lostNewRoute,
    submittedRoute,
    reportRoute,
    foundNewRoute,
    foundPostedRoute,
    scanRoute,
    deskRoute,
    deskMoreRoute,
    deskFindRoute,
    deskLogRoute,
    deskItemRoute,
    deskLabelRoute,
    supervisorRoute,
    adminRoute,
  ]),
  ...devRoutes,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}

type AppRouter = ReturnType<typeof createAppRouter>;
