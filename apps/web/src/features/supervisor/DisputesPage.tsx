// Disputes (Figma 39:23422, WF-06): raised when a second claimant appears after a decision or an
// owner reports a wrong handover. Notes and the outcome are added, never edited.
import type { Dispute } from '@lf/contracts';
import { Badge, Button, Card, Notice, TextAreaField, TickTile, useToast } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useDisputeNote, useDisputes, useResolveDispute } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { timeAgo } from '../../lib/clock';
import { History } from './History';

const KIND: Record<Dispute['kind'], string> = {
  second_claimant: 'Second claimant',
  wrong_handover: 'Wrong item handed over',
};

function DisputeCard({ dispute }: { dispute: Dispute }) {
  const note = useDisputeNote(dispute.id);
  const resolve = useResolveDispute(dispute.id);
  const toast = useToast();
  const [text, setText] = useState('');
  const [flag, setFlag] = useState(dispute.kind === 'wrong_handover');
  const [error, setError] = useState<string | null>(null);
  const open = dispute.state === 'OPEN';

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await action();
      setText('');
      toast({ title: done });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (Object.values(e.fields)[0] ?? e.message)
          : 'Saving failed; try again.',
      );
    }
  }

  return (
    <Card className="!p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-heading-s font-bold text-ink">
            {dispute.dispatchId
              ? `Dispute on ${dispute.dispatchId}`
              : `Dispute on ${dispute.foundItemId}`}
          </h2>
          <p className="text-body text-muted">
            {dispute.itemTitle} · {KIND[dispute.kind]} · raised by {dispute.raisedBy},{' '}
            {timeAgo(dispute.createdAt)}
          </p>
        </div>
        <Badge tone={open ? 'danger' : 'neutral'}>
          {open ? 'Open' : dispute.outcome === 'upheld' ? 'Upheld' : 'Rejected'}
        </Badge>
      </div>
      <p className="mt-3 rounded-md bg-subtle p-3 text-body text-ink">“{dispute.statement}”</p>
      {dispute.dispatchId ? (
        <Link
          to="/supervisor/dispatch/$id"
          params={{ id: dispute.dispatchId }}
          className="mt-2 inline-flex min-h-11 items-center text-body font-semibold text-primary underline"
        >
          Open the handover record and its audit trail
        </Link>
      ) : null}
      <div className="mt-3">
        <History entries={dispute.history} />
      </div>
      {open ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <TextAreaField
            label="Note or decision"
            hint="Notes are added to the record. To resolve, say what was decided and why."
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={error ?? undefined}
          />
          {dispute.dispatchId ? (
            <TickTile
              label="Flag the account that received the item for review"
              checked={flag}
              onCheckedChange={setFlag}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={note.isPending}
              onClick={() => void run(() => note.mutateAsync(text), 'Note added.')}
            >
              Add note
            </Button>
            <Button
              loading={resolve.isPending && resolve.variables.outcome === 'upheld'}
              onClick={() =>
                void run(
                  () => resolve.mutateAsync({ outcome: 'upheld', note: text, flagRecipient: flag }),
                  'Dispute upheld.',
                )
              }
            >
              Uphold
            </Button>
            <Button
              variant="ghost"
              loading={resolve.isPending && resolve.variables.outcome === 'rejected'}
              onClick={() =>
                void run(
                  () =>
                    resolve.mutateAsync({ outcome: 'rejected', note: text, flagRecipient: false }),
                  'Dispute rejected; the decision stands.',
                )
              }
            >
              Reject
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function DisputesPage() {
  const disputes = useDisputes();
  return (
    <div className="max-w-[860px]">
      <PageHeader title="Disputes" />
      <p className="mt-2 text-body text-muted">
        Raised when a second claimant appears after a decision, or an owner reports a wrong
        handover. Records are never edited, only added to.
      </p>
      {disputes.isError ? (
        <Notice tone="danger" className="mt-4">
          {disputes.error.message}
        </Notice>
      ) : null}
      {disputes.data?.disputes.length === 0 ? (
        <p className="mt-6 text-body text-muted">No disputes.</p>
      ) : null}
      <div className="mt-6 flex flex-col gap-4">
        {disputes.data?.disputes.map((d) => (
          <DisputeCard key={d.id} dispute={d} />
        ))}
      </div>
    </div>
  );
}
