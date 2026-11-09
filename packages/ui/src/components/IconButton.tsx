// Icon button (Figma 31:206): square 44 px, optional count badge. A label is required.
import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../cx';
import type { LucideIcon } from '../icons';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: LucideIcon;
  /** What the button does, read by screen readers ("Sign out"). */
  label: string;
  /** Small count shown on the icon, e.g. unread alerts. */
  count?: number;
};

export function IconButton({
  icon: Icon,
  label,
  count,
  className,
  type,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={count ? `${label} (${count})` : label}
      className={cx(
        'relative inline-flex size-11 items-center justify-center rounded-md text-ink hover:bg-subtle',
        className,
      )}
      {...rest}
    >
      <Icon size={22} aria-hidden="true" />
      {count ? (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-6 rounded-full bg-accent px-1.5 text-center text-label font-semibold text-on-accent"
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
