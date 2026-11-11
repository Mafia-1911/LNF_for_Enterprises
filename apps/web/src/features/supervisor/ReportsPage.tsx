// Loss hotspots (Figma 39:25136, NF-07): where and when things go missing, to place notices and drop
// boxes. One series per chart in one token colour; every bar carries its value as a label, and the
// hour chart has a table for screen readers.
import { Card, Notice } from '@lf/ui';
import { useState } from 'react';
import { useHotspots } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

function BarList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="!p-5">
      <h2 className="pb-3 text-heading-s font-bold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-body text-muted">No records yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.slice(0, 8).map((r) => (
            <li
              key={r.label}
              className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3"
            >
              <span className="truncate text-body text-ink">{r.label}</span>
              <span className="h-3 rounded-r-[4px] bg-subtle" aria-hidden="true">
                <span
                  className="block h-3 rounded-r-[4px] bg-primary"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </span>
              <span className="text-body font-semibold text-ink tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ReportsPage() {
  const [days, setDays] = useState<'30' | '90' | '180'>('30');
  const report = useHotspots(days);
  const r = report.data;
  const maxHour = Math.max(1, ...(r?.byHour ?? [0]));
  const tiles = r
    ? [
        { label: 'Records in range', value: String(r.total) },
        { label: 'Top hotspot', value: r.topBuilding ?? '—' },
        {
          label: 'Peak hour',
          value:
            r.peakHour === null
              ? '—'
              : `${hourLabel(r.peakHour)} – ${hourLabel((r.peakHour + 1) % 24)}`,
        },
        {
          label: 'Return rate (closed items)',
          value: r.returnRate === null ? '—' : `${Math.round(r.returnRate * 100)}%`,
        },
      ]
    : [];
  return (
    <div>
      <PageHeader title="Loss hotspots" />
      <p className="mt-2 text-body text-muted">
        Where and when things go missing. Use this to place notices and drop boxes.
      </p>
      <div
        role="group"
        aria-label="Time range"
        className="mt-6 flex min-h-12 max-w-[420px] gap-1 rounded-[14px] bg-subtle p-1"
      >
        {(['30', '90', '180'] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={`min-h-10 flex-1 rounded-[10px] px-4 text-body font-semibold ${
              days === d ? 'bg-surface text-ink shadow-card' : 'text-muted'
            }`}
          >
            {d} days
          </button>
        ))}
      </div>
      {report.isError ? (
        <Notice tone="danger" className="mt-4">
          {report.error.message}
        </Notice>
      ) : null}
      <dl className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="!p-5">
            <dt className="text-body text-muted">{t.label}</dt>
            <dd className="pt-1 font-display text-heading-l font-semibold text-ink">{t.value}</dd>
          </Card>
        ))}
      </dl>
      {r ? (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <BarList title="By building" rows={r.byBuilding} />
            <BarList title="By floor" rows={r.byFloor} />
          </div>
          <Card className="mt-6 !p-5">
            <h2 className="pb-3 text-heading-s font-bold text-ink">By hour of day</h2>
            <div className="flex h-40 items-end gap-[2px]" aria-hidden="true">
              {r.byHour.map((n, h) => (
                <div
                  key={h}
                  title={`${hourLabel(h)}: ${n}`}
                  className="flex-1 rounded-t-[4px] bg-primary"
                  style={{ height: `${Math.max(n > 0 ? 4 : 0, (n / maxHour) * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-body text-muted" aria-hidden="true">
              {[0, 6, 12, 18, 23].map((h) => (
                <span key={h}>{hourLabel(h)}</span>
              ))}
            </div>
            <table className="sr-only">
              <caption>Records by hour of day</caption>
              <thead>
                <tr>
                  <th scope="col">Hour</th>
                  <th scope="col">Records</th>
                </tr>
              </thead>
              <tbody>
                {r.byHour.map((n, h) => (
                  <tr key={h}>
                    <td>{hourLabel(h)}</td>
                    <td>{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="mt-6">
            <BarList title="Most-lost categories" rows={r.byCategory} />
          </div>
        </>
      ) : null}
    </div>
  );
}
