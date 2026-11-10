// My activity (Figma 39:2534): what I lost and what I found, with their status. Claims arrive with
// phase 3. Visitors only see their lost reports (they can't post found items).
import type { Me } from '@lf/contracts';
import {
  Badge,
  buttonClasses,
  Card,
  CategoryIcon,
  Notice,
  Segmented,
  type BadgeTone,
} from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useMyFoundPosts, useMyLostReports } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { FOUND_STATE, LOST_STATE } from '../../features/items/labels';
import { daysUntil, dhakaDateTime } from '../../lib/clock';

function Row({
  to,
  category,
  title,
  sub,
  badge,
}: {
  to: { to: string; params: Record<string, string> };
  category: string;
  title: string;
  sub: string;
  badge: { label: string; tone: BadgeTone } | undefined;
}) {
  return (
    <Link
      to={to.to}
      params={to.params}
      className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4 hover:bg-subtle"
    >
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-subtle text-ink">
        <CategoryIcon code={category} size={24} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold text-ink">{title}</span>
        <span className="block truncate text-body text-muted">{sub}</span>
      </span>
      {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
      <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-muted" />
    </Link>
  );
}

function LostList() {
  const reports = useMyLostReports();
  if (reports.isError) return <Notice tone="danger">{reports.error.message}</Notice>;
  const list = reports.data?.reports ?? [];
  return (
    <div className="mt-4 flex flex-col gap-3">
      {reports.data && list.length === 0 ? (
        <Card>
          <p className="text-body text-ink">You haven’t reported anything lost yet.</p>
          <Link
            to="/lost/new"
            search={{ step: 1 }}
            className={buttonClasses('primary', 'md', 'mt-4')}
          >
            I lost something
          </Link>
        </Card>
      ) : null}
      {list.map((r) => {
        const days = daysUntil(r.expiresAt);
        const sub =
          r.state === 'OPEN' || r.state === 'POSSIBLE_MATCH'
            ? `${r.id} · expires in ${days} ${days === 1 ? 'day' : 'days'}`
            : `${r.id} · ${dhakaDateTime(r.createdAt).split(',')[0]}`;
        return (
          <Row
            key={r.id}
            to={{ to: '/lost/$id', params: { id: r.id } }}
            category={r.category}
            title={r.shortName ?? r.category}
            sub={sub}
            badge={LOST_STATE[r.state]}
          />
        );
      })}
    </div>
  );
}

function FoundList() {
  const posts = useMyFoundPosts();
  if (posts.isError) return <Notice tone="danger">{posts.error.message}</Notice>;
  const list = posts.data?.items ?? [];
  return (
    <div className="mt-4 flex flex-col gap-3">
      {posts.data && list.length === 0 ? (
        <Card>
          <p className="text-body text-ink">You haven’t posted a found item yet.</p>
          <Link to="/found/new" className={buttonClasses('primary', 'md', 'mt-4')}>
            I found something
          </Link>
        </Card>
      ) : null}
      {list.map((p) => (
        <Row
          key={p.id}
          to={{ to: '/found/$id/posted', params: { id: p.id } }}
          category={p.category}
          title={p.title}
          sub={`${p.id} · ${dhakaDateTime(p.createdAt).split(',')[0]}`}
          badge={FOUND_STATE[p.state]}
        />
      ))}
    </div>
  );
}

export function ActivityPage({ me }: { me: Me }) {
  const lost = useMyLostReports();
  const canFind = me.role !== 'visitor';
  const found = useMyFoundPosts(canFind);
  const [tab, setTab] = useState('lost');
  return (
    <div className="mx-auto max-w-[896px]">
      <PageHeader title="My activity" />
      {canFind ? (
        <Segmented
          className="mt-6 max-w-[420px]"
          label="My activity"
          value={tab}
          onValueChange={setTab}
          items={[
            {
              value: 'lost',
              label: `Lost (${lost.data?.reports.length ?? 0})`,
              content: <LostList />,
            },
            {
              value: 'found',
              label: `Found (${found.data?.items.length ?? 0})`,
              content: <FoundList />,
            },
          ]}
        />
      ) : (
        <LostList />
      )}
    </div>
  );
}
