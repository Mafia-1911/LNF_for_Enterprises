// The owner's lost report (Figma 39:6605, 39:7051): status track, open-until with one-tap renew,
// "I found it myself" (US-12, CC-16), likely matches in custody (FR-07) and the details.
// Private details are never shown back.
import { categoryByCode, colourByCode, LOST_REPORT_MAX_RENEWALS } from '@lf/domain';
import { Badge, Button, buttonClasses, Card, CategoryIcon, Modal, Notice } from '@lf/ui';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { MapPin, RefreshCw, Search, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { photoUrl, useLikelyMatches, useLostReport, useReportAction } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { StatusTrack } from '../../components/StatusTrack';
import { dhakaDateTime } from '../../lib/clock';
import { LOST_STATE, placeLine } from '../items/labels';

const route = getRouteApi('/app/lost/$id');
const TRACK = ['Reported', 'Possible match', 'Claimed', 'Resolved'];
const STEP: Record<string, number> = {
  OPEN: 0,
  EXPIRED: 0,
  WITHDRAWN: 0,
  POSSIBLE_MATCH: 1,
  CLAIMED: 2,
  RESOLVED: 3,
};

export function ReportPage() {
  const { id } = route.useParams();
  const report = useLostReport(id);
  const matches = useLikelyMatches(id);
  const action = useReportAction(id);
  const navigate = useNavigate();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (report.isPending) return <p className="text-body text-muted">Loading your report…</p>;
  if (report.isError) return <Notice tone="danger">{report.error.message}</Notice>;
  const r = report.data;
  const state = LOST_STATE[r.state] ?? { label: r.state, tone: 'neutral' as const };
  const open = r.state === 'OPEN' || r.state === 'POSSIBLE_MATCH' || r.state === 'CLAIMED';
  const canRenew =
    (r.state === 'OPEN' || r.state === 'EXPIRED') && r.renewCount < LOST_REPORT_MAX_RENEWALS;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t work; try again in a moment.');
    }
  }

  const rows: [string, string][] = [
    ['Category', categoryByCode(r.category)?.label ?? r.category],
    ['Colour', r.colour ? (colourByCode(r.colour)?.label ?? r.colour) : '—'],
    [
      'Where',
      r.place.buildingName
        ? placeLine({ ...r.place, buildingCode: r.place.buildingName })
        : 'Not sure',
    ],
    ['When', `${dhakaDateTime(r.timeFrom)} – ${dhakaDateTime(r.timeTo)}`],
    ['Private details', r.hasPrivateDetails ? 'Saved (staff only)' : 'None'],
  ];
  if (r.brand) rows.splice(2, 0, ['Brand', r.brand]);

  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader
        eyebrow={r.id}
        title={r.shortName ?? categoryByCode(r.category)?.label ?? 'Lost report'}
        back={{ to: '/activity' }}
        aside={<Badge tone={state.tone}>{state.label}</Badge>}
      />
      <StatusTrack steps={TRACK} current={STEP[r.state] ?? 0} label="Report status" />

      <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 !p-5">
        <div>
          <p className="text-body font-semibold text-ink">
            {r.state === 'EXPIRED'
              ? `Expired on ${dhakaDateTime(r.expiresAt).split(',')[0]}`
              : open
                ? `Open until ${dhakaDateTime(r.expiresAt).split(',')[0]}`
                : state.label}
          </p>
          <p className="text-body text-muted">
            Renewed {r.renewCount} of {LOST_REPORT_MAX_RENEWALS} times.{' '}
            {open ? 'We alert you on new matches.' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRenew ? (
            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={action.renew.isPending}
              onClick={() => void run(() => action.renew.mutateAsync())}
            >
              Renew 30 days
            </Button>
          ) : null}
          {open ? (
            <Button variant="secondary" icon={Undo2} onClick={() => setClosing(true)}>
              I found it myself
            </Button>
          ) : null}
        </div>
      </Card>
      {error ? (
        <Notice tone="danger" live="assertive" className="mt-4">
          {error}
        </Notice>
      ) : null}

      <h2 className="pt-8 text-heading-s font-bold text-ink">Likely matches in custody</h2>
      {matches.data && matches.data.matches.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-3">
          {matches.data.matches.map((m) => (
            <li key={m.id}>
              <Link
                to="/gallery/$id"
                params={{ id: m.id }}
                className="flex items-center gap-4 rounded-lg border border-line bg-surface p-3 hover:bg-subtle"
              >
                <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle text-ink">
                  {m.photoId ? (
                    <img src={photoUrl(m.photoId)} alt="" className="size-full object-cover" />
                  ) : (
                    <CategoryIcon code={m.category} size={28} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-ink">{m.title}</span>
                  <span className="flex items-center gap-1 truncate text-body text-muted">
                    <MapPin size={16} aria-hidden="true" /> {placeLine(m.place)} ·{' '}
                    {dhakaDateTime(m.foundAt).split(',')[0]}
                  </span>
                  <span className="block text-body text-muted">{m.reasons.join(', ')}</span>
                </span>
                <span className={buttonClasses('soft', 'md', 'shrink-0')}>This is mine</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-10 text-center">
          <span className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-subtle text-ink">
            <Search size={24} aria-hidden="true" />
          </span>
          <p className="text-body font-semibold text-ink">No matches yet</p>
          <p className="max-w-[384px] pt-1 text-body text-muted">
            We check every new item against your report and alert you.
          </p>
        </div>
      )}

      <Card className="mt-6 !p-5">
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-3">
              <dt className="text-body text-muted">{k}</dt>
              <dd className="text-right text-body font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Modal
        open={closing}
        onOpenChange={setClosing}
        title="Close this report?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(false)}>
              Keep it open
            </Button>
            <Button
              loading={action.withdraw.isPending}
              onClick={() =>
                void run(async () => {
                  await action.withdraw.mutateAsync();
                  setClosing(false);
                  await navigate({ to: '/activity' });
                })
              }
            >
              Yes, I found it
            </Button>
          </>
        }
      >
        Great news! Closing the report also cancels any open claims and alerts linked to it.
      </Modal>
    </div>
  );
}
