// "View my report": the owner's read-only view of one lost report. Private details are never shown.
import { categoryByCode, colourByCode } from '@lf/domain';
import { Badge, Card, Notice, type BadgeTone } from '@lf/ui';
import { getRouteApi } from '@tanstack/react-router';
import { useLostReport } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { dhakaDateTime } from '../../lib/clock';

const route = getRouteApi('/app/lost/$id');

const STATE_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'Open', tone: 'info' },
  POSSIBLE_MATCH: { label: 'Possible match', tone: 'accent' },
  CLAIMED: { label: 'Claimed', tone: 'primary' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'warning' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
};

export function ReportPage() {
  const { id } = route.useParams();
  const report = useLostReport(id);
  if (report.isPending) return <p className="text-body text-muted">Loading your report…</p>;
  if (report.isError) return <Notice tone="danger">{report.error.message}</Notice>;
  const r = report.data;
  const state = STATE_LABEL[r.state] ?? { label: r.state, tone: 'neutral' as const };
  const place = r.place.buildingName
    ? [r.place.buildingName, r.place.floorName, r.place.zoneName].filter(Boolean).join(' · ')
    : 'Not sure';
  const rows: [string, string][] = [
    [
      'What',
      [
        categoryByCode(r.category)?.label ?? r.category,
        r.colour ? colourByCode(r.colour)?.label : null,
        r.brand,
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    ['Where', place],
    ['When', `${dhakaDateTime(r.timeFrom)} – ${dhakaDateTime(r.timeTo)}`],
    ['Stays open until', dhakaDateTime(r.expiresAt)],
  ];
  if (r.publicDescription) rows.push(['Description', r.publicDescription]);
  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader
        eyebrow="My lost report"
        title={r.shortName ?? categoryByCode(r.category)?.label ?? 'Lost report'}
        back={{ to: '/activity' }}
        aside={<Badge tone={state.tone}>{state.label}</Badge>}
      />
      <Card className="mt-6">
        <p className="font-mono text-[20px] leading-7 font-semibold tracking-[1px] text-ink">
          {r.id}
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-body font-semibold text-muted">{k}</dt>
              <dd className="text-body text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {r.hasPrivateDetails ? (
          <p className="mt-4 text-body text-muted">
            You added private details. Only desk staff see them, when checking a claim.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
