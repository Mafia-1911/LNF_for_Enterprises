// The desk's Today list (Figma 39:11179): items to shelve, claims to review, pickups due, expiring
// this week. Shown on the desk home and the supervisor overview.
import type { DeskItemRow, DeskToday } from '@lf/contracts';
import { Badge, Card, Notice } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
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

export function TodayPanel({
  today,
  error,
}: {
  today: DeskToday | undefined;
  error?: string | undefined;
}) {
  return (
    <Card className="!p-5">
      <h2 className="flex items-center gap-2 pb-4 text-heading-s font-bold text-ink">
        <ClipboardCheck size={22} aria-hidden="true" className="text-primary" /> Today
      </h2>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {today ? (
        <div className="flex flex-col gap-4">
          <TodayGroup
            title="Items to shelve"
            rows={today.toShelve}
            empty="No student posts waiting."
          />
          <TodayGroup
            title="Claims to review"
            rows={today.claimsToReview}
            empty="Nothing waiting."
          />
          <TodayGroup title="Pickups due" rows={today.pickupsDue} empty="Nothing waiting." />
          <TodayGroup
            title="Expiring this week"
            rows={today.expiringThisWeek}
            empty="Nothing ends this week."
          />
        </div>
      ) : null}
    </Card>
  );
}
