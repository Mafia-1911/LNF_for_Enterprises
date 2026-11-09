// Notice (Figma 31:293): inline message. Copy rule: one sentence, what happened and what to do next.
import { CircleCheck, Info, Lock, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../cx';
import type { LucideIcon } from '../icons';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE: Record<NoticeTone, { box: string; title: string; icon: LucideIcon }> = {
  info: { box: 'bg-info-soft', title: 'text-info', icon: Info },
  success: { box: 'bg-success-soft', title: 'text-success', icon: CircleCheck },
  warning: { box: 'bg-warning-soft', title: 'text-warning', icon: Info },
  danger: { box: 'bg-danger-soft', title: 'text-danger', icon: TriangleAlert },
  neutral: { box: 'bg-subtle', title: 'text-muted', icon: Lock },
};

export type NoticeProps = {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  /** Override the tone's icon, e.g. ShieldCheck for the visitor notice. */
  icon?: LucideIcon;
  /** Announce to screen readers when it appears (errors: "assertive"). */
  live?: 'polite' | 'assertive';
  className?: string;
};

export function Notice({ tone = 'info', title, children, icon, live, className }: NoticeProps) {
  const t = TONE[tone];
  const Icon = icon ?? t.icon;
  return (
    <div
      role={live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined}
      className={cx('flex items-start gap-3 rounded-lg p-4', t.box, className)}
    >
      <Icon size={20} aria-hidden="true" className={cx('mt-0.5 shrink-0', t.title)} />
      <div className="min-w-0">
        {title ? <p className={cx('text-body font-semibold', t.title)}>{title}</p> : null}
        <div className="text-body text-ink">{children}</div>
      </div>
    </div>
  );
}
