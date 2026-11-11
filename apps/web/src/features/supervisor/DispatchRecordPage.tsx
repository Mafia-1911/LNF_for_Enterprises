// One DSP record (US-07): who collected what, when, which checks were done, the item's history,
// amendments (FR-17) and any disputes on it.
import { AddAmendmentSchema } from '@lf/contracts';
import { Badge, Button, Card, Notice, TextAreaField, useToast } from '@lf/ui';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useAddAmendment, useDispatchRecord } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { dhakaDateTime } from '../../lib/clock';
import { History } from './History';

const CHECK: Record<string, string> = {
  device_unlocked: 'Device unlocked in front of the officer',
  serial_matched: 'Serial or IMEI matched',
  cash_recounted: 'Cash recounted in front of the claimant',
  supervisor_approved: 'Supervisor approved',
};

export function DispatchRecordPage() {
  const { id } = useParams({ from: '/app/supervisor/dispatch/$id' });
  const record = useDispatchRecord(id);
  const amend = useAddAmendment(id);
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const d = record.data?.dispatch;

  async function addAmendment() {
    const parsed = AddAmendmentSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the correction.');
      return;
    }
    setError(null);
    try {
      await amend.mutateAsync(parsed.data);
      setReason('');
      toast({ title: 'Amendment added to the record.' });
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields['reason'] ?? e.message) : 'Saving failed.');
    }
  }

  return (
    <div className="max-w-[860px]">
      <PageHeader
        title={d ? d.id : 'Handover record'}
        back={{ to: '/supervisor/dispatch' }}
        aside={
          record.data ? (
            <Badge tone={record.data.locked ? 'neutral' : 'success'}>
              {record.data.locked ? 'Locked' : `Editable until ${dhakaDateTime(d?.locksAt ?? '')}`}
            </Badge>
          ) : null
        }
      />
      {record.isError ? (
        <Notice tone="danger" className="mt-4">
          {record.error.message}
        </Notice>
      ) : null}
      {d ? (
        <Card className="mt-6 !p-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-body text-muted">Item</dt>
              <dd className="text-body text-ink">
                {d.itemTitle} · <span className="font-mono">{d.foundItemId}</span>
              </dd>
            </div>
            <div>
              <dt className="text-body text-muted">Collected by</dt>
              <dd className="text-body text-ink">
                {d.recipientName} · ID ••••{d.idLast4}
              </dd>
            </div>
            <div>
              <dt className="text-body text-muted">Handed over</dt>
              <dd className="text-body text-ink">
                {dhakaDateTime(d.createdAt)} by {d.officerName}
              </dd>
            </div>
            <div>
              <dt className="text-body text-muted">Second check</dt>
              <dd className="text-body text-ink">
                {d.secondCheck ? (CHECK[d.secondCheck] ?? d.secondCheck) : 'Not needed'}
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}

      {record.data && record.data.disputes.length > 0 ? (
        <Card className="mt-6 !p-5">
          <h2 className="pb-2 text-heading-s font-bold text-ink">Disputes</h2>
          <ul className="flex flex-col gap-2">
            {record.data.disputes.map((x) => (
              <li key={x.id} className="text-body text-ink">
                <Badge tone={x.state === 'OPEN' ? 'danger' : 'neutral'}>
                  {x.state === 'OPEN' ? 'Open' : `Resolved · ${x.outcome ?? ''}`}
                </Badge>{' '}
                {x.raisedBy}: “{x.statement}”{' '}
                <Link to="/supervisor/disputes" className="font-semibold text-primary underline">
                  Open disputes
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-6 !p-5">
        <h2 className="pb-2 text-heading-s font-bold text-ink">Amendments</h2>
        {record.data?.amendments.length === 0 ? (
          <p className="text-body text-muted">No corrections so far.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {record.data?.amendments.map((a) => (
              <li key={a.seq} className="text-body text-ink">
                <span className="font-semibold">#{a.seq}</span> {a.reason}{' '}
                <span className="text-muted">
                  · {a.by}, {dhakaDateTime(a.at)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <TextAreaField
          label="Add a correction"
          hint="The record never changes; each correction is added with your name and the time."
          className="mt-4"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={error ?? undefined}
        />
        <Button className="mt-3" loading={amend.isPending} onClick={() => void addAmendment()}>
          Add amendment
        </Button>
      </Card>

      {record.data ? (
        <Card className="mt-6 !p-5">
          <h2 className="pb-2 text-heading-s font-bold text-ink">Item history</h2>
          <History entries={record.data.history} />
        </Card>
      ) : null}
    </div>
  );
}
