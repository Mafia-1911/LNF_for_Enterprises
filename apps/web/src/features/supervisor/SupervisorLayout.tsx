// Supervisor shell (Figma 39:20616): a left sidebar on wide screens (Supervise, Desk, Manage), a
// scrolling row of links on phones. Pages render in the outlet.
import { Badge, cx } from '@lf/ui';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  Archive,
  ClipboardList,
  Flag,
  Gavel,
  LayoutDashboard,
  NotebookTabs,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useSupervisorOverview } from '../../api/hooks';

type Item = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: 'retention' | 'approvals' | 'disputes' | 'flags';
};
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Supervise',
    items: [
      { to: '/supervisor', label: 'Overview', icon: LayoutDashboard },
      { to: '/supervisor/approvals', label: 'Approvals', icon: ShieldCheck, badge: 'approvals' },
      { to: '/supervisor/retention', label: 'Retention', icon: Archive, badge: 'retention' },
      { to: '/supervisor/dispatch', label: 'Dispatch directory', icon: NotebookTabs },
      { to: '/supervisor/disputes', label: 'Disputes', icon: Gavel, badge: 'disputes' },
      { to: '/supervisor/flags', label: 'Flags', icon: Flag, badge: 'flags' },
    ],
  },
  { title: 'Desk', items: [{ to: '/desk', label: 'Desk actions', icon: ClipboardList }] },
  {
    title: 'Manage',
    items: [
      { to: '/supervisor/policies', label: 'Policies', icon: Settings },
      { to: '/supervisor/staff', label: 'Staff', icon: Users },
    ],
  },
];

export function SupervisorLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const overview = useSupervisorOverview();
  const badges = overview.data?.badges;
  const active = (to: string) =>
    to === '/supervisor' ? pathname === to || pathname === `${to}/` : pathname.startsWith(to);
  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      <nav aria-label="Supervisor" className="mb-6 print:hidden lg:mb-0">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
          {SECTIONS.map((section) => (
            <li key={section.title} className="contents lg:block">
              <p className="hidden px-3 pt-4 pb-1 text-body font-semibold text-muted lg:block">
                {section.title}
              </p>
              <ul className="contents lg:flex lg:flex-col lg:gap-1">
                {section.items.map((item) => {
                  const count = item.badge ? (badges?.[item.badge] ?? 0) : 0;
                  return (
                    <li key={item.to} className="shrink-0">
                      <Link
                        to={item.to}
                        aria-current={active(item.to) ? 'page' : undefined}
                        className={cx(
                          'flex min-h-11 items-center gap-3 rounded-md px-3 text-body font-semibold whitespace-nowrap',
                          active(item.to)
                            ? 'bg-primary text-on-primary'
                            : 'border border-line bg-surface text-ink hover:bg-subtle lg:border-0 lg:bg-transparent',
                        )}
                      >
                        <item.icon size={20} aria-hidden="true" />
                        <span className="flex-1">{item.label}</span>
                        {count > 0 ? <Badge tone="warning">{count}</Badge> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
