// Category tile and colour chip (Figma 33:159), plus the building choice cards (Figma 39:4998).
// All are radio groups: arrow keys move, Space selects. Categories are always large icons.
import { RadioGroup } from 'radix-ui';
import { cx } from '../cx';
import { CategoryIcon } from './CategoryIcon';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export type CategoryOption = { code: string; label: string; restricted?: boolean };

export function CategoryPicker({
  label,
  options,
  value,
  onValueChange,
  invalid,
}: {
  label: string;
  options: CategoryOption[];
  value: string | null;
  onValueChange: (code: string) => void;
  invalid?: boolean;
}) {
  return (
    <RadioGroup.Root
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      value={value ?? ''}
      onValueChange={onValueChange}
      className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5"
    >
      {options.map((o) => (
        <CategoryTile key={o.code} option={o} />
      ))}
    </RadioGroup.Root>
  );
}

export function CategoryTile({ option }: { option: CategoryOption }) {
  return (
    <RadioGroup.Item
      value={option.code}
      className={cx(
        'flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-transparent px-2 py-3 text-label font-semibold',
        option.restricted ? 'bg-danger-soft text-danger' : 'bg-subtle text-ink hover:border-line',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft data-[state=checked]:text-primary',
        focusRing,
      )}
    >
      <CategoryIcon code={option.code} />
      <span className="text-center">{option.label}</span>
    </RadioGroup.Item>
  );
}

export type ColourOption = { code: string; label: string; swatch: string };

export function ColourPicker({
  label,
  options,
  value,
  onValueChange,
}: {
  label: string;
  options: ColourOption[];
  value: string | null;
  onValueChange: (code: string) => void;
}) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value ?? ''}
      onValueChange={onValueChange}
      orientation="horizontal"
      className="flex flex-wrap gap-2"
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.code}
          value={o.code}
          className={cx(
            'inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-line bg-surface py-1 pr-3.5 pl-1 text-label font-semibold text-ink hover:bg-subtle',
            'data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft',
            focusRing,
          )}
        >
          <Swatch swatch={o.swatch} />
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

export function Swatch({ swatch, size = 28 }: { swatch: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block shrink-0 rounded-full ring-1 ring-ink/10',
        swatch === 'multi' && 'lf-swatch-multi',
      )}
      style={{
        width: size,
        height: size,
        ...(swatch === 'multi' ? {} : { backgroundColor: swatch }),
      }}
    />
  );
}

export type ChoiceCardOption = { value: string; code: string; label: string; dashed?: boolean };

/** Building picker: short code over the name (Figma 39:4998), with a dashed "Not sure" card. */
export function ChoiceCards({
  label,
  options,
  value,
  onValueChange,
}: {
  label: string;
  options: ChoiceCardOption[];
  value: string | null;
  onValueChange: (value: string) => void;
}) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value ?? ''}
      onValueChange={onValueChange}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cx(
            'flex min-h-[62px] flex-col items-start justify-center rounded-md border bg-surface px-3 py-2 text-left',
            o.dashed ? 'border-dashed border-control' : 'border-line',
            'hover:bg-subtle data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft',
            focusRing,
          )}
        >
          <span className="text-label font-semibold tracking-wide text-muted uppercase">
            {o.code}
          </span>
          <span className="text-label font-semibold text-ink">{o.label}</span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
