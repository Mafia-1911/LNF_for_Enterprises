// Selection controls (Figma 33:110): Tick tile (checkbox), Toggle (switch), Segmented (tabs).
import { Check } from 'lucide-react';
import { Checkbox, Switch, Tabs } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cx } from '../cx';

export function TickTile({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cx(
        'flex min-h-[54px] cursor-pointer items-center gap-3 rounded-md border p-3.5 text-body font-semibold text-ink',
        checked ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:bg-subtle',
        disabled && 'cursor-not-allowed opacity-55',
      )}
    >
      <Checkbox.Root
        id={id}
        checked={checked}
        disabled={disabled ?? false}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className={cx(
          'flex size-6 shrink-0 items-center justify-center rounded-[6px] border-2',
          checked ? 'border-primary bg-primary text-on-primary' : 'border-control bg-surface',
        )}
      >
        <Checkbox.Indicator>
          <Check size={18} strokeWidth={3} aria-hidden="true" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      {label}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3">
      <Switch.Root
        id={id}
        checked={checked}
        disabled={disabled ?? false}
        onCheckedChange={onCheckedChange}
        className={cx(
          'relative h-8 w-14 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-control',
          disabled && 'opacity-55',
        )}
      >
        <Switch.Thumb className="block size-6 translate-x-1 rounded-full bg-surface shadow-card transition-transform data-[state=checked]:translate-x-7" />
      </Switch.Root>
      <label htmlFor={id} className="text-body text-ink">
        {label}
      </label>
    </div>
  );
}

export type SegmentedItem = { value: string; label: string; content?: ReactNode };

/** Segmented control with tab semantics: one panel per item (e.g. "Student or staff" | "Visitor"). */
export function Segmented({
  label,
  items,
  value,
  onValueChange,
  className,
}: {
  label: string;
  items: SegmentedItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange} className={className}>
      <Tabs.List aria-label={label} className="flex min-h-12 gap-1 rounded-[14px] bg-subtle p-1">
        {items.map((item) => (
          <Tabs.Trigger
            key={item.value}
            value={item.value}
            className="min-h-10 flex-1 rounded-[10px] px-4 text-body font-semibold text-muted data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-card"
          >
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {items.map((item) =>
        item.content === undefined ? null : (
          <Tabs.Content key={item.value} value={item.value} className="outline-none">
            {item.content}
          </Tabs.Content>
        ),
      )}
    </Tabs.Root>
  );
}
