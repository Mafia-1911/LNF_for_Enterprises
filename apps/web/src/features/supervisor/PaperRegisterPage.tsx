// Paper register import (Figma 39:26196, WF-07, NF-05): bring the old logbook in so no history is
// lost. Type rows into a fast table, or fill the spreadsheet template and upload it as CSV; each row
// becomes an FND item marked "migrated", in custody from its logbook date.
import type { RegisterRow } from '@lf/contracts';
import { Button, Card, Notice, Segmented, useToast } from '@lf/ui';
import { FileDown, FileUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useCatalog, useImportRegister } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';

type Draft = {
  date: string;
  shortName: string;
  category: string;
  colour: string;
  buildingCode: string;
  binCode: string;
  note: string;
};
const EMPTY: Draft = {
  date: '',
  shortName: '',
  category: '',
  colour: '',
  buildingCode: '',
  binCode: '',
  note: '',
};
const COLUMNS = ['Date', 'Item', 'Category', 'Colour', 'Building', 'Bin', 'Logbook note'] as const;
const KEYS: (keyof Draft)[] = [
  'date',
  'shortName',
  'category',
  'colour',
  'buildingCode',
  'binCode',
  'note',
];
const TEMPLATE = `${COLUMNS.join(',')}\r\n2026-09-14,Blue bottle,bottle,blue,LIB,A-01,Left in the reading hall\r\n`;

