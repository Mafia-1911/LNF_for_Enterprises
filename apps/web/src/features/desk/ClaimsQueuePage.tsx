// "Check claims" (Figma 39:15044): items with claims waiting, soonest deadline first. Items with
// several claims are reviewed side by side (FR-12).
import { Badge, CategoryIcon, Notice } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { photoUrl, useDeskClaimQueue } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { now } from '../../lib/clock';

export function ClaimsQueuePage() {
  const queue = useDeskClaimQueue();
  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader title="Check claims" back={{ to: '/desk' }} />
      <p className="pt-2 text-body text-muted">
        Target: decide within 2 working days. Items with several claims are reviewed side by side.
      </p>
      {queue.isError ? (
        <Notice tone="danger" className="mt-4">
          {queue.error.message}
        </Notice>
      ) : null}
      <ul className="mt-6 flex flex-col gap-3">
        {queue.data?.items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-line p-6 text-center text-body text-muted">
            No claims are waiting. Nice work.
          </li>
        ) : null}
        {queue.data?.items.map(({ item, claims, dueAt }) => {
          const hours = Math.round((new Date(dueAt).getTime() - now().getTime()) / 3_600_000);
          return (
            <li key={item.id}>
              <Link
                to="/desk/claims/$id"
                params={{ id: item.id }}
                className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4 hover:bg-subtle"
              >
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle text-ink">
                  {item.photoId ? (
                    <img src={photoUrl(item.photoId)} alt="" className="size-full object-cover" />
                  ) : (
                    <CategoryIcon code={item.category} size={24} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-l font-semibold text-ink">
                    {item.title}
                  </span>
                  <span className="block truncate font-mono text-[15px] text-muted">
                    {item.id}
                    {item.binCode ? ` · bin ${item.binCode}` : ''}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <Badge tone={claims > 1 ? 'accent' : 'info'}>
                    {claims} {claims === 1 ? 'claim' : 'claims'}
                  </Badge>
                  <Badge tone={hours <= 0 ? 'danger' : 'neutral'}>
                    {hours <= 0 ? 'Overdue' : `Due in ${hours} h`}
                  </Badge>
                </span>
                <ChevronRight size={20} aria-hidden="true" className="text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
