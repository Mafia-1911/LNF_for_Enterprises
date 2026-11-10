// The label (Figma 39:18010 after saving, 39:13520 from the record): QR, FND ID, bin, category and
// date. Prints on A4 label sheets (Avery L7165, 99.1 × 67.7 mm, 8 per sheet) in the first position.
import { Button, buttonClasses, Notice } from '@lf/ui';
import { getRouteApi, Link } from '@tanstack/react-router';
import { CircleCheck, Printer } from 'lucide-react';
import { useDeskLabel } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { dhakaDateTime } from '../../lib/clock';

const route = getRouteApi('/app/desk/items/$id/label');

export function LabelPage() {
  const { id } = route.useParams();
  const { saved } = route.useSearch();
  const label = useDeskLabel(id);
  if (label.isError) return <Notice tone="danger">{label.error.message}</Notice>;
  if (!label.data) return <p className="text-body text-muted">Loading…</p>;
  const l = label.data;
  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader
        title={saved ? 'Saved' : 'Label'}
        back={{ to: '/desk/items/$id', params: { id } }}
      />
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div
          data-print-label=""
          className="w-full max-w-[340px] rounded-lg border border-line bg-white p-4 text-black shadow-card"
        >
          <div className="flex gap-4">
            <img src={l.qrDataUri} alt={`QR code for ${l.id}`} className="size-24 shrink-0" />
            <div className="min-w-0">
              <p className="text-[12px] font-bold tracking-wide uppercase">NSU Lost &amp; Found</p>
              <p className="font-mono text-[17px] font-bold">{l.id}</p>
              <p className="pt-2 text-[12px]">Bin</p>
              <p className="font-mono text-[32px] leading-9 font-bold">{l.binCode ?? 'SECURITY'}</p>
            </div>
          </div>
          <div className="mt-3 flex justify-between border-t border-black/20 pt-2 text-[14px]">
            <span className="font-semibold">{l.categoryLabel}</span>
            <span>{dhakaDateTime(l.date).split(',')[0]}</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 print:hidden">
          {saved ? (
            <Notice tone="success" icon={CircleCheck}>
              Saved as {l.id}.{' '}
              {l.binCode ? `Put it in bin ${l.binCode}.` : 'Hand it to security today.'}
            </Notice>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button icon={Printer} onClick={() => window.print()}>
              Print label
            </Button>
            <Link to="/desk/log" search={{ step: 1 }} className={buttonClasses('secondary')}>
              Log another
            </Link>
            <Link to="/desk" className={buttonClasses('ghost')}>
              Done
            </Link>
          </div>
          <p className="text-body text-muted">
            Prints on A4 label sheets (Avery L7165, 8 per sheet). Thermal printer optional.
          </p>
        </div>
      </div>
    </div>
  );
}
