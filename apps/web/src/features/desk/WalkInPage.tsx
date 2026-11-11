// Help a walk-in student (US-10): the desk files a lost report, or a claim on an item it holds, for
// someone without a phone. Either way the record belongs to the student (by university email), who
// then gets the alerts and, for a claim, the pickup code.
import type { WalkInClaimStart } from '@lf/contracts';
import { Button, Card, Notice, TextField, useToast } from '@lf/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useStartWalkInClaim, useSubmitWalkInClaim } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_HINT = "Type the student's university email, e.g. name@northsouth.edu.";

export function WalkInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  function start() {
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) {
      setError(EMAIL_HINT);
      return;
    }
    void navigate({ to: '/lost/new', search: { step: 1, for: value } });
  }
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <PageHeader title="Help a walk-in student" back={{ to: '/desk/more' }} />
      <Card className="flex flex-col gap-4 !p-5">
        <h2 className="text-heading-s font-bold text-ink">They lost something</h2>
        <p className="text-body text-ink">
          File a lost report for a student who walked in without a phone. They must have signed in
          once before. The report is theirs: they get the match alerts and can claim the item.
        </p>
        <TextField
          label="Student's university email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error ?? undefined}
        />
        <div>
          <Button onClick={start}>Start the report</Button>
        </div>
      </Card>
      <WalkInClaim />
    </div>
  );
}

/** The student is claiming an item the desk holds: find it, ask its questions, file the claim. */
function WalkInClaim() {
  const toast = useToast();
  const lookup = useStartWalkInClaim();
  const submit = useSubmitWalkInClaim();
  const [itemId, setItemId] = useState('');
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<WalkInClaimStart | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [filed, setFiled] = useState<{ claimId: string; itemId: string } | null>(null);

  function fail(e: unknown) {
    if (e instanceof ApiError) {
      setErrors(e.fields);
      setMessage(Object.keys(e.fields).length > 0 ? null : e.message);
    } else setMessage('That didn’t work; check the connection and try again.');
  }

  async function find() {
    setErrors({});
    setMessage(null);
    setFound(null);
    setFiled(null);
    const ownerEmail = email.trim().toLowerCase();
    const local: Record<string, string> = {};
    if (itemId.trim().length < 3) local['foundItemId'] = 'Type or scan the FND ID on the label.';
    if (!EMAIL.test(ownerEmail)) local['ownerEmail'] = EMAIL_HINT;
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    try {
      const result = await lookup.mutateAsync({ foundItemId: itemId.trim(), ownerEmail });
      setFound(result);
      setAnswers({});
    } catch (e) {
      fail(e);
    }
  }

  async function file() {
    if (!found) return;
    setErrors({});
    setMessage(null);
    try {
      const claim = await submit.mutateAsync({
        foundItemId: found.item.id,
        ownerEmail: email.trim().toLowerCase(),
        answers: found.questions.map((q) => ({ key: q.key, answer: answers[q.key] ?? '' })),
      });
      toast({ title: `Claim ${claim.id} filed for ${found.claimant.name}.` });
      setFiled({ claimId: claim.id, itemId: found.item.id });
      setFound(null);
    } catch (e) {
      fail(e);
    }
  }

  return (
    <Card className="flex flex-col gap-4 !p-5">
      <h2 className="text-heading-s font-bold text-ink">They’re claiming an item we hold</h2>
      <p className="text-body text-ink">
        Ask the student the item’s questions and type their answers. The claim is theirs: it counts
        toward their open claims, and they get the decision and the pickup code.
      </p>
      <TextField
        label="FND ID on the label"
        autoComplete="off"
        placeholder="FND-2611-0001W"
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        error={errors['foundItemId']}
      />
      <TextField
        label="Claiming student's university email"
        type="email"
        autoComplete="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors['ownerEmail']}
      />
      <div>
        <Button variant="secondary" loading={lookup.isPending} onClick={() => void find()}>
          Find the item
        </Button>
      </div>
      {message ? <Notice tone="danger">{message}</Notice> : null}
      {filed ? (
        <Notice tone="success" live="polite">
          Claim {filed.claimId} is waiting for review.{' '}
          <Link
            to="/desk/items/$id"
            params={{ id: filed.itemId }}
            className="font-semibold underline"
          >
            Open the item
          </Link>
        </Notice>
      ) : null}
      {found ? (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <p className="text-body text-ink">
            <span className="font-semibold">{found.item.title}</span> ({found.item.id}) for{' '}
            <span className="font-semibold">{found.claimant.name}</span>
          </p>
          {found.blockedReason ? (
            <Notice tone="warning">{found.blockedReason}</Notice>
          ) : (
            <>
              {found.questions.map((q) => (
                <TextField
                  key={q.key}
                  label={q.question}
                  value={answers[q.key] ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                  error={errors[`answers.${q.key}`]}
                />
              ))}
              <div>
                <Button loading={submit.isPending} onClick={() => void file()}>
                  File the claim
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
