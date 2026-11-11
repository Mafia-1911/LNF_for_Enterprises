// "Handed over" (Figma 39:20329): the DSP record. It locks 24 hours after creation (FR-17).
import { buttonClasses, Card, Notice } from '@lf/ui';
import { getRouteApi, Link } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { useDispatch } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';

const route = getRouteApi('/app/desk/handover/$id');

export function HandedOverPage() {
  const { id } = route.useParams();
  const dsp = useDispatch(id);
  if (dsp.isError) return <Notice tone="danger">{dsp.error.message}</Notice>;
  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader title="Handed over" back={{ to: '/desk' }} />
      <Card className="mt-6 flex flex-col items-center text-center">
        <CircleCheck size={48} aria-hidden="true" className="text-success" />
        <p className="pt-3 text-body text-muted">Dispatch record</p>
        <p className="font-mono text-[28px] leading-9 font-bold text-ink" data-testid="dsp-id">
          {id}
        </p>
        {dsp.data ? (
          <p className="pt-3 text-body text-ink">
            {dsp.data.itemTitle} returned to {dsp.data.recipientName}. Lost report resolved.
          </p>
        ) : null}
        <p className="max-w-[520px] pt-3 text-body text-muted">
          The record locks after 24 hours; later changes are amendments with a reason.
        </p>
        <Link to="/desk" className={buttonClasses('primary', 'md', 'mt-6')}>
          Done
        </Link>
      </Card>
    </div>
  );
}
