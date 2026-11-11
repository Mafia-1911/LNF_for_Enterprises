// Supervisor overview (Figma 39:20616): four numbers, what needs a decision, latest activity, and
// the desk's Today list.
import { Badge, Card, Notice } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { Activity, ChevronRight, Gavel } from 'lucide-react';
import { useSupervisorOverview } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { timeAgo } from '../../lib/clock';
import { TodayPanel } from '../desk/TodayPanel';

export function OverviewPage() {
  const overview = useSupervisorOverview();
  const data = overview.data;
  const tiles = data
    ? [
        { label: 'In custody', value: data.counts.inCustody },
        { label: 'Claims to review', value: data.counts.claimsToReview },
        { label: 'Returned (30 days)', value: data.counts.returned30Days },
        { label: 'Expiring this week', value: data.counts.expiringThisWeek },
      ]
    : [];
  return (
    <div>
      <PageHeader title="Overview" />
      {overview.isError ? (
        <Notice tone="danger" className="mt-6">
          {overview.error.message}
        </Notice>
      ) : null}
      <dl className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="!p-5">
            <dt className="text-body text-muted">{t.label}</dt>
            <dd className="pt-1 font-display text-display-m font-semibold text-ink">{t.value}</dd>
          </Card>
        ))}
      </dl>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="flex flex-col gap-6">
          <Card className="!p-5">
            <h2 className="flex items-center gap-2 pb-3 text-heading-s font-bold text-ink">
              <Gavel size={22} aria-hidden="true" className="text-primary" /> Needs your decision
            </h2>
            {data && data.needsDecision.length === 0 ? (
              <p className="text-body text-muted">Nothing is waiting for you.</p>
            ) : (
              <ul>
                {data?.needsDecision.map((d) => (
                  <li key={`${d.kind}-${d.link}`}>
                    <Link
                      to={d.link}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-subtle"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-semibold text-ink">{d.title}</span>
                        <span className="block text-body text-muted">{d.detail}</span>
                      </span>
                      {d.at ? (
                        <Badge tone={d.kind === 'claim_overdue' ? 'danger' : 'warning'}>
                          {timeAgo(d.at)}
                        </Badge>
                      ) : null}
                      <ChevronRight size={18} aria-hidden="true" className="text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="!p-5">
            <h2 className="flex items-center gap-2 pb-3 text-heading-s font-bold text-ink">
              <Activity size={22} aria-hidden="true" className="text-primary" /> Latest activity
            </h2>
            {data && data.activity.length === 0 ? (
              <p className="text-body text-muted">No activity yet.</p>
            ) : (
              <ol>
                {data?.activity.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-line py-2 first:border-t-0"
                  >
                    <span className="text-body text-ink">
                      <span className="font-semibold">{a.label}</span>{' '}
                      <span className="font-mono text-muted">{a.recordId}</span>
                    </span>
                    <span className="text-body text-muted">
                      {a.actor} · {timeAgo(a.at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
        <TodayPanel
          today={data?.today}
          error={overview.isError ? overview.error.message : undefined}
        />
      </div>
    </div>
  );
}
