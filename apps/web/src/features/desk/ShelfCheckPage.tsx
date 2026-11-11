// Daily shelf check (FR-15): every item expected in each bin, ticked present or missing. Results are
// added to each item's history; missing items are listed after saving.
import { Badge, Button, Card, Notice, useToast } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useSaveShelfCheck, useShelfCheck } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';

export function ShelfCheckPage() {
  const list = useShelfCheck();
  const save = useSaveShelfCheck();
  const toast = useToast();
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ id: string; title: string; binCode: string | null }[]>();
  const bins = list.data?.bins ?? [];
  const all = bins.flatMap((b) => b.items);

  const toggle = (id: string, isMissing: boolean) =>
    setMissing((prev) => {
      const next = new Set(prev);
      if (isMissing) next.add(id);
      else next.delete(id);
      return next;
    });

  async function submit() {
    const r = await save.mutateAsync({
      results: all.map((i) => ({ id: i.id, present: !missing.has(i.id) })),
    });
    setResult(r.missing);
    setMissing(new Set());
    toast({ title: `Shelf check saved: ${r.checked} checked, ${r.missing.length} missing.` });
  }

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader title="Daily shelf check" back={{ to: '/desk/more' }} />
      <p className="mt-2 text-body text-muted">
        Go bin by bin. Everything is Present unless you tap Missing.
      </p>
      {list.isError ? (
        <Notice tone="danger" className="mt-4">
          {list.error.message}
        </Notice>
      ) : null}
      {result && result.length > 0 ? (
        <Notice tone="warning" className="mt-4" title="Missing items">
          <ul>
            {result.map((m) => (
              <li key={m.id}>
                <Link to="/desk/items/$id" params={{ id: m.id }} className="font-mono underline">
                  {m.id}
                </Link>{' '}
                {m.title} · bin {m.binCode}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {list.data && bins.length === 0 ? (
        <p className="mt-6 text-body text-muted">No items are on the shelves.</p>
      ) : null}
      <div className="mt-6 flex flex-col gap-4">
        {bins.map((bin) => (
          <Card key={bin.binCode} className="!p-5">
            <h2 className="flex items-center gap-2 pb-3 text-heading-s font-bold text-ink">
              Bin {bin.binCode} <Badge tone="neutral">{bin.items.length}</Badge>
            </h2>
            <ul className="flex flex-col gap-2">
              {bin.items.map((item) => {
                const isMissing = missing.has(item.id);
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-3 border-t border-line pt-2 first:border-t-0 first:pt-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-body text-ink">{item.title}</span>
                      <span className="block font-mono text-body text-muted">{item.id}</span>
                    </span>
                    <div
                      role="group"
                      aria-label={`${item.title} (${item.id})`}
                      className="flex gap-1"
                    >
                      <Button
                        variant={isMissing ? 'ghost' : 'soft'}
                        aria-pressed={!isMissing}
                        onClick={() => toggle(item.id, false)}
                      >
                        Present
                      </Button>
                      <Button
                        variant={isMissing ? 'danger' : 'ghost'}
                        aria-pressed={isMissing}
                        onClick={() => toggle(item.id, true)}
                      >
                        Missing
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
      {all.length > 0 ? (
        <Button className="mt-6" loading={save.isPending} onClick={() => void submit()}>
          Save shelf check ({all.length} items, {missing.size} missing)
        </Button>
      ) : null}
    </div>
  );
}
