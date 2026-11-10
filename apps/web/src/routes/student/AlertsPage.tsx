// Alerts (FR-09, Figma 39:2896): in-app copies of what we email. Opening the page marks them read.
import { buttonClasses, Card, Notice } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { Mail, Smartphone } from 'lucide-react';
import { useEffect } from 'react';
import { useAlerts, useMarkAlertsRead } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { timeAgo } from '../../lib/clock';

export function AlertsPage({ emailed }: { emailed: boolean }) {
  const alerts = useAlerts();
  const markRead = useMarkAlertsRead();
  const unread = alerts.data?.unread ?? 0;
  useEffect(() => {
    if (unread > 0 && !markRead.isPending) markRead.mutate(undefined);
  }, [unread, markRead]);

  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader title="Alerts" />
      <p className="pt-2 text-body text-muted">
        {emailed
          ? 'Sent here and by email to your university address.'
          : 'Shown here. Visitors are not emailed; check back after visiting the desk.'}
      </p>
      {alerts.isError ? <Notice tone="danger">{alerts.error.message}</Notice> : null}
      <ul className="mt-6 flex flex-col gap-3">
        {alerts.data?.alerts.length === 0 ? (
          <li>
            <Card>
              <p className="text-body text-muted">
                No alerts yet. We’ll tell you here when something changes.
              </p>
            </Card>
          </li>
        ) : null}
        {alerts.data?.alerts.map((a) => (
          <li key={a.id}>
            <Card className="flex items-start gap-4 !p-5">
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-ink">
                  {a.readAt ? null : <span className="sr-only">New: </span>}
                  {a.title}
                </p>
                <p className="pt-1 text-body text-muted">{a.body}</p>
                <p className="flex flex-wrap items-center gap-3 pt-2 text-body text-muted">
                  <span>{timeAgo(a.createdAt)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Smartphone size={16} aria-hidden="true" /> In-app
                  </span>
                  {emailed ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail size={16} aria-hidden="true" /> Email
                    </span>
                  ) : null}
                </p>
              </div>
              {a.link ? (
                <Link to={a.link} className={buttonClasses('secondary', 'md', 'shrink-0')}>
                  Open
                </Link>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
