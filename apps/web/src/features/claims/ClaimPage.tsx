// My claim (WF-04 steps 3–4): where it stands, what the desk asked, and — once approved — the
// 6-digit pickup code, the pickup deadline and where to go. Withdraw or re-request from here.
import { Badge, Button, Card, CategoryIcon, Notice, TextAreaField } from '@lf/ui';
import { getRouteApi } from '@tanstack/react-router';
import { Clock, IdCard, MapPin } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { photoUrl, useClaim, useClaimAction } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { StatusTrack } from '../../components/StatusTrack';
import { dhakaDateTime } from '../../lib/clock';
import { CLAIM_STATE } from '../items/labels';

const route = getRouteApi('/app/claims/$id');
const TRACK = ['Submitted', 'Checked', 'Ready for pickup', 'Collected'];
const STEP: Record<string, number> = {
  SUBMITTED: 1,
  MORE_INFO_REQUESTED: 1,
  APPROVED: 2,
  COLLECTED: 3,
};

export function ClaimPage() {
  const { id } = route.useParams();
  const claim = useClaim(id);
  const action = useClaimAction(id);
  const [more, setMore] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (claim.isError) return <Notice tone="danger">{claim.error.message}</Notice>;
  if (!claim.data) return <p className="text-body text-muted">Loading…</p>;
  const c = claim.data;
  const state = CLAIM_STATE[c.state] ?? { label: c.state, tone: 'neutral' as const };
  const open = c.state === 'SUBMITTED' || c.state === 'MORE_INFO_REQUESTED';

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (Object.values(err.fields)[0] ?? err.message)
          : 'That didn’t work; try again in a moment.',
      );
    }
  }

  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader
        eyebrow={`Claim ${c.id}`}
        title={c.item.title}
        back={{ to: '/activity' }}
        aside={<Badge tone={state.tone}>{state.label}</Badge>}
      />
      {STEP[c.state] !== undefined ? (
        <StatusTrack steps={TRACK} current={STEP[c.state] ?? 0} label="Claim status" />
      ) : null}

      {c.state === 'APPROVED' && c.pickupCode ? (
        <section aria-labelledby="pickup-title" className="mt-6 rounded-xl bg-success-soft p-6">
          <p id="pickup-title" className="text-body font-semibold text-success">
            Your pickup code
          </p>
          <p
            className="font-mono text-[40px] leading-[48px] font-bold tracking-[6px] text-ink"
            data-testid="pickup-code"
          >
            {c.pickupCode}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-body text-ink">
            <li className="flex gap-2">
              <Clock size={20} aria-hidden="true" className="shrink-0" /> Collect by{' '}
              {c.pickupEndsAt ? dhakaDateTime(c.pickupEndsAt) : 'the deadline'}.
            </li>
            <li className="flex gap-2">
              <MapPin size={20} aria-hidden="true" className="shrink-0" /> {c.desk.name},{' '}
              {c.desk.location} · {c.desk.hours}
            </li>
            <li className="flex gap-2">
              <IdCard size={20} aria-hidden="true" className="shrink-0" /> Bring your university ID
              (visitors: NID or passport). Don’t share this code.
            </li>
          </ul>
        </section>
      ) : null}

      {c.state === 'MORE_INFO_REQUESTED' && c.moreInfoRequest ? (
        <Card className="mt-6">
          <h2 className="text-heading-s font-bold text-ink">The desk asked:</h2>
          <p className="pt-1 pb-4 text-body text-ink">“{c.moreInfoRequest}”</p>
          <TextAreaField
            label="Your answer"
            rows={2}
            maxLength={500}
            value={more}
            onChange={(e) => setMore(e.target.value)}
          />
          <div className="flex justify-end pt-4">
            <Button
              loading={action.more.isPending}
              onClick={() =>
                void run(async () => {
                  await action.more.mutateAsync(more);
                  setMore('');
                })
              }
            >
              Send answer
            </Button>
          </div>
        </Card>
      ) : null}

      {c.state === 'SUBMITTED' ? (
        <Notice tone="info" className="mt-6">
          The desk will check your answers by {dhakaDateTime(c.reviewDueAt)}. We’ll tell you here
          and by email.
        </Notice>
      ) : null}
      {c.decisionNote && (c.state === 'REJECTED' || c.state === 'CANCELLED') ? (
        <Notice tone="warning" className="mt-6">
          {c.decisionNote}
        </Notice>
      ) : null}
      {c.state === 'LAPSED' ? (
        <Notice tone="warning" className="mt-6">
          The pickup window closed and the item went back on the shelf.{' '}
          {c.canReRequest
            ? 'You can ask for it once more.'
            : 'Ask the Lost & Found office if you still need it.'}
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="danger" live="assertive" className="mt-4">
          {error}
        </Notice>
      ) : null}

      <Card className="mt-6 !p-5">
        <div className="flex items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle text-ink">
            {c.item.photoId ? (
              <img src={photoUrl(c.item.photoId)} alt="" className="size-full object-cover" />
            ) : (
              <CategoryIcon code={c.item.category} size={28} />
            )}
          </span>
          <div>
            <p className="font-mono text-body text-muted">{c.item.id}</p>
            <p className="text-body text-muted">Submitted {dhakaDateTime(c.createdAt)}</p>
          </div>
        </div>
        <h2 className="pt-5 text-body font-semibold text-ink">
          Your answers (only staff see them)
        </h2>
        <dl className="mt-2 divide-y divide-line">
          {c.answers.map((a) => (
            <div key={a.key} className="py-3">
              <dt className="text-body text-muted">{a.question}</dt>
              <dd className="text-body text-ink">{a.answer}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="flex flex-wrap gap-3 pt-6">
        {c.canReRequest ? (
          <Button
            loading={action.reRequest.isPending}
            onClick={() => void run(() => action.reRequest.mutateAsync())}
          >
            Ask for it again
          </Button>
        ) : null}
        {open ? (
          <Button
            variant="ghost"
            loading={action.withdraw.isPending}
            onClick={() => void run(() => action.withdraw.mutateAsync())}
          >
            Withdraw my claim
          </Button>
        ) : null}
      </div>
    </div>
  );
}
