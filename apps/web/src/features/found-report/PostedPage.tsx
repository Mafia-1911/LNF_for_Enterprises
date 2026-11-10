// Found item posted (Figma 39:9137): FND ID, QR to show at the desk, the hand-in deadline and
// where the office is. "Print or save" prints just this card.
import { Button, Notice } from '@lf/ui';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { CircleCheck, Clock, MapPin, Printer, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useFoundPost } from '../../api/hooks';
import { dhakaDateTime, now } from '../../lib/clock';

const route = getRouteApi('/app/found/$id/posted');

export function PostedPage() {
  const { id } = route.useParams();
  const post = useFoundPost(id);
  const navigate = useNavigate();
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => heading.current?.focus(), []);

  if (post.isError) return <Notice tone="danger">{post.error.message}</Notice>;
  if (!post.data) return <p className="text-body text-muted">Loading…</p>;
  const p = post.data;
  const deadline = p.handInDeadline ? new Date(p.handInDeadline) : null;
  const hoursLeft = deadline
    ? Math.max(0, Math.ceil((deadline.getTime() - now().getTime()) / 3_600_000))
    : null;
  const atDesk = p.state !== 'REPORTED_BY_FINDER' && p.state !== 'NOT_RECEIVED';

  return (
    <div className="mx-auto max-w-[672px]" data-print-area="">
      <section
        aria-labelledby="posted-title"
        className="overflow-hidden rounded-xl border border-line bg-surface"
      >
        <div className="flex items-start justify-between gap-4 bg-accent p-6 text-on-accent">
          <div className="min-w-0">
            <p
              id="posted-title"
              ref={heading}
              tabIndex={-1}
              className="text-body font-semibold outline-none"
            >
              Found item posted
            </p>
            <p
              className="pt-1 font-mono text-[28px] leading-[34px] font-bold tracking-[1.8px] break-all sm:text-mono-xl"
              data-testid="found-id"
            >
              {p.id}
            </p>
            <p className="pt-2 text-body">{p.title}</p>
          </div>
          <CircleCheck size={40} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
        </div>
        <div className="flex flex-col gap-6 p-6 sm:flex-row">
          <figure className="flex shrink-0 flex-col items-center gap-2">
            <img
              src={p.qrDataUri}
              alt={`QR code for ${p.id}`}
              className="size-40 rounded-md bg-white p-2"
            />
            <figcaption className="text-body text-muted">Show this at the desk</figcaption>
          </figure>
          <ul className="flex flex-col gap-4">
            {atDesk ? (
              <li className="flex gap-3">
                <CircleCheck
                  size={20}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-success"
                />
                <p className="text-body font-semibold text-ink">It’s at the desk. Thank you!</p>
              </li>
            ) : deadline ? (
              <li className="flex gap-3">
                <Clock
                  size={20}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-accent-strong"
                />
                <div>
                  <p className="text-body font-semibold text-ink">
                    Hand in within {hoursLeft} {hoursLeft === 1 ? 'hour' : 'hours'}
                  </p>
                  <p className="text-body text-muted">
                    Deadline {dhakaDateTime(deadline.toISOString())}. We’ll remind you at 24 h.
                  </p>
                </div>
              </li>
            ) : null}
            <li className="flex gap-3">
              <MapPin size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="text-body font-semibold text-ink">{p.desk.name}</p>
                <p className="text-body text-muted">{p.desk.location}</p>
                <p className="text-body text-muted">{p.desk.hours}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <ShieldCheck size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
              <p className="text-body text-muted">
                Please don’t hand it to anyone directly. Staff verify the owner so it goes back to
                the right person. We’ll tell you when it does.
              </p>
            </li>
            {p.pinged > 0 ? (
              <li className="text-body text-muted">
                We told {p.pinged === 1 ? 'one owner' : `${p.pinged} owners`} it might be theirs.
              </li>
            ) : null}
          </ul>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-line p-5 print:hidden">
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
            Print or save
          </Button>
          <Button onClick={() => void navigate({ to: '/activity' })}>Done</Button>
        </div>
      </section>
    </div>
  );
}
