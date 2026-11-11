// Claim review (Figma 39:15356, WF-04 step 3, FR-12): the item and what was recorded at intake on
// the left; each claim's answers next to it with Pass/Fail, a note, and Approve, Reject or Ask for more.
import type { DeskClaim, DeskItemClaims } from '@lf/contracts';
import { Avatar, Badge, Button, Card, CategoryIcon, Notice, TextField, cx } from '@lf/ui';
import { getRouteApi } from '@tanstack/react-router';
import { Check, Lock, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { photoUrl, useDeskItemClaims, useReviewClaim } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { dhakaDateTime, now } from '../../lib/clock';
import { CLAIM_STATE } from '../items/labels';

const route = getRouteApi('/app/desk/claims/$id');

export function ClaimReviewPage() {
  const { id } = route.useParams();
  const data = useDeskItemClaims(id);
  if (data.isError) return <Notice tone="danger">{data.error.message}</Notice>;
  if (!data.data) return <p className="text-body text-muted">Loading…</p>;
  const { item, recorded, claims } = data.data;
  const open = claims.filter((c) => c.state === 'SUBMITTED' || c.state === 'MORE_INFO_REQUESTED');
  const closed = claims.filter((c) => !open.includes(c));
  return (
    <div>
      <PageHeader
        title={
          open.length === 1 ? '1 person claims this item' : `${open.length} people claim this item`
        }
        back={{ to: '/desk/claims' }}
      />
      <div className="mt-6 grid gap-4 lg:grid-cols-[280px_repeat(auto-fit,minmax(300px,1fr))] lg:items-start">
        <Card className="!p-4">
          <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-subtle text-ink">
            {item.photoId ? (
              <img
                src={photoUrl(item.photoId)}
                alt={item.title}
                className="size-full object-cover"
              />
            ) : (
              <CategoryIcon code={item.category} size={40} />
            )}
          </span>
          <p className="pt-3 text-body-l font-semibold text-ink">{item.title}</p>
          <p className="font-mono text-[15px] text-muted">
            {item.id}
            {item.binCode ? ` · bin ${item.binCode}` : ''}
          </p>
          <div className="mt-3 rounded-md bg-subtle p-3">
            <p className="flex items-center gap-1 text-overline font-semibold tracking-wide text-muted uppercase">
              <Lock size={14} aria-hidden="true" /> Recorded at intake
            </p>
            <ul className="pt-2">
              {recorded.ticks.length === 0 ? (
                <li className="text-body text-muted">Nothing ticked.</li>
              ) : null}
              {recorded.ticks.map((t) => (
                <li key={t.code} className="flex items-center gap-2 text-body text-ink">
                  <Check size={16} aria-hidden="true" className="text-success" /> {t.label}
                </li>
              ))}
            </ul>
            {recorded.note ? <p className="pt-2 text-body text-ink">“{recorded.note}”</p> : null}
          </div>
        </Card>
        {open.map((c) => (
          <ClaimColumn key={c.id} itemId={item.id} claim={c} />
        ))}
      </div>
      {open.length === 0 ? (
        <Notice tone="info" className="mt-6">
          No claims are waiting on this item.
        </Notice>
      ) : null}
      {closed.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-heading-s font-bold text-ink">Earlier claims</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {closed.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3"
              >
                <span className="text-body text-ink">
                  {c.claimant.name} · <span className="font-mono">{c.id}</span>
                </span>
                <Badge tone={CLAIM_STATE[c.state]?.tone ?? 'neutral'}>
                  {CLAIM_STATE[c.state]?.label ?? c.state}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ClaimColumn({ itemId, claim }: { itemId: string; claim: DeskClaim }) {
  const review = useReviewClaim(itemId);
  const [verdicts, setVerdicts] = useState<Record<string, 'pass' | 'fail'>>(
    Object.fromEntries(
      claim.answers.filter((a) => a.verdict).map((a) => [a.key, a.verdict as 'pass' | 'fail']),
    ),
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hours = Math.round((new Date(claim.dueAt).getTime() - now().getTime()) / 3_600_000);

  async function decide(decision: 'approve' | 'reject' | 'more') {
    setError(null);
    try {
      await review.mutateAsync({ claimId: claim.id, body: { verdicts, decision, note } });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (Object.values(err.fields)[0] ?? err.message)
          : 'That didn’t save; try again.',
      );
    }
  }

  return (
    <Card className="!p-4">
      <div className="flex items-start gap-3">
        <Avatar name={claim.claimant.name} size="m" />
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink">{claim.claimant.name}</p>
          <p className="text-body text-muted">
            {claim.claimant.title ?? claim.claimant.role} ·{' '}
            <span className="font-mono">{claim.id}</span>
          </p>
          <p className="text-body text-muted">Submitted {dhakaDateTime(claim.submittedAt)}</p>
        </div>
        <Badge tone={hours <= 0 ? 'danger' : 'neutral'}>
          {hours <= 0 ? 'Overdue' : `Due in ${hours} h`}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2 pt-3">
        {claim.lostReportId ? (
          <Badge tone="primary">Has lost report {claim.lostReportId}</Badge>
        ) : null}
        {claim.failedVerifications > 0 ? (
          <Badge tone="warning" icon={ShieldAlert}>
            {claim.failedVerifications} failed{' '}
            {claim.failedVerifications === 1 ? 'verification' : 'verifications'}
          </Badge>
        ) : null}
        {claim.claimant.role === 'visitor' ? <Badge tone="info">Visitor: check NID</Badge> : null}
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {claim.answers.map((a) => (
          <li key={a.key} className="rounded-md border border-line p-3">
            <p className="text-body text-muted">{a.question}</p>
            <p className="pt-1 text-body font-semibold text-ink">“{a.answer}”</p>
            <div
              role="group"
              aria-label={`Verdict for: ${a.question}`}
              className="grid grid-cols-2 gap-2 pt-2"
            >
              {(['pass', 'fail'] as const).map((v) => {
                const on = verdicts[a.key] === v;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setVerdicts({ ...verdicts, [a.key]: v })}
                    className={cx(
                      'inline-flex min-h-11 items-center justify-center gap-1 rounded-md border text-body font-semibold',
                      on && v === 'pass' && 'border-success bg-success-soft text-success',
                      on && v === 'fail' && 'border-danger bg-danger-soft text-danger',
                      !on && 'border-control bg-surface text-ink hover:bg-subtle',
                    )}
                  >
                    {v === 'pass' ? (
                      <Check size={16} aria-hidden="true" />
                    ) : (
                      <X size={16} aria-hidden="true" />
                    )}
                    {v === 'pass' ? 'Pass' : 'Fail'}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {claim.proofPhotoIds.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-3">
          {claim.proofPhotoIds.map((p, i) => (
            <img
              key={p}
              src={photoUrl(p)}
              alt={`Proof ${i + 1} from ${claim.claimant.name}`}
              className="size-20 rounded-md object-cover"
            />
          ))}
        </div>
      ) : null}
      <div className="mt-4 border-t border-line pt-4">
        <TextField
          label="Note"
          optional
          placeholder="Reason, or what you need from them"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error ? (
          <Notice tone="danger" live="assertive" className="mt-3">
            {error}
          </Notice>
        ) : null}
        <div className="grid grid-cols-2 gap-2 pt-3">
          <Button
            variant="success"
            loading={review.isPending}
            onClick={() => void decide('approve')}
          >
            Approve
          </Button>
          <Button variant="danger" onClick={() => void decide('reject')}>
            Reject
          </Button>
        </div>
        <Button variant="secondary" className="mt-2 w-full" onClick={() => void decide('more')}>
          Ask for more
        </Button>
      </div>
    </Card>
  );
}

export type { DeskItemClaims };
