// Button (Figma 31:5): 7 variants × 2 sizes. M = 48 px, L = 56 px (tap target ≥ 44 px).
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import type { LucideIcon } from '../icons';

export type ButtonVariant =
  'primary' | 'accent' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'success';
export type ButtonSize = 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-strong',
  accent: 'bg-accent text-on-accent hover:shadow-hover',
  secondary: 'bg-surface text-ink border border-line hover:bg-subtle',
  ghost: 'bg-transparent text-ink hover:bg-subtle',
  soft: 'bg-primary-soft text-primary hover:ring-1 hover:ring-primary hover:ring-inset',
  danger: 'bg-danger text-on-danger hover:shadow-hover',
  success: 'bg-success text-on-success hover:shadow-hover',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-12 px-5 gap-2 rounded-md text-body font-semibold',
  lg: 'min-h-14 px-6 gap-2.5 rounded-lg text-body-l font-semibold',
};

/** Classes for anything that should look like a button (for example a router Link). */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra?: string,
): string {
  return cx(
    'inline-flex items-center justify-center whitespace-nowrap transition-[background-color,box-shadow] duration-150 select-none',
    'disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55',
    VARIANT[variant],
    SIZE[size],
    extra,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
  /** Shows a busy state and blocks clicks. */
  loading?: boolean;
  /** Render the child element (e.g. a Link) with button styles. */
  asChild?: boolean;
  children?: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconEnd: IconEnd,
  loading = false,
  asChild = false,
  className,
  children,
  disabled,
  type,
  ...rest
}: ButtonProps) {
  const iconSize = size === 'lg' ? 22 : 20;
  const classes = buttonClasses(variant, size, className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...rest}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {Icon ? <Icon size={iconSize} aria-hidden="true" /> : null}
      {children}
      {IconEnd ? <IconEnd size={iconSize} aria-hidden="true" /> : null}
    </button>
  );
}
