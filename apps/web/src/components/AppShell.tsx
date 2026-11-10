// Student app shell (Figma 39:899): header with logo, main nav and the signed-in person; a bottom
// tab bar under 768 px. Navigation depends on the role. No theme controls (ADR-0010).
import type { Me } from '@lf/contracts';
import { Avatar, IconButton, Logo, NavTab, NavTabContent, TabBarItem } from '@lf/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  Bell,
  ClipboardList,
  House,
  LayoutGrid,
  ListChecks,
  LogOut,
  Palette,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useAlerts, useTenant } from '../api/hooks';
import { authClient } from '../lib/auth-client';

type NavItem = { to: string; label: string; icon: LucideIcon };

export function navFor(role: Me['role']): NavItem[] {
  switch (role) {
    case 'student':
      return [
        { to: '/home', label: 'Home', icon: House },
        { to: '/gallery', label: 'Gallery', icon: LayoutGrid },
        { to: '/activity', label: 'My activity', icon: ListChecks },
        { to: '/alerts', label: 'Alerts', icon: Bell },
      ];
    case 'visitor':
      // Visitors can't browse the gallery (SRS roles, plan §9.7).
      return [
        { to: '/home', label: 'Home', icon: House },
        { to: '/activity', label: 'My activity', icon: ListChecks },
        { to: '/alerts', label: 'Alerts', icon: Bell },
      ];
    case 'desk_officer':
      return [{ to: '/desk', label: 'Desk', icon: ClipboardList }];
    case 'supervisor':
      return [
        { to: '/supervisor', label: 'Overview', icon: ShieldCheck },
        { to: '/desk', label: 'Desk', icon: ClipboardList },
      ];
    case 'it_admin':
      return [{ to: '/admin', label: 'Appearance', icon: Palette }];
  }
}

export function AppShell({ me }: { me: Me }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tenant = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const items = navFor(me.role);
  const hasAlerts = items.some((i) => i.to === '/alerts');
  const alerts = useAlerts(hasAlerts);
  const unread = alerts.data?.unread ?? 0;
  const active = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: '/sign-in', search: { tab: 'student' } });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas pb-20 md:pb-10">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3"
      >
        Skip to content
      </a>
      {tenant.data?.tenant.isPractice ? (
        <div
          role="status"
          className="bg-warning-soft px-4 py-2 text-center text-body font-semibold text-warning"
        >
          Practice mode: sample records only. Nothing you do here affects real items.
        </div>
      ) : null}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-[8px]">
        <div className="mx-auto flex h-16 max-w-[1152px] items-center gap-6 px-4 md:px-6">
          <Link to="/" className="shrink-0 rounded-md">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden flex-1 gap-1 pl-4 md:flex">
            {items.map((item) => (
              <NavTab key={item.to} active={active(item.to)}>
                <Link to={item.to}>
                  <NavTabContent
                    icon={item.icon}
                    label={item.label}
                    count={item.to === '/alerts' ? unread : undefined}
                  />
                </Link>
              </NavTab>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-label font-semibold text-ink">{me.name}</p>
              {me.title ? <p className="text-label text-muted">{me.title}</p> : null}
            </div>
            <Avatar name={me.name} size="m" />
            <IconButton icon={LogOut} label="Sign out" onClick={() => void signOut()} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1152px] flex-1 px-4 pt-8 md:px-6 md:pt-10">
        <Outlet />
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-canvas/95 backdrop-blur-[8px] md:hidden"
      >
        {items.map((item) => (
          <TabBarItem key={item.to} active={active(item.to)}>
            <Link to={item.to}>
              <item.icon size={24} aria-hidden="true" />
              {item.label}
            </Link>
          </TabBarItem>
        ))}
      </nav>
    </div>
  );
}
