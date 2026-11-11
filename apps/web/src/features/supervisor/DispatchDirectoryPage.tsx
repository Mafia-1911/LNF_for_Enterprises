// Dispatch directory (Figma 39:22656, FR-16–18): every handover, searchable; CSV download and a
// printable page (the browser's "Save as PDF"). Records lock 24 hours after the handover.
import { CATEGORIES } from '@lf/domain';
import { Badge, Button, buttonClasses, Notice, SearchField, SelectField, TextField } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { ChevronRight, FileDown, Printer } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useDispatchDirectory } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { dhakaDateTime } from '../../lib/clock';

export function DispatchDirectoryPage() {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState('');
  const query = {
    ...(useDeferredValue(q).trim() ? { q: q.trim() } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(category ? { category } : {}),
  };
  const list = useDispatchDirectory(query);
  const csv = `/api/supervisor/exports/dispatches.csv?${new URLSearchParams(query).toString()}`;
  const rows = list.data?.dispatches ?? [];

  return (
    <div>
      <PageHeader
        title="Dispatch directory"
        aside={
          <div className="flex gap-2 print:hidden">
            <a href={csv} download className={buttonClasses('secondary', 'md')}>
              <FileDown size={20} aria-hidden="true" /> CSV
            </a>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
              PDF
            </Button>
          </div>
        }
      />
      <p className="mt-2 text-body text-muted">
        Every handover, searchable. Records lock 24 hours after the handover; later corrections are
        added as amendments.
      </p>
      <div className="mt-6 grid gap-3 print:hidden sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
        <SearchField
          label="Search"
          placeholder="DSP ID, FND ID, claimant name, ID last 4"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <TextField
          label="From"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <SelectField
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={[
            { value: '', label: 'All categories' },
            ...CATEGORIES.map((c) => ({ value: c.code, label: c.label })),
          ]}
        />
      </div>
      {list.isError ? (
        <Notice tone="danger" className="mt-4">
          {list.error.message}
        </Notice>
      ) : null}
      {list.data && rows.length === 0 ? (
        <p className="mt-6 text-body text-muted">No handovers match.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[860px] text-left text-body">
            <caption className="sr-only">Handovers</caption>
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  DSP
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Item
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Claimant
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 print:hidden">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono whitespace-nowrap text-ink">{r.id}</td>
                  <td className="px-4 py-3">
                    <span className="block text-ink">{r.itemTitle}</span>
                    <span className="block font-mono whitespace-nowrap text-muted">
                      {r.foundItemId}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block whitespace-nowrap text-ink">{r.claimantName}</span>
                    <span className="block whitespace-nowrap text-muted">ID {r.idMasked}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink">
                    {dhakaDateTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={r.locked ? 'neutral' : 'success'}>
                        {r.locked ? 'Locked' : 'Editable'}
                      </Badge>
                      {r.disputed ? <Badge tone="danger">Dispute</Badge> : null}
                      {r.amendments > 0 ? (
                        <Badge tone="info">
                          {r.amendments} {r.amendments === 1 ? 'amendment' : 'amendments'}
                        </Badge>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 print:hidden">
                    <Link
                      to="/supervisor/dispatch/$id"
                      params={{ id: r.id }}
                      aria-label={`Open ${r.id}`}
                      className="flex size-11 items-center justify-center rounded-md hover:bg-subtle"
                    >
                      <ChevronRight size={20} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
