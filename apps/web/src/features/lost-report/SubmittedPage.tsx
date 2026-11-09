// Lost report submitted (Figma 39:5855). Accessibility change: the check icon uses on-primary
// instead of accent (accent on primary is 1.1:1 in dark themes; docs/design/README.md).
import { buttonClasses, Notice } from '@lf/ui';
import { getRouteApi, Link } from '@tanstack/react-router';
import { CircleCheck, SearchX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLostReport } from '../../api/hooks';

const route = getRouteApi('/app/lost/$id/submitted');

export function SubmittedPage() {
  const { id } = route.useParams();
  const report = useLostReport(id);
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => heading.current?.focus(), []);

  if (report.isError) return <Notice tone="danger">{report.error.message}</Notice>;
  return (
    <div className="mx-auto max-w-[672px]">
      <section
        aria-labelledby="submitted-title"
        className="rounded-xl bg-primary p-6 text-on-primary sm:p-8"
      >
        <CircleCheck size={48} strokeWidth={1.75} aria-hidden="true" />
        <p
          id="submitted-title"
          ref={heading}
          tabIndex={-1}
          className="pt-6 text-body font-semibold opacity-80 outline-none"
        >
          Lost report submitted
        </p>
        <p
          className="pt-1 font-mono text-[28px] leading-[34px] font-bold tracking-[1.8px] break-all sm:text-mono-xl"
          data-testid="report-id"
        >
          {id}
        </p>
        <p className="pt-3 text-body opacity-85">
          Your report stays open for 30 days. We’ll alert you by email and in the app when a likely
          match is logged.
        </p>
      </section>
      <h2 className="pt-8 text-heading-s font-bold text-ink">No similar items in custody yet</h2>
      <div className="mt-3 flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-10 text-center">
        <span className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-subtle text-ink">
          <SearchX size={24} aria-hidden="true" />
        </span>
        <p className="text-body font-semibold text-ink">Nothing similar right now</p>
        <p className="max-w-[384px] pt-1 text-body text-muted">
          That’s normal. Most matches arrive within a few days.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 pt-8">
        <Link to="/lost/$id" params={{ id }} className={buttonClasses('primary')}>
          View my report
        </Link>
        <Link to="/home" className={buttonClasses('secondary')}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
