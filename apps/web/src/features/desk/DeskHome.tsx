// Desk home (Figma 39:11179, SRS authority interface): four large buttons, "More", and the Today
// list (to shelve, claims to review, pickups due, expiring this week).
import type { Me } from '@lf/contracts';
import { Link } from '@tanstack/react-router';
import { ChevronRight, Handshake, LayoutGrid, ListChecks, PackagePlus, Search } from 'lucide-react';
import { useDeskToday } from '../../api/hooks';
import { TodayPanel } from './TodayPanel';

const BIG =
  'group flex min-h-[160px] flex-col justify-between rounded-xl p-6 hover:shadow-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export function DeskHome({ me }: { me: Me }) {
  const today = useDeskToday();
  const waiting = today.data?.claimsToReview.length ?? 0;
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
          <Link
            to="/desk/handover"
            search={{ step: 1 }}
            className={`${BIG} bg-accent text-on-accent`}
          >
            <Handshake size={36} aria-hidden="true" />
            <span>
              <span className="block text-heading-l font-bold">Hand an item back</span>
              <span className="block text-body">Enter the pickup code</span>
            </span>
          </Link>
          <Link to="/desk/claims" className={`${BIG} border border-line bg-surface text-ink`}>
            <ListChecks size={36} aria-hidden="true" />
            <span>
              <span className="block text-heading-l font-bold">Check claims</span>
              <span className="block text-body text-muted">
                {waiting === 0 ? 'Nothing waiting' : `${waiting} waiting for review`}
              </span>
            </span>
          </Link>
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
      <TodayPanel today={today.data} error={today.isError ? today.error.message : undefined} />
    </div>
  );
}
