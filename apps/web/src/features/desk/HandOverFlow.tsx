// "Hand an item back" (Figma 39:18978, 39:19289, 39:19987/39:19649): pickup code → fetch from the
// bin and check identity (plus a second check for high-value items) → signature → DSP record.
import type { Pickup } from '@lf/contracts';
import { SECOND_CHECKS, type SecondCheck } from '@lf/domain';
import {
  Avatar,
  Button,
  Card,
  CategoryIcon,
  Notice,
  SelectField,
  Stepper,
  TextField,
  TickTile,
} from '@lf/ui';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, CircleCheck, IdCard } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { photoUrl, useHandOver, usePickupLookup, useUploadPhoto } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { SignaturePad, signatureBlob } from '../../components/SignaturePad';
import { dhakaDateTime, now } from '../../lib/clock';

const route = getRouteApi('/app/desk/handover');
const TITLES = ['Pickup code', 'Check identity', 'Signature'] as const;
const CHECK_LABEL: Record<SecondCheck, string> = {
  device_unlocked: 'Claimant unlocked the device in front of me',
  serial_matched: 'Serial number or IMEI matches',
  cash_recounted: 'Cash recounted in front of the claimant',
  supervisor_approved: 'Supervisor approved this handover',
};

export function HandOverFlow() {
  const { step } = route.useSearch();
  const navigate = useNavigate();
  const lookup = usePickupLookup();
  const handOver = useHandOver();
  const upload = useUploadPhoto();
  const [code, setCode] = useState('');
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [photoMatches, setPhotoMatches] = useState(false);
  const [idLast4, setIdLast4] = useState('');
  const [secondCheck, setSecondCheck] = useState<SecondCheck | ''>('');
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const current = pickup ? step : 1;
  const goTo = (n: number) => void navigate({ to: '/desk/handover', search: { step: n } });

  async function find() {
    setError(null);
    try {
      setPickup(await lookup.mutateAsync(code.trim()));
      goTo(2);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (Object.values(err.fields)[0] ?? err.message)
          : 'That didn’t work; try again.',
      );
    }
  }

  function checkIdentity() {
    setError(null);
    if (!photoMatches) return setError('Check the person against the photo on their ID first.');
    if (!/^[A-Za-z0-9]{4}$/.test(idLast4.trim()))
      return setError('Type the last 4 characters of the ID you checked.');
    if (pickup?.highValue && !secondCheck)
      return setError('This is a high-value item; record the second check.');
    goTo(3);
  }

  async function finish() {
    setError(null);
    if (!pickup) return;
    if (!signed) return setError('Ask the claimant to sign first.');
    try {
      const blob = await signatureBlob(padRef.current);
      if (!blob) throw new Error('The signature couldn’t be saved; ask them to sign again.');
      const photo = await upload.mutateAsync(blob);
      const dsp = await handOver.mutateAsync({
        claimId: pickup.claimId,
        body: {
          photoMatches: true,
          idLast4: idLast4.trim(),
          secondCheck: secondCheck || null,
          signaturePhotoId: photo.id,
        },
      });
      await navigate({ to: '/desk/handover/$id', params: { id: dsp.id } });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (Object.values(err.fields)[0] ?? err.message)
          : err instanceof Error
            ? err.message
            : 'That didn’t save; try again.',
      );
    }
  }

  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader title="Hand an item back" back={{ to: '/desk' }} />
      <Stepper className="pt-6" step={current} total={3} title={TITLES[current - 1] ?? TITLES[0]} />
      <Card className="mt-6">
        {current === 1 ? (
          <form
            className="mx-auto flex max-w-[400px] flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void find();
            }}
          >
            <TextField
              label="What is their 6-digit pickup code?"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              className="text-center"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </form>
        ) : null}

        {current === 2 && pickup ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 rounded-lg bg-primary p-5 text-on-primary">
              <div>
                <p className="text-body">Fetch from bin</p>
                <p className="font-mono text-[40px] leading-[48px] font-bold">
                  {pickup.item.binCode ?? 'Security'}
                </p>
              </div>
              <span className="flex size-20 items-center justify-center overflow-hidden rounded-md bg-surface text-ink">
                {pickup.item.photoId ? (
                  <img
                    src={photoUrl(pickup.item.photoId)}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <CategoryIcon code={pickup.item.category} size={32} />
                )}
              </span>
            </div>
            <p className="text-body-l font-semibold text-ink">{pickup.item.title}</p>
            <div className="flex items-center gap-4 rounded-lg border border-line p-4">
              <Avatar name={pickup.claimant.name} size="l" />
              <div>
                <p className="text-overline font-semibold tracking-wide text-muted uppercase">
                  Claimant
                </p>
                <p className="text-body-l font-semibold text-ink">{pickup.claimant.name}</p>
                <p className="text-body text-muted">
                  {pickup.claimant.title ?? pickup.claimant.role}
                </p>
              </div>
            </div>
            <TickTile
              label={
                pickup.claimant.role === 'visitor'
                  ? 'The person matches the photo on their NID or passport'
                  : 'The person matches the photo on their university ID'
              }
              checked={photoMatches}
              onCheckedChange={setPhotoMatches}
            />
            <TextField
              label={`Last 4 characters of the ${pickup.claimant.role === 'visitor' ? 'NID or passport' : 'university ID'} you checked`}
              maxLength={4}
              autoComplete="off"
              className="max-w-[260px]"
              value={idLast4}
              onChange={(e) => setIdLast4(e.target.value)}
            />
            {pickup.highValue ? (
              <SelectField
                label="Second check (high-value item)"
                hint={
                  pickup.needsSupervisor
                    ? 'A visitor is collecting a high-value item: a supervisor must approve.'
                    : 'Device unlock, serial or IMEI, cash recount, or a supervisor.'
                }
                value={secondCheck}
                onChange={(e) => setSecondCheck(e.target.value as SecondCheck | '')}
                options={[
                  { value: '', label: 'Choose the check you did' },
                  ...SECOND_CHECKS.map((c) => ({ value: c, label: CHECK_LABEL[c] })),
                ]}
              />
            ) : null}
          </div>
        ) : null}

        {current === 3 && pickup ? (
          <div ref={padRef} className="flex flex-col gap-4">
            <h2 className="text-heading-s font-bold text-ink">Ask the claimant to sign</h2>
            <p className="text-body text-muted">
              “I confirm I received {pickup.item.title} ({pickup.item.id}) on{' '}
              {dhakaDateTime(now().toISOString())}.”
            </p>
            <SignaturePad label="Signature area: the claimant signs here" onChange={setSigned} />
            <p className="flex items-center gap-2 rounded-md bg-subtle p-3 text-body text-ink">
              <IdCard size={20} aria-hidden="true" /> Checked: ID ending {idLast4.toUpperCase()}
            </p>
          </div>
        ) : null}

        {error ? (
          <Notice tone="danger" live="assertive" className="mt-4">
            {error}
          </Notice>
        ) : null}
        <div className="flex items-center justify-between pt-8">
          <Button
            variant="ghost"
            icon={ArrowLeft}
            onClick={() => (current === 1 ? void navigate({ to: '/desk' }) : goTo(current - 1))}
          >
            Back
          </Button>
          {current === 1 ? (
            <Button iconEnd={ArrowRight} loading={lookup.isPending} onClick={() => void find()}>
              Find claim
            </Button>
          ) : current === 2 ? (
            <Button iconEnd={ArrowRight} onClick={checkIdentity}>
              Next
            </Button>
          ) : (
            <Button
              variant="success"
              icon={CircleCheck}
              loading={handOver.isPending || upload.isPending}
              onClick={() => void finish()}
            >
              Finish handover
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
