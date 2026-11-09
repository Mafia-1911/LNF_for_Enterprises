// Page header used by flows (Figma 39:3802): back link, eyebrow, display title, optional right slot.
import { Link, type LinkProps } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  back,
  aside,
}: {
  eyebrow?: string | undefined;
  title: string;
  back?: LinkProps | undefined;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {back ? (
          <Link
            {...back}
            className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-body font-semibold text-muted hover:text-ink"
          >
            <ChevronLeft size={20} aria-hidden="true" />
            Back
          </Link>
        ) : null}
        {eyebrow ? (
          <p className="mt-1 text-overline font-semibold text-accent-strong uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-display-m font-semibold text-ink sm:text-[36px] sm:leading-[45px] sm:tracking-[-0.9px]">
          {title}
        </h1>
      </div>
      {aside}
    </div>
  );
}
