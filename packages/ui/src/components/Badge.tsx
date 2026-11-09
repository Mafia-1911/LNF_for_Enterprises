// Badge (Figma 31:239): status pill, 7 tones.
import type { ReactNode } from 'react';
import { cx } from '../cx';
import type { LucideIcon } from '../icons';

export type BadgeTone =
  'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'primary';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-soft text-muted',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  accent: 'bg-accent-soft text-accent-strong',
  primary: 'bg-primary-soft text-primary',
};

export function Badge({
  tone = 'neutral',
  icon: Icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-label font-semibold whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
