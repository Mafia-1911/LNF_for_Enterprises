// "Find an item" (Figma 39:12155): any ID (any case, no dashes, a scanned label link) or words.
import { idFromScan } from '@lf/contracts';
import { Badge, CategoryIcon, Notice, SearchField, SelectField } from '@lf/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { photoUrl, useCatalog, useDeskSearch, type DeskSearch } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { FOUND_STATE } from '../items/labels';

export function FindItemPage() {
  const catalog = useCatalog();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [scope, setScope] = useState<DeskSearch['scope']>('active');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const results = useDeskSearch({ ...(q ? { q } : {}), ...(category ? { category } : {}), scope });

  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader title="Find an item" back={{ to: '/desk' }} />
      <form
        className="mt-6 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const id = idFromScan(text);
          const only = results.data?.items.length === 1 ? results.data.items[0] : undefined;
          if (id && only?.id === id) void navigate({ to: '/desk/items/$id', params: { id } });
        }}
      >
        <SearchField
          label="ID or words"
          placeholder="Any ID (fnd26110042k works) or words like “black bag”"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[
              { value: '', label: 'All categories' },
              ...(catalog.data?.categories ?? []).map((c) => ({ value: c.code, label: c.label })),
            ]}
          />
          <SelectField
            label="Status"
            value={scope}
            onChange={(e) => setScope(e.target.value === 'all' ? 'all' : 'active')}
            options={[
              { value: 'active', label: 'At the desk or due' },
              { value: 'all', label: 'Everything, including closed' },
            ]}
          />
        </div>
      </form>
      {results.isError ? (
        <Notice tone="danger" className="mt-4">
          {results.error.message}
        </Notice>
      ) : null}
      <ul aria-live="polite" className="mt-6 flex flex-col gap-2">
        {results.data?.items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-line p-6 text-center text-body text-muted">
            Nothing matches. Check the ID, or try fewer words.
          </li>
        ) : null}
        {results.data?.items.map((r) => {
          const state = FOUND_STATE[r.state];
          return (
            <li key={r.id}>
              <Link
                to="/desk/items/$id"
                params={{ id: r.id }}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-subtle"
              >
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle text-ink">
                  {r.photoId ? (
                    <img src={photoUrl(r.photoId)} alt="" className="size-full object-cover" />
                  ) : (
                    <CategoryIcon code={r.category} size={22} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-ink">{r.title}</span>
                  <span className="block truncate font-mono text-[15px] text-muted">{r.id}</span>
                </span>
                {r.binCode ? (
                  <span className="hidden rounded-md bg-subtle px-2 py-1 font-mono text-body font-bold text-ink sm:inline">
                    {r.binCode}
                  </span>
                ) : null}
                {state ? <Badge tone={state.tone}>{state.label}</Badge> : null}
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
