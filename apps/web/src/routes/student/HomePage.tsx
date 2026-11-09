// Student / visitor home (Figma 39:899, shell + main actions only in this phase). Visitors don't
// get the gallery strip or "I found something" (plan §9.7; visitors can only report and claim).
import type { Me } from '@lf/contracts';
import { Notice } from '@lf/ui';
import { Link } from '@tanstack/react-router';
import { ArrowRight, HandHeart, MapPin, Search } from 'lucide-react';
import { useTenant } from '../../api/hooks';

export function HomePage({ me }: { me: Me }) {
  const tenant = useTenant();
  const office = tenant.data?.office;
  return (
    <div>
      <p className="text-body text-muted">Hello, {me.name.split(' ')[0]}</p>
      <h1 className="font-display text-display-l font-semibold text-ink sm:text-[52px] sm:leading-[56px] sm:tracking-[-1px]">
        What happened?
      </h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Link
          to="/lost/new"
          search={{ step: 1 }}
          className="group flex min-h-[200px] flex-col rounded-xl bg-primary p-8 text-on-primary hover:shadow-hover"
        >
          <span className="flex justify-between">
            <Search size={36} aria-hidden="true" />
            <ArrowRight
              size={24}
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-1"
            />
          </span>
          <span className="mt-auto pt-8 font-display text-display-m font-semibold">
            I lost something
          </span>
          <span className="pt-1 text-body">
            Post a report. We’ll alert you when a likely match is logged.
          </span>
        </Link>
        {me.role === 'visitor' ? null : (
          <div
            aria-disabled="true"
            className="flex min-h-[200px] flex-col rounded-xl bg-accent-soft p-8 text-ink"
          >
            <HandHeart size={36} aria-hidden="true" className="text-accent-strong" />
            <span className="mt-auto pt-8 font-display text-display-m font-semibold">
              I found something
            </span>
            <span className="pt-1 text-body text-muted">
              Coming in the next update: post it, see who might have lost it, then hand it in within
              48 h.
            </span>
          </div>
        )}
      </div>
      {office ? (
        <div className="mt-8 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-5">
          <span className="inline-flex size-12 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <MapPin size={24} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-ink">{office.name}</p>
            <p className="text-body text-muted">
              {office.location} · {office.hours}
            </p>
          </div>
          <span className="rounded-full bg-info-soft px-3 py-1 text-label font-semibold text-info">
            All found items go to this office
          </span>
        </div>
      ) : null}
      {me.role === 'visitor' ? (
        <Notice tone="info" className="mt-6">
          Bring your national ID (NID) or passport when you collect an item.
        </Notice>
      ) : null}
    </div>
  );
}
