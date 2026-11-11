// Outage label sheets (NF-04, CC-17): FND IDs reserved and printed in advance. During a power or
// internet cut, items are tagged on paper; afterwards each is entered under its printed ID with the
// time it was tagged. There's no second ID series.
import { Button, Card, Notice, SelectField, buttonClasses } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { useOutageSheet, useReserveOutageIds } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { dhakaDateTime } from '../../lib/clock';

export function OutageSheetPage() {
  const sheet = useOutageSheet();
  const reserve = useReserveOutageIds();
  const [count, setCount] = useState('12');
  const labels = sheet.data?.labels ?? [];
  return (
    <div className="mx-auto max-w-[960px]">
      <div className="print:hidden">
        <PageHeader title="Outage label sheets" back={{ to: '/desk/more' }} />
        <p className="mt-2 text-body text-muted">
          Print these before you need them. During an outage, stick a label on the item and write
          the time, category and bin on it. When the system is back, tap “Enter now”.
        </p>
        <Card className="mt-6 flex flex-wrap items-end gap-3 !p-5">
          <SelectField
            label="How many new labels?"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            options={['6', '12', '24', '48'].map((v) => ({ value: v, label: `${v} labels` }))}
          />
          <Button
            loading={reserve.isPending}
            onClick={() => void reserve.mutateAsync(Number(count))}
          >
            Reserve IDs
          </Button>
          <Button
            variant="secondary"
            icon={Printer}
            disabled={labels.length === 0}
            onClick={() => window.print()}
          >
            Print sheet
          </Button>
        </Card>
        {sheet.isError ? (
          <Notice tone="danger" className="mt-4">
            {sheet.error.message}
          </Notice>
        ) : null}
        {sheet.data && labels.length === 0 ? (
          <p className="mt-6 text-body text-muted">No unused labels. Reserve some to print.</p>
        ) : null}
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
        {labels.map((l) => (
          <li
            key={l.id}
            className="flex gap-3 rounded-lg border border-line bg-surface p-3 print:break-inside-avoid"
          >
            <img src={l.qrDataUri} alt="" className="size-24 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-body font-semibold text-ink">{l.id}</p>
              <p className="text-body text-muted">Time ______ Bin ______</p>
              <p className="text-body text-muted">Category ____________</p>
              <Link
                to="/desk/log"
                search={{ step: 1, reserved: l.id }}
                className={`${buttonClasses('soft', 'md')} mt-2 print:hidden`}
              >
                Enter now
              </Link>
              <p className="sr-only">Reserved {dhakaDateTime(l.reservedAt)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
