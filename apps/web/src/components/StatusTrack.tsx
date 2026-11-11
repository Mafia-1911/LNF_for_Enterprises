// Numbered status track (Figma 39:6605: "1. Reported · 2. Possible match · 3. Claimed · 4. Resolved").
// An ordered list for screen readers; the current step is marked with aria-current.
import { cx } from '@lf/ui';
import { Check } from 'lucide-react';

export function StatusTrack({
  steps,
  current,
  label,
}: {
  steps: string[];
  current: number;
  label: string;
}) {
  return (
    <ol
      aria-label={label}
      className="mt-6 grid gap-2"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s} aria-current={now ? 'step' : undefined} className="flex flex-col gap-2">
            <span
              className={cx('h-1.5 rounded-full', done || now ? 'bg-primary' : 'bg-line')}
              aria-hidden="true"
            />
            <span
              className={cx(
                'flex items-center gap-1 text-body',
                done || now ? 'font-semibold text-ink' : 'text-muted',
              )}
            >
              {done ? <Check size={16} aria-hidden="true" /> : null}
              {i + 1}. {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
