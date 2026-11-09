// My activity: the person's lost reports (more record types arrive with later phases).
import { categoryByCode } from '@lf/domain';
import { buttonClasses, Card, Notice } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { useMyLostReports } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { dhakaDateTime } from '../../features/lost-report/ReportPage';

export function ActivityPage() {
  const reports = useMyLostReports();
  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader title="My activity" />
      {reports.isError ? <Notice tone="danger">{reports.error.message}</Notice> : null}
      <div className="mt-6 flex flex-col gap-3">
        {reports.data?.reports.length === 0 ? (
          <Card>
            <p className="text-body text-ink">You haven’t reported anything yet.</p>
            <Link
              to="/lost/new"
              search={{ step: 1 }}
              className={buttonClasses('primary', 'md', 'mt-4')}
            >
              I lost something
            </Link>
          </Card>
        ) : null}
        {reports.data?.reports.map((r) => (
          <Link
            key={r.id}
            to="/lost/$id"
            params={{ id: r.id }}
            className="rounded-lg border border-line bg-surface p-4 hover:bg-subtle"
          >
            <p className="text-body font-semibold text-ink">
              {r.shortName ?? categoryByCode(r.category)?.label}
            </p>
            <p className="text-body text-muted">
              <span className="font-mono">{r.id}</span> · open until {dhakaDateTime(r.expiresAt)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
