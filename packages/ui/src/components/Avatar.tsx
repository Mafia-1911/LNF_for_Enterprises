// Avatar (Figma 33:206): photo when there is one, otherwise initials. Sizes S 32, M 40, L 88.
import { cx } from '../cx';

const SIZE = {
  s: 'size-8 text-label',
  m: 'size-10 text-label',
  l: 'size-[88px] text-heading-l',
} as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
}

export function Avatar({
  name,
  src,
  size = 'm',
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  if (src)
    return (
      <img
        src={src}
        alt=""
        className={cx('shrink-0 rounded-full object-cover', SIZE[size], className)}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary',
        SIZE[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