/** A small CSV reader: commas, double-quoted cells, "" for a quote. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const ready = (d: Draft) => d.date !== '' && d.shortName.trim().length >= 2 && d.category !== '';
const toRow = (d: Draft): RegisterRow => ({
  date: d.date,
  shortName: d.shortName.trim(),
  category: d.category,
  colour: d.colour || null,
  buildingCode: d.buildingCode || null,
  binCode: d.binCode.trim().toUpperCase() || null,
  note: d.note.trim() || null,
});

const cellClass =
  'min-h-11 w-full rounded-md border border-control bg-surface px-2 text-body text-ink focus:border-primary focus:outline-2 focus:outline-primary';

export function PaperRegisterPage() {
  const catalog = useCatalog();
  const importer = useImportRegister();
  const toast = useToast();
  const [tab, setTab] = useState('table');
  const [rows, setRows] = useState<Draft[]>([{ ...EMPTY }, { ...EMPTY }, { ...EMPTY }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const filled = rows.filter(ready);

  const update = (i: number, key: keyof Draft, value: string) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  async function upload(file: File) {
    const [header, ...body] = parseCsv(await file.text());
    const startsWithHeader = header?.[0]?.trim().toLowerCase() === 'date';
    const data = (startsWithHeader ? body : [header ?? [], ...body]).filter((r) => r.length > 1);
    setRows(
      data.map(
        (cells) => Object.fromEntries(KEYS.map((k, i) => [k, (cells[i] ?? '').trim()])) as Draft,
      ),
    );
    setTab('table');
    toast({ title: `${data.length} rows loaded. Check them, then import.` });
  }

  async function runImport() {
    setErrors({});
    setMessage(null);
    const list = rows.filter(ready);
    try {
      const result = await importer.mutateAsync({ rows: list.map(toRow) });
      toast({ title: `Imported ${result.ids.length} items into custody.` });
      setRows([{ ...EMPTY }, { ...EMPTY }, { ...EMPTY }]);
    } catch (e) {
      if (e instanceof ApiError) {
        // Field keys are rows.<index among ready rows>.<field>; map them back to table rows.
        const indexes = rows.flatMap((r, i) => (ready(r) ? [i] : []));
        const mapped: Record<string, string> = {};
        for (const [key, value] of Object.entries(e.fields)) {
          const m = /^rows\.(\d+)\.(\w+)$/.exec(key);
          if (m) mapped[`${indexes[Number(m[1])] ?? 0}.${m[2] ?? ''}`] = value;
        }
        setErrors(mapped);
        setMessage(
          Object.keys(mapped).length > 0 ? 'Some rows need fixing; see the red cells.' : e.message,
        );
      } else setMessage('Importing failed; try again.');
    }
  }

  const select = (
    i: number,
    key: keyof Draft,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <select
      aria-label={`Row ${i + 1} ${label}`}
      aria-invalid={errors[`${i}.${key}`] ? true : undefined}
      title={errors[`${i}.${key}`]}
      className={`${cellClass} ${errors[`${i}.${key}`] ? 'border-danger' : ''}`}
      value={rows[i]?.[key] ?? ''}
      onChange={(e) => update(i, key, e.target.value)}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const input = (i: number, key: keyof Draft, label: string, type = 'text', placeholder = '') => (
    <input
      type={type}
      aria-label={`Row ${i + 1} ${label}`}
      aria-invalid={errors[`${i}.${key}`] ? true : undefined}
      title={errors[`${i}.${key}`]}
      placeholder={placeholder}
      className={`${cellClass} ${errors[`${i}.${key}`] ? 'border-danger' : ''}`}
      value={rows[i]?.[key] ?? ''}
      onChange={(e) => update(i, key, e.target.value)}
    />
  );

  const categories = (catalog.data?.categories ?? [])
    .filter((c) => !c.restricted)
    .map((c) => ({ value: c.code, label: c.label }));
  const colours = (catalog.data?.colours ?? []).map((c) => ({ value: c.code, label: c.label }));
  const buildings = (catalog.data?.buildings ?? []).map((b) => ({ value: b.code, label: b.name }));

  const table = (
    <Card className="mt-4 !p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-body">
          <caption className="sr-only">Logbook rows to import</caption>
          <thead className="border-b border-line text-muted">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" className="px-2 py-3 font-semibold first:pl-4">
                  {c}
                </th>
              ))}
              <th scope="col" className="px-2 py-3">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((_, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-2 pr-2 pl-4">{input(i, 'date', 'date', 'date')}</td>
                <td className="px-2 py-2">
                  {input(i, 'shortName', 'item', 'text', 'e.g. Blue bottle')}
                </td>
                <td className="px-2 py-2">{select(i, 'category', 'category', categories)}</td>
                <td className="px-2 py-2">{select(i, 'colour', 'colour', colours)}</td>
                <td className="px-2 py-2">{select(i, 'buildingCode', 'building', buildings)}</td>
                <td className="w-24 px-2 py-2">{input(i, 'binCode', 'bin', 'text', 'A-01')}</td>
                <td className="px-2 py-2">{input(i, 'note', 'logbook note')}</td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    aria-label={`Remove row ${i + 1}`}
                    className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-subtle"
                    onClick={() => setRows((prev) => prev.filter((__, j) => j !== i))}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
        <Button variant="ghost" icon={Plus} onClick={() => setRows((p) => [...p, { ...EMPTY }])}>
          Add row
        </Button>
        <span className="flex-1" />
        <span className="text-body text-muted">{filled.length} ready</span>
        <Button
          disabled={filled.length === 0}
          loading={importer.isPending}
          onClick={() => void runImport()}
        >
          Import {filled.length} {filled.length === 1 ? 'item' : 'items'}
        </Button>
      </div>
    </Card>
  );

  return (
    <div>
      <PageHeader title="Paper register import" />
      <p className="mt-2 max-w-[720px] text-body text-muted">
        Bring the old logbook into the system so no history is lost. Imported items enter custody on
        their logbook date and are marked “migrated”. Logbook notes are kept private to staff.
      </p>
      {message ? (
        <Notice tone="danger" className="mt-4">
          {message}
        </Notice>
      ) : null}
      <Segmented
        label="How to add rows"
        className="mt-6"
        value={tab}
        onValueChange={setTab}
        items={[
          {
            value: 'template',
            label: 'Spreadsheet template',
            content: (
              <Card className="mt-4 flex flex-col gap-4 !p-5">
                <p className="text-body text-ink">
                  Download the template, fill one row per logbook entry (category and colour use the
                  codes in the example), save it as CSV, and upload it here.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
                    download="paper-register-template.csv"
                    className="inline-flex min-h-12 items-center gap-2 rounded-md border border-line bg-surface px-5 text-body font-semibold text-ink hover:bg-subtle"
                  >
                    <FileDown size={20} aria-hidden="true" /> Download template
                  </a>
                  <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-md bg-primary px-5 text-body font-semibold text-on-primary hover:bg-primary-strong">
                    <FileUp size={20} aria-hidden="true" /> Upload spreadsheet
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(file);
                      }}
                    />
                  </label>
                </div>
              </Card>
            ),
          },
          { value: 'table', label: 'Fast table entry', content: table },
        ]}
      />
    </div>
  );
}
