// Stepper (Figma 33:206): "Step N of M · Title" with one bar per step.
import { cx } from '../cx';

export function Stepper({
  step,
  total,
  title,
  className,
}: {
  step: number;
  total: number;
  title: string;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-2.5', className)}>
      <p className="text-body font-semibold text-muted">
        Step {step} of {total} · <span className="text-ink">{title}</span>
      </p>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cx('h-1.5 flex-1 rounded-full', i < step ? 'bg-primary' : 'bg-line')}
          />
        ))}
      </div>
    </div>
  );
}
