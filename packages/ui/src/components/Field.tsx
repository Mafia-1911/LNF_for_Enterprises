// Input (Figma 33:33): label, control and hint; states default / focus / error; 48 px control.
// Text, textarea, select (native, with chevron) and search share the same frame.
import { ChevronDown, Search } from 'lucide-react';
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from '../cx';
import type { LucideIcon } from '../icons';

type FieldFrame = {
  label: string;
  /** Small icon before the label (e.g. a lock for private details). */
  icon?: LucideIcon;
  /** Shown as "(optional)" after the label. */
  optional?: boolean;
  hint?: ReactNode;
  /** One-sentence error; replaces the hint and marks the control invalid. */
  error?: string | undefined;
  className?: string;
};

const control = (invalid: boolean) =>
  cx(
    'w-full rounded-md border bg-surface px-4 text-body text-ink placeholder:text-muted',
    'outline-none focus:ring-1 focus:ring-inset',
    invalid
      ? 'border-danger ring-1 ring-danger ring-inset'
      : 'border-control focus:border-primary focus:ring-primary',
    'disabled:cursor-not-allowed disabled:opacity-55',
  );

function Frame({
  id,
  label,
  icon: Icon,
  optional,
  hint,
  error,
  className,
  children,
}: FieldFrame & { id: string; children: ReactNode }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="inline-flex items-center gap-1.5 text-body font-semibold text-ink"
      >
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        {label}
        {optional ? <span className="font-normal text-muted"> (optional)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-body text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-body text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const described = (id: string, hint: unknown, error: unknown) =>
  hint || error ? `${id}-msg` : undefined;

export type TextFieldProps = FieldFrame &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & { leading?: ReactNode };

export function TextField({
  label,
  optional,
  hint,
  error,
  className,
  id: givenId,
  leading,
  ...input
}: TextFieldProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Frame
      id={id}
      label={label}
      optional={optional ?? false}
      hint={hint}
      error={error}
      className={className ?? ''}
    >
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">
            {leading}
          </span>
        ) : null}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={described(id, hint, error)}
          className={cx(control(Boolean(error)), 'min-h-12', leading ? 'pl-11' : '')}
          {...input}
        />
      </div>
    </Frame>
  );
}

export function SearchField(props: Omit<TextFieldProps, 'leading' | 'type'>) {
  return <TextField type="search" leading={<Search size={20} aria-hidden="true" />} {...props} />;
}

export type TextAreaFieldProps = FieldFrame &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;

export function TextAreaField({
  label,
  icon,
  optional,
  hint,
  error,
  className,
  id: givenId,
  rows = 3,
  ...area
}: TextAreaFieldProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Frame
      id={id}
      label={label}
      {...(icon ? { icon } : {})}
      optional={optional ?? false}
      hint={hint}
      error={error}
      className={className ?? ''}
    >
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(id, hint, error)}
        className={cx(control(Boolean(error)), 'resize-y py-3')}
        {...area}
      />
    </Frame>
  );
}

export type SelectFieldProps = FieldFrame &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
    options: { value: string; label: string }[];
  };

export function SelectField({
  label,
  optional,
  hint,
  error,
  className,
  id: givenId,
  options,
  ...select
}: SelectFieldProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Frame
      id={id}
      label={label}
      optional={optional ?? false}
      hint={hint}
      error={error}
      className={className ?? ''}
    >
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={described(id, hint, error)}
          className={cx(control(Boolean(error)), 'min-h-12 appearance-none pr-11')}
          {...select}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted"
        />
      </div>
    </Frame>
  );
}
