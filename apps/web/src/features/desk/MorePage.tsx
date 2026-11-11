// "More" (Figma 39:11754): everything that isn't one of the four main desk tasks. Items that arrive
// in later phases say so instead of pretending to work.
import { Badge, buttonClasses } from '@lf/ui';
import {
  FlaskConical,
  History,
  Printer,
  Store,
  ClipboardCheck,
  UserRound,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTenant } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';

function Item({
  icon: Icon,
  title,
  sub,
  later,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  later?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-subtle text-primary">
        <Icon size={24} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-ink">{title}</span>
        <span className="block text-body text-muted">{sub}</span>
      </span>
      {later ? (
        <Badge tone="neutral">Later update</Badge>
      ) : (
        <ChevronRight size={20} aria-hidden="true" />
      )}
    </div>
  );
}

export function MorePage() {
  const tenant = useTenant();
  const practiceUrl = `${window.location.protocol}//practice.${window.location.host.replace(/^practice\./, '')}`;
  const inPractice = tenant.data?.tenant.isPractice ?? false;
  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader title="More" back={{ to: '/desk' }} />
      <ul className="mt-6 flex flex-col gap-3">
        <li>
          <Link to="/desk/walk-in" className="block rounded-lg hover:shadow-hover">
            <Item
              icon={UserRound}
              title="Help a walk-in student"
              sub="File a lost report or a claim for someone without a phone"
            />
          </Link>
        </li>

        <li>
          <Link to="/desk/shelf-check" className="block rounded-lg hover:shadow-hover">
            <Item
              icon={ClipboardCheck}
              title="Daily shelf check"
              sub="Tick present or missing, bin by bin"
            />
          </Link>
        </li>
        <li>
          <Link to="/desk/outage" className="block rounded-lg hover:shadow-hover">
            <Item
              icon={Printer}
              title="Outage label sheets"
              sub="Pre-reserved IDs for power or internet cuts"
            />
          </Link>
        </li>
        <li>
          <Item
            icon={History}
            title="Undo recent actions"
            sub="Anything from the last 10 minutes"
            later
          />
        </li>
        <li>
          <Item
            icon={Store}
            title="Drop points"
            sub="Security posts and department offices"
            later
          />
        </li>
        <li className="flex flex-wrap items-center gap-4 rounded-lg border border-dashed border-accent bg-accent-soft p-4">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-surface text-accent-strong">
            <FlaskConical size={24} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold text-ink">Practice mode</span>
            <span className="block text-body text-muted">
              {inPractice
                ? 'You are in practice mode now.'
                : 'Train with sample data. Real records are not touched.'}
            </span>
          </span>
          {inPractice ? null : (
            <a href={practiceUrl} className={buttonClasses('primary')}>
              <FlaskConical size={20} aria-hidden="true" /> Start practice
            </a>
          )}
        </li>
      </ul>
    </div>
  );
}
