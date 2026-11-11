// Gallery (FR-10, Figma 39:1542): items at the L&F Office now. Sensitive items show an icon only;
// ID cards are never listed. Visitors don't get this page (SRS roles).
import { addDays, dhakaDate } from '@lf/domain';
import { Badge, CategoryIcon, Notice, SearchField, SelectField, cx } from '@lf/ui';
import { Clock, EyeOff } from 'lucide-react';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { photoUrl, useCatalog, useGallery, type GalleryQuery } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { dhakaDateTime, now } from '../../lib/clock';
import { FOUND_STATE, placeLine } from '../../features/items/labels';

const SINCE = [
  { value: '', label: 'Any date' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

export function GalleryPage() {
  const { me } = getRouteApi('/app').useRouteContext();
  const desk = me.role === 'desk_officer' || me.role === 'supervisor';
  const catalog = useCatalog();
  const [words, setWords] = useState('');
  const [q, setQ] = useState('');
  const [building, setBuilding] = useState('');
  const [days, setDays] = useState('');
  const [category, setCategory] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(words.trim()), 300);
    return () => clearTimeout(t);
  }, [words]);

  const query: GalleryQuery = {
    ...(q ? { q } : {}),
    ...(building ? { building } : {}),
    ...(category ? { category } : {}),
    ...(days ? { since: addDays(dhakaDate(now()), -Number(days)) } : {}),
  };
  const gallery = useGallery(query);
  const categories = (catalog.data?.categories ?? []).filter(
    (c) => !c.restricted && c.code !== 'university_id',
  );

  return (
    <div>
      <PageHeader eyebrow="Found items in custody" title="Gallery" />
      <p className="max-w-[640px] pt-2 text-body text-muted">
        Everything here is at the L&amp;F Office now. Sensitive items show an icon only. ID cards
        are never listed — owners are emailed directly.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <SearchField
          label="Search"
          placeholder="Search colour, brand, words…"
          value={words}
          onChange={(e) => setWords(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Building"
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            options={[
              { value: '', label: 'All buildings' },
              ...(catalog.data?.buildings ?? []).map((b) => ({ value: b.code, label: b.name })),
            ]}
          />
          <SelectField
            label="Found"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            options={SINCE}
          />
        </div>
        <div
          role="group"
          aria-label="Category"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
        >
          {[{ code: '', label: 'All' }, ...categories].map((c) => {
            const on = category === c.code;
            return (
              <button
                key={c.code || 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => setCategory(c.code)}
                className={cx(
                  'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-body font-semibold',
                  on
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-control bg-surface text-ink hover:bg-subtle',
                )}
              >
                {c.code ? <CategoryIcon code={c.code} size={18} /> : null}
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      {gallery.isError ? <Notice tone="danger">{gallery.error.message}</Notice> : null}
      <ul aria-live="polite" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {gallery.data?.items.length === 0 ? (
          <li className="col-span-full rounded-lg border border-dashed border-line p-8 text-center text-body text-muted">
            Nothing like that is at the desk right now. Try fewer words, or report it as lost and
            we’ll tell you when something similar arrives.
          </li>
        ) : null}
        {gallery.data?.items.map((item) => {
          const state = item.state === 'IN_CUSTODY' ? null : FOUND_STATE[item.state];
          return (
            <li key={item.id} className="overflow-hidden rounded-lg border border-line bg-surface">
              <Link
                to={desk ? '/desk/items/$id' : '/gallery/$id'}
                params={{ id: item.id }}
                className="block h-full hover:bg-subtle"
              >
                <div className="relative flex aspect-[4/3] items-center justify-center bg-subtle text-muted">
                  {item.photoId ? (
                    <img
                      src={photoUrl(item.photoId)}
                      alt={item.title}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-body">
                      <CategoryIcon code={item.category} size={32} />
                      {item.sensitive ? (
                        <span className="inline-flex items-center gap-1">
                          <EyeOff size={16} aria-hidden="true" /> Photo hidden
                        </span>
                      ) : null}
                    </span>
                  )}
                  {state ? (
                    <Badge tone={state.tone} className="absolute top-3 left-3">
                      {state.label}
                    </Badge>
                  ) : null}
                </div>
                <div className="p-4">
                  <p className="truncate text-body-l font-semibold text-ink">{item.title}</p>
                  <p className="truncate text-body text-muted">{placeLine(item.place)}</p>
                  <p className="flex items-center gap-1 pt-1 text-body text-muted">
                    <Clock size={16} aria-hidden="true" />
                    {dhakaDateTime(item.foundAt).split(',')[0]}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
