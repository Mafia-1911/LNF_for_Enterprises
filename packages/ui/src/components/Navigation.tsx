// Navigation (Figma 36:233): logo, desktop nav tab, mobile tab bar item, sidebar item.
// Tabs and items render their child (a router Link) through Slot, so routing stays in the app.
import { SearchCheck } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from '../cx';
import type { LucideIcon } from '../icons';

export function Logo({
  name = 'NSU Lost & Found',
  subtitle = 'North South University',
  inverse = false,
}: {
  name?: string;
  subtitle?: string;
  inverse?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={cx(
          'relative inline-flex size-10 shrink-0 items-center justify-center rounded-md',
          inverse ? 'bg-on-hero text-hero' : 'bg-primary text-on-primary',
        )}
      >
        <SearchCheck size={20} aria-hidden="true" />
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-accent ring-2 ring-canvas"
        />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cx(
            'font-display text-heading-s font-semibold',
            inverse ? 'text-on-hero' : 'text-ink',
          )}
        >
          {name}
        </span>
        <span
          className={cx(
            'text-logo-sub font-semibold uppercase',
            inverse ? 'text-on-hero/75' : 'text-muted',
          )}
        >
          {subtitle}
        </span>
      </span>
    </span>
  );
}

export function NavTab({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <Slot.Root
      aria-current={active ? 'page' : undefined}
      className={cx(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-body font-semibold whitespace-nowrap lg:px-4',
        active ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-subtle hover:text-ink',
      )}
    >
      {children}
    </Slot.Root>
  );
}

/** The inside of a nav tab: icon, label and an optional count pill. */
export function NavTabContent({
  icon: Icon,
  label,
  count,
}: {
  icon: LucideIcon;
  label: string;
  count?: number | undefined;
}) {
  return (
    <>
      <Icon size={20} aria-hidden="true" />
      {/* Icons only on narrow tablets so the bar never wraps; the label stays the link's name. */}
      <span className="sr-only lg:not-sr-only">{label}</span>
      {count ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-label font-bold text-on-accent">
          <span className="sr-only">, </span>
          {count}
          <span className="sr-only"> new</span>
        </span>
      ) : null}
    </>
  );
}

export function TabBarItem({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <Slot.Root
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-label font-semibold',
        active ? 'text-primary' : 'text-muted',
      )}
    >
      {children}
    </Slot.Root>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx('rounded-lg border border-line bg-surface p-5 shadow-card sm:p-8', className)}
    >
      {children}
    </div>
  );
}
