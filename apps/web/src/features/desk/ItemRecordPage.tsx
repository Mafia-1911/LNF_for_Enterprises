// One found item for desk staff (Figma 39:13027): status, bin, details, private details, history,
// and the actions: label, correct (needs a reason, 39:14473), receive a student post, mark VOID.
import type { DeskFoundItem } from '@lf/contracts';
import { categoryByCode, colourByCode } from '@lf/domain';
import { Badge, Button, buttonClasses, Card, CategoryIcon, Modal, Notice, TextField } from '@lf/ui';
import { getRouteApi, Link } from '@tanstack/react-router';
import { Ban, History, MapPin, Pencil, Printer, QrCode } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { photoUrl, useCorrectFoundItem, useDeskItem, useVoidFoundItem } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { daysUntil, dhakaDateTime } from '../../lib/clock';
import { FOUND_STATE, placeLine } from '../items/labels';

const route = getRouteApi('/app/desk/items/$id');
const FINAL = ['DISPATCHED', 'DONATED', 'DISPOSED', 'TRANSFERRED', 'VOID'];

export function ItemRecordPage() {
  const { id } = route.useParams();
  const item = useDeskItem(id);
  const [correcting, setCorrecting] = useState(false);
  const [voiding, setVoiding] = useState(false);

  if (item.isError) return <Notice tone="danger">{item.error.message}</Notice>;
  if (!item.data) return <p className="text-body text-muted">Loading…</p>;
  const r = item.data;
  const state = FOUND_STATE[r.state];
  const awaiting = r.state === 'REPORTED_BY_FINDER' || r.state === 'NOT_RECEIVED';
  const details: [string, string][] = [
    ['Category', categoryByCode(r.category)?.label ?? r.category],
    ['Colour', r.colour ? (colourByCode(r.colour)?.label ?? r.colour) : '—'],
    ['Found', dhakaDateTime(r.foundAt)],
    ['Where', placeLine(r.place)],
    ['Source', r.sourceLabel],
    ['Condition', r.condition ?? '—'],
  ];
  if (r.brand) details.splice(2, 0, ['Brand', r.brand]);
  if (r.idNumberMasked) details.push(['Number', r.idNumberMasked]);

  return (
    <div>
      <PageHeader title={r.title} back={{ to: '/desk/find' }} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card className="!p-5">
            <div className="flex flex-wrap gap-5">
              <span className="flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle text-ink">
                {r.photoIds[0] ? (
                  <img
                    src={photoUrl(r.photoIds[0])}
                    alt={r.title}
                    className="size-full object-cover"
                  />
                ) : (
                  <CategoryIcon code={r.category} size={40} />
                )}
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <p className="font-mono text-body-l font-bold text-ink">{r.id}</p>
                {state ? <Badge tone={state.tone}>{state.label}</Badge> : null}
                {r.binCode ? (
                  <p className="text-body text-ink">
                    Bin{' '}
                    <span className="rounded-md bg-primary px-2 py-0.5 font-mono font-bold text-on-primary">
                      {r.binCode}
                    </span>
                  </p>
                ) : null}
                {r.restricted ? (
                  <p className="text-body font-semibold text-danger">
                    Restricted: hand to security today.
                  </p>
                ) : null}
                {awaiting && r.handInDeadline ? (
                  <p className="text-body text-muted">
                    Hand-in due {dhakaDateTime(r.handInDeadline)}
                  </p>
                ) : null}
                {r.state === 'IN_CUSTODY' && r.retentionEndsAt ? (
                  <p className="text-body text-muted">
                    Retention ends in {daysUntil(r.retentionEndsAt)} days
                  </p>
                ) : null}
                {r.ownerEmailed ? (
                  <p className="text-body text-success">Owner emailed directly.</p>
                ) : null}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {r.state === 'CLAIM_PENDING' ? (
                <Link
                  to="/desk/claims/$id"
                  params={{ id: r.id }}
                  className={buttonClasses('primary')}
                >
                  Review claims
                </Link>
              ) : null}
              {awaiting ? (
                <Link
                  to="/desk/log"
                  search={{ step: 1, receive: r.id }}
                  className={buttonClasses('primary')}
                >
                  <QrCode size={20} aria-hidden="true" /> Receive at desk
                </Link>
              ) : (
                <Link
                  to="/desk/items/$id/label"
                  params={{ id: r.id }}
                  search={{ saved: false }}
                  className={buttonClasses('secondary')}
                >
                  <Printer size={20} aria-hidden="true" /> Label
                </Link>
              )}
              {FINAL.includes(r.state) ? null : (
                <>
                  <Button variant="secondary" icon={Pencil} onClick={() => setCorrecting(true)}>
                    Correct
                  </Button>
                  <Button variant="ghost" icon={Ban} onClick={() => setVoiding(true)}>
                    Mark VOID
                  </Button>
                </>
              )}
            </div>
          </Card>
          <Card className="!p-5">
            <dl className="divide-y divide-line">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-body text-muted">{k}</dt>
                  <dd className="text-right text-body font-semibold text-ink">
                    {k === 'Where' ? (
                      <MapPin size={16} aria-hidden="true" className="mr-1 inline" />
                    ) : null}
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="!p-5">
            <h2 className="text-overline font-semibold tracking-wide text-muted uppercase">
              Private details (staff only)
            </h2>
            <div className="flex flex-wrap gap-2 pt-3">
              {r.privateDetails.ticks.length === 0 ? (
                <p className="text-body text-muted">None ticked.</p>
              ) : null}
              {r.privateDetails.ticks.map((t) => (
                <Badge key={t} tone="primary">
                  {t.replaceAll('_', ' ')}
                </Badge>
              ))}
            </div>
            {r.privateDetails.note ? (
              <p className="pt-3 text-body text-ink">“{r.privateDetails.note}”</p>
            ) : null}
            {r.conditionPhotoIds.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-3">
                {r.conditionPhotoIds.map((p, i) => (
                  <img
                    key={p}
                    src={photoUrl(p)}
                    alt={`Damage ${i + 1}`}
                    className="size-20 rounded-md object-cover"
                  />
                ))}
              </div>
            ) : null}
          </Card>
        </div>
        <Card className="!p-5">
          <h2 className="flex items-center gap-2 text-heading-s font-bold text-ink">
            <History size={20} aria-hidden="true" /> History
          </h2>
          <ol className="mt-4 flex flex-col gap-4 border-l-2 border-line pl-4">
            {r.history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <p className="text-body font-semibold text-ink">{h.label}</p>
                <p className="text-body text-muted">
                  {dhakaDateTime(h.at)} · {h.by}
                </p>
                {h.toState ? (
                  <p className="font-mono text-[15px] text-muted">
                    {h.fromState ?? '—'} → {h.toState}
                  </p>
                ) : null}
                {h.note ? <p className="text-body text-ink">{h.note}</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <CorrectDialog item={r} open={correcting} onOpenChange={setCorrecting} />
      <VoidDialog item={r} open={voiding} onOpenChange={setVoiding} />
    </div>
  );
}

function CorrectDialog({
  item,
  open,
  onOpenChange,
}: {
  item: DeskFoundItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const correct = useCorrectFoundItem(item.id);
  const [shortName, setShortName] = useState(item.shortName ?? '');
  const [binCode, setBinCode] = useState(item.binCode ?? '');
  const [condition, setCondition] = useState(item.condition ?? '');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function save() {
    setErrors({});
    try {
      await correct.mutateAsync({
        shortName,
        condition,
        reason,
        ...(item.restricted ? {} : { binCode: binCode || null }),
      });
      setReason('');
      onOpenChange(false);
    } catch (err) {
      setErrors(
        err instanceof ApiError
          ? { ...err.fields, _: err.message }
          : { _: 'That didn’t save; try again.' },
      );
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Correct this record"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={correct.isPending} onClick={() => void save()}>
            Save correction
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Short name"
          optional
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          error={errors['shortName']}
        />
        {item.restricted ? null : (
          <TextField
            label="Bin"
            optional
            value={binCode}
            onChange={(e) => setBinCode(e.target.value.toUpperCase())}
            error={errors['binCode']}
          />
        )}
        <TextField
          label="Condition"
          optional
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          error={errors['condition']}
        />
        <TextField
          label="Reason for the change"
          hint="Required. Saved in the history."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors['reason']}
        />
        {errors['_'] && Object.keys(errors).length === 1 ? (
          <Notice tone="danger">{errors['_']}</Notice>
        ) : null}
      </div>
    </Modal>
  );
}

function VoidDialog({
  item,
  open,
  onOpenChange,
}: {
  item: DeskFoundItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const voidItem = useVoidFoundItem(item.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  async function confirm() {
    setError(undefined);
    try {
      await voidItem.mutateAsync(reason);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.fields['reason'] ?? err.message)
          : 'That didn’t save; try again.',
      );
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Mark this record VOID?"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={voidItem.isPending} onClick={() => void confirm()}>
            Mark VOID
          </Button>
        </>
      }
    >
      <p className="pb-4 text-body text-muted">
        Use this for records created in error. The ID and history are kept. Items in custody need a
        supervisor.
      </p>
      <TextField
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
      />
    </Modal>
  );
}
