// Desk home (Figma 39:11179, SRS authority interface): four large buttons, "More", and the Today
// list. "Hand an item back" and "Check claims" arrive with phase 3 (claims and pickups).
import type { DeskItemRow, Me } from '@lf/contracts';
import { Badge, Card, Notice } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import {
  ChevronRight,
  ClipboardCheck,
  Handshake,
  LayoutGrid,
  ListChecks,
  PackagePlus,
  Search,
} from 'lucide-react';
import { useDeskToday } from '../../api/hooks';
import { daysUntil, now } from '../../lib/clock';

function dueLabel(
  row: DeskItemRow,
): { label: string; tone: 'warning' | 'success' | 'danger' } | null {
  if (!row.due) return null;
  const hours = Math.round((new Date(row.due).getTime() - now().getTime()) / 3_600_000);
  if (row.state === 'REPORTED_BY_FINDER')
    return hours <= 0
      ? { label: 'overdue', tone: 'danger' }
      : { label: `due in ${hours} h`, tone: 'warning' };
  const days = daysUntil(row.due);
  return { label: `ends in ${days} ${days === 1 ? 'day' : 'days'}`, tone: 'warning' };
}

function TodayGroup({ title, rows, empty }: { title: string; rows: DeskItemRow[]; empty: string }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between">
        <h3 className="text-body font-semibold text-ink">{title}</h3>
        <Badge tone={rows.length > 0 ? 'accent' : 'neutral'}>{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="pt-2 text-body text-muted">{empty}</p>
      ) : (
        <ul className="pt-2">
          {rows.map((r) => {
            const due = dueLabel(r);
            return (
              <li key={r.id}>
                <Link
                  to="/desk/items/$id"
                  params={{ id: r.id }}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{r.title}</span>
                    <span className="block truncate font-mono text-[15px] text-muted">
                      {r.id}
                      {r.binCode ? ` · bin ${r.binCode}` : ' · student post'}
                    </span>
                  </span>
                  {due ? <Badge tone={due.tone}>{due.label}</Badge> : null}
                  <ChevronRight size={18} aria-hidden="true" className="text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const BIG =
  'group flex min-h-[160px] flex-col justify-between rounded-xl p-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&[href]]:hover:shadow-hover';

export function DeskHome({ me }: { me: Me }) {
  const today = useDeskToday();
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div>
        <p className="text-body text-muted">Good to see you, {me.name.split(' ')[0]}.</p>
        <h1 className="font-display text-display-m font-semibold text-ink sm:text-[36px] sm:leading-[45px]">
          What do you need to do?
        </h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link to="/desk/log" search={{ step: 1 }} className={`${BIG} bg-primary text-on-primary`}>
            <PackagePlus size={36} aria-hidden="true" />
            <span>
              <span className="block text-heading-l font-bold">Log a found item</span>
              <span className="block text-body opacity-85">Walk-in or finder drop-off</span>
            </span>
          </Link>
          <div className={`${BIG} border border-dashed border-line bg-surface text-ink`}>
            <span className="flex items-start justify-between">
              <Handshake size={36} aria-hidden="true" className="text-accent-strong" />
              <Badge tone="neutral">Next update</Badge>
            </span>
            <span>
              <span className="block text-heading-l font-bold">Hand an item back</span>
              <span className="block text-body text-muted">Enter the pickup code</span>
            </span>
          </div>
          <div className={`${BIG} border border-dashed border-line bg-surface text-ink`}>
            <span className="flex items-start justify-between">
              <ListChecks size={36} aria-hidden="true" />
              <Badge tone="neutral">Next update</Badge>
            </span>
            <span>
              <span className="block text-heading-l font-bold">Check claims</span>
              <span className="block text-body text-muted">Review claims side by side</span>
            </span>
          </div>
          <Link to="/desk/find" className={`${BIG} border border-line bg-surface text-ink`}>
            <Search size={36} aria-hidden="true" />
            <span>
              <span className="block text-heading-l font-bold">Find an item</span>
              <span className="block text-body text-muted">Any ID or a few words</span>
            </span>
          </Link>
        </div>
        <Link
          to="/desk/more"
          className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line bg-surface text-body font-semibold text-ink hover:bg-subtle"
        >
          <LayoutGrid size={20} aria-hidden="true" /> More{' '}
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </div>
      <Card className="!p-5">
        <h2 className="flex items-center gap-2 pb-4 text-heading-s font-bold text-ink">
          <ClipboardCheck size={22} aria-hidden="true" className="text-primary" /> Today
        </h2>
        {today.isError ? <Notice tone="danger">{today.error.message}</Notice> : null}
        {today.data ? (
          <div className="flex flex-col gap-4">
            <TodayGroup
              title="Items to shelve"
              rows={today.data.toShelve}
              empty="No student posts waiting."
            />
            <TodayGroup
              title="Claims to review"
              rows={today.data.claimsToReview}
              empty="Nothing waiting."
            />
            <TodayGroup title="Pickups due" rows={today.data.pickupsDue} empty="Nothing waiting." />
            <TodayGroup
              title="Expiring this week"
              rows={today.data.expiringThisWeek}
              empty="Nothing ends this week."
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
