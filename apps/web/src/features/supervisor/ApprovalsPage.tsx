// High-value approvals (Figma 39:21514, CC-08, CC-10): when a desk officer asks during a handover,
// the request appears here. Once approved, the officer can finish the handover.
import { Badge, Button, CategoryIcon, Notice, useToast } from '@lf/ui';
import { ShieldCheck } from 'lucide-react';
import { useApprovals, useApproveHandover } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { timeAgo } from '../../lib/clock';

export function ApprovalsPage() {
  const approvals = useApprovals();
  const approve = useApproveHandover();
  const toast = useToast();
  const list = approvals.data?.approvals ?? [];
  return (
    <div className="max-w-[860px]">
      <PageHeader title="High-value approvals" />
      <p className="mt-2 text-body text-muted">
        Handovers of phones, laptops, cash and other valuables. When a desk officer requests
        approval during a handover, it appears here.
      </p>
      {approvals.isError ? (
        <Notice tone="danger" className="mt-4">
          {approvals.error.message}
        </Notice>
      ) : null}
      {approvals.data && list.length === 0 ? (
        <p className="mt-6 text-body text-muted">Nothing waiting.</p>
      ) : null}
      <ul className="mt-6 flex flex-col gap-3">
        {list.map((a) => (
          <li
            key={a.claimId}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4"
          >
            <span className="flex size-12 items-center justify-center rounded-md bg-subtle text-muted">
              <CategoryIcon code={a.category} size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink">{a.itemTitle}</p>
              <p className="text-body text-muted">
                {a.claimantName}
                {a.claimantRole === 'visitor' ? ' (visitor)' : ''} · asked by {a.requestedBy},{' '}
                {timeAgo(a.requestedAt)}
              </p>
            </div>
            {a.approved ? (
              <Badge tone="success">Approved</Badge>
            ) : (
              <Button
                icon={ShieldCheck}
                loading={approve.isPending && approve.variables === a.claimId}
                onClick={() =>
                  void approve
                    .mutateAsync(a.claimId)
                    .then(() =>
                      toast({ title: `Approved. The desk can hand over ${a.itemTitle}.` }),
                    )
                }
              >
                Approve
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
