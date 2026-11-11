// My claim (WF-04 steps 3–4): where it stands, what the desk asked, and — once approved — the
// 6-digit pickup code, the pickup deadline and where to go. Withdraw or re-request from here.
import { Badge, Button, Card, CategoryIcon, Notice, TextAreaField, TextField } from '@lf/ui';
import { getRouteApi } from '@tanstack/react-router';
import { Clock, IdCard, MapPin } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import {
  photoUrl,
  useClaim,
  useClaimAction,
  useMyDispute,
  useNominateProxy,
  useRaiseDispute,
} from '../../api/hooks';
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
      {c.proxy ? (
        <Notice tone="info" className="mt-6" title="Someone can collect for you">
          {c.proxy.name} (university ID {c.proxy.idMasked}) may collect this item with the pickup
          code and their own university ID.
        </Notice>
      ) : c.canNominateProxy ? (
        <ProxySection claimId={c.id} />
      ) : null}
      {c.canDispute ? <DisputeSection claimId={c.id} kind={c.canDispute} /> : null}
    </div>
  );
}

/** WF-06: a losing claimant disputes within 7 days; an owner reports the wrong item. */
function DisputeSection({
  claimId,
  kind,
}: {
  claimId: string;
  kind: 'second_claimant' | 'wrong_handover';
}) {
  const mine = useMyDispute(claimId, true);
  const raise = useRaiseDispute(claimId);
  const [statement, setStatement] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dispute = mine.data?.dispute;

  async function send() {
    setError(null);
    try {
      await raise.mutateAsync({ statement });
    } catch (e) {
      setError(
        e instanceof ApiError ? (e.fields['statement'] ?? e.message) : 'Sending failed; try again.',
      );
    }
  }

  if (dispute)
    return (
      <Card className="mt-6 !p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-heading-s font-bold text-ink">Your dispute</h2>
          <Badge tone={dispute.state === 'OPEN' ? 'warning' : 'neutral'}>
            {dispute.state === 'OPEN'
              ? 'With the supervisor'
              : dispute.outcome === 'upheld'
                ? 'Upheld'
                : 'Not upheld'}
          </Badge>
        </div>
        <p className="mt-2 text-body text-muted">“{dispute.statement}”</p>
      </Card>
    );
  return (
    <Card className="mt-6 !p-5">
      <h2 className="text-heading-s font-bold text-ink">
        {kind === 'wrong_handover' ? 'Was this the wrong item?' : 'Think this item is yours?'}
      </h2>
      <p className="mt-1 text-body text-muted">
        {kind === 'wrong_handover'
          ? 'Tell the supervisor what went wrong. They will check the handover record and contact you.'
          : 'You can dispute the decision within 7 days. The supervisor reviews the handover and contacts you.'}
      </p>
      <TextAreaField
        label="Why is it yours?"
        className="mt-4"
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        error={error ?? undefined}
      />
      <Button
        className="mt-3"
        variant="secondary"
        loading={raise.isPending}
        onClick={() => void send()}
      >
        Send dispute
      </Button>
    </Card>
  );
}

/** CC-09: the owner can't come in person and nominates someone by university ID. */
function ProxySection({ claimId }: { claimId: string }) {
  const nominate = useNominateProxy(claimId);
  const [name, setName] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function send() {
    setErrors({});
    try {
      await nominate.mutateAsync({ name, universityId });
    } catch (e) {
      setErrors(
        e instanceof ApiError
          ? { ...e.fields, ...(Object.keys(e.fields).length ? {} : { name: e.message }) }
          : {},
      );
    }
  }
  return (
    <Card className="mt-6 !p-5">
      <h2 className="text-heading-s font-bold text-ink">Can't come in person?</h2>
      <p className="mt-1 text-body text-muted">
        Nominate someone to collect it. They bring the pickup code and their own university ID.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextField
          label="Their full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors['name']}
        />
        <TextField
          label="Their university ID"
          autoComplete="off"
          value={universityId}
          onChange={(e) => setUniversityId(e.target.value)}
          error={errors['universityId']}
        />
      </div>
      <Button
        className="mt-3"
        variant="secondary"
        loading={nominate.isPending}
        onClick={() => void send()}
      >
        Nominate
      </Button>
    </Card>
  );
}
