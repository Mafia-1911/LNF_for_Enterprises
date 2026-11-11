// A found item and "This is mine" (WF-04 steps 1–2): answer 2–3 questions built from details only
// the owner would know (NF-03), optionally link my lost report and add a receipt or old photo.
// No Figma frame for this screen; built from the same components as the lost-report flow.
import { Badge, Button, Card, CategoryIcon, Notice, SelectField, TextAreaField } from '@lf/ui';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Clock, EyeOff, Lock, MapPin } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { photoUrl, useClaimStart, useSubmitClaim } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { PhotoPicker } from '../../components/PhotoPicker';
import { dhakaDateTime } from '../../lib/clock';
import { FOUND_STATE, placeLine } from '../items/labels';

const route = getRouteApi('/app/gallery/$id');

export function ItemPage() {
  const { id } = route.useParams();
  const start = useClaimStart(id);
  const submit = useSubmitClaim(id);
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [lostReportId, setLostReportId] = useState('');
  const [proof, setProof] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (start.isError) return <Notice tone="danger">{start.error.message}</Notice>;
  if (!start.data) return <p className="text-body text-muted">Loading…</p>;
  const { item, questions, myClaim, myLostReports, blockedReason } = start.data;
  const state = item.state === 'IN_CUSTODY' ? null : FOUND_STATE[item.state];

  async function send() {
    setErrors({});
    setFormError(null);
    const missing = Object.fromEntries(
      questions
        .filter((q) => (answers[q.key] ?? '').trim().length < 2)
        .map((q) => [`answers.${q.key}`, 'Answer the question; a few words are enough.']),
    );
    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      return;
    }
    try {
      const claim = await submit.mutateAsync({
        answers: questions.map((q) => ({ key: q.key, answer: answers[q.key] ?? '' })),
        lostReportId: lostReportId || null,
        proofPhotoIds: proof,
      });
      await navigate({ to: '/claims/$id', params: { id: claim.id } });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrors(err.fields);
      else
        setFormError(
          err instanceof Error ? err.message : 'That didn’t send; try again in a moment.',
        );
    }
  }

  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader
        eyebrow={item.id}
        title={item.title}
        back={{ to: '/gallery' }}
        aside={state ? <Badge tone={state.tone}>{state.label}</Badge> : null}
      />
      <Card className="mt-6 flex flex-wrap gap-5 !p-5">
        <span className="flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle text-muted">
          {item.photoId ? (
            <img src={photoUrl(item.photoId)} alt={item.title} className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-body">
              <CategoryIcon code={item.category} size={40} />
              {item.sensitive ? (
                <span className="inline-flex items-center gap-1">
                  <EyeOff size={16} aria-hidden="true" /> Photo hidden
                </span>
              ) : null}
            </span>
          )}
        </span>
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1 text-body text-ink">
            <MapPin size={16} aria-hidden="true" /> {placeLine(item.place)}
          </p>
          <p className="flex items-center gap-1 text-body text-ink">
            <Clock size={16} aria-hidden="true" /> Found {dhakaDateTime(item.foundAt)}
          </p>
          <p className="text-body text-muted">
            It’s at the Lost &amp; Found Office. Only the owner can answer the questions below.
          </p>
        </div>
      </Card>

      {myClaim ? (
        <Notice tone="info" className="mt-6">
          You claimed this item.{' '}
          <Link to="/claims/$id" params={{ id: myClaim.id }} className="font-semibold underline">
            Open your claim
          </Link>{' '}
          to see where it stands.
        </Notice>
      ) : blockedReason ? (
        <Notice tone="warning" className="mt-6">
          {blockedReason}
        </Notice>
      ) : (
        <Card className="mt-6">
          <h2 className="flex items-center gap-2 text-heading-s font-bold text-ink">
            <Lock size={20} aria-hidden="true" /> Is this yours?
          </h2>
          <p className="pt-1 pb-4 text-body text-muted">
            Answer from memory. Staff compare your answers with what was recorded when the item was
            handed in. Nobody else sees them.
          </p>
          <div className="flex flex-col gap-4">
            {questions.map((q) => (
              <TextAreaField
                key={q.key}
                label={q.question}
                rows={2}
                maxLength={300}
                value={answers[q.key] ?? ''}
                error={errors[`answers.${q.key}`]}
                onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
              />
            ))}
            {myLostReports.length > 0 ? (
              <SelectField
                label="Your lost report"
                optional
                value={lostReportId}
                onChange={(e) => setLostReportId(e.target.value)}
                error={errors['lostReportId']}
                options={[
                  { value: '', label: 'None' },
                  ...myLostReports.map((r) => ({ value: r.id, label: `${r.title} (${r.id})` })),
                ]}
              />
            ) : null}
            <PhotoPicker
              label="Proof"
              value={proof}
              onChange={setProof}
              max={3}
              hint="Optional: a receipt or an older photo of it. Only staff see it."
              addLabel="Add proof"
            />
          </div>
          {formError ? (
            <Notice tone="danger" live="assertive" className="mt-4">
              {formError}
            </Notice>
          ) : null}
          <div className="flex justify-end pt-6">
            <Button loading={submit.isPending} onClick={() => void send()}>
              This is mine
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
