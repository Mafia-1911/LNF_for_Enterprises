// IT admin only: the theme everyone in this university sees (ADR-0010). Presets come from the
// Figma colour collection; a custom palette overrides the 8 brand colours and must pass WCAG AA
// (checked by the server contract; failures are shown next to the colour).
import {
  BRAND_TOKENS,
  THEME_MODES,
  THEME_PRESETS,
  type Appearance,
  type BrandPalette,
} from '@lf/contracts';
import { Button, Card, Notice, Toggle, useToast } from '@lf/ui';
import { THEME_PALETTES } from '@lf/ui/tokens';
import { RadioGroup } from 'radix-ui';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useSetAppearance, useTenant } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { applyAppearance } from '../../lib/theme';

const PRESET_LABEL: Record<(typeof THEME_PRESETS)[number], string> = {
  navy: 'Academic navy + amber',
  forest: 'Forest green + cream',
  indigo: 'Deep indigo + coral',
  teal: 'Teal + sand',
};
const MODE_LABEL: Record<(typeof THEME_MODES)[number], string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Match each device',
};

function presetPalette(preset: Appearance['preset'], mode: 'light' | 'dark'): BrandPalette {
  const p = THEME_PALETTES[preset][mode] as Record<string, string>;
  return Object.fromEntries(BRAND_TOKENS.map((t) => [t, p[t] ?? '#000000'])) as BrandPalette;
}

export function AppearancePage() {
  const tenant = useTenant();
  if (tenant.isError) return <Notice tone="danger">{tenant.error.message}</Notice>;
  if (!tenant.data) return <p className="text-body text-muted">Loading…</p>;
  // The editor starts from the saved appearance and keeps its own draft until "Save".
  return <AppearanceEditor initial={tenant.data.appearance} />;
}

function AppearanceEditor({ initial }: { initial: Appearance }) {
  const save = useSetAppearance();
  const toast = useToast();
  const [draft, setDraft] = useState<Appearance>(initial);
  const [fields, setFields] = useState<Record<string, string>>({});

  const setCustom = (on: boolean) =>
    setDraft({
      ...draft,
      custom: on
        ? { light: presetPalette(draft.preset, 'light'), dark: presetPalette(draft.preset, 'dark') }
        : null,
    });

  async function onSave() {
    setFields({});
    try {
      const info = await save.mutateAsync(draft);
      applyAppearance(info.appearance);
      toast({ title: 'Theme updated for everyone at this university.' });
    } catch (err) {
      if (err instanceof ApiError) setFields(err.fields);
    }
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader eyebrow="IT administration" title="Appearance" />
      <p className="mt-2 text-body text-muted">
        Only IT administrators can change this. Students, visitors and staff always see the theme
        chosen here.
      </p>
      <Card className="mt-6 flex flex-col gap-8">
        <section aria-labelledby="preset-label">
          <h2 id="preset-label" className="text-heading-m font-bold text-ink">
            Colour theme
          </h2>
          <RadioGroup.Root
            aria-labelledby="preset-label"
            value={draft.preset}
            onValueChange={(v) =>
              setDraft({ ...draft, preset: v as Appearance['preset'], custom: null })
            }
            className="mt-3 grid gap-2 sm:grid-cols-2"
          >
            {THEME_PRESETS.map((p) => (
              <RadioGroup.Item
                key={p}
                value={p}
                className="flex min-h-14 items-center gap-3 rounded-md border-2 border-line bg-surface px-4 text-left text-body font-semibold text-ink data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft"
              >
                <span
                  aria-hidden="true"
                  className="relative size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-line"
                  style={{ background: THEME_PALETTES[p].light['brand/primary'] }}
                >
                  <span
                    className="absolute right-0 bottom-0 size-4 rounded-tl-full"
                    style={{ background: THEME_PALETTES[p].light['brand/accent'] }}
                  />
                </span>
                {PRESET_LABEL[p]}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </section>
        <section aria-labelledby="mode-label">
          <h2 id="mode-label" className="text-heading-m font-bold text-ink">
            Light or dark
          </h2>
          <RadioGroup.Root
            aria-labelledby="mode-label"
            value={draft.mode}
            onValueChange={(v) => setDraft({ ...draft, mode: v as Appearance['mode'] })}
            className="mt-3 flex flex-wrap gap-2"
          >
            {THEME_MODES.map((m) => (
              <RadioGroup.Item
                key={m}
                value={m}
                className="min-h-11 rounded-full border-2 border-line bg-surface px-4 text-body font-semibold text-ink data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft"
              >
                {MODE_LABEL[m]}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </section>
        <section aria-labelledby="custom-label" className="flex flex-col gap-4">
          <h2 id="custom-label" className="text-heading-m font-bold text-ink">
            Custom brand colours
          </h2>
          <Toggle
            label="Use custom brand colours on top of the theme"
            checked={draft.custom !== null}
            onCheckedChange={setCustom}
          />
          {draft.custom
            ? (['light', 'dark'] as const).map((mode) => (
                <fieldset key={mode} className="rounded-md border border-line p-4">
                  <legend className="px-1 text-body font-semibold text-ink">
                    {mode === 'light' ? 'Light mode' : 'Dark mode'}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {BRAND_TOKENS.map((token) => {
                      const error = fields[`custom.${mode}.${token}`];
                      return (
                        <label key={token} className="flex flex-col gap-1 text-body text-ink">
                          <span className="flex items-center gap-2">
                            <input
                              type="color"
                              value={draft.custom?.[mode][token]}
                              aria-invalid={error ? true : undefined}
                              onChange={(e) =>
                                draft.custom &&
                                setDraft({
                                  ...draft,
                                  custom: {
                                    ...draft.custom,
                                    [mode]: { ...draft.custom[mode], [token]: e.target.value },
                                  },
                                })
                              }
                              className="h-11 w-14 cursor-pointer rounded-sm border border-control bg-surface"
                            />
                            {token}
                          </span>
                          {error ? <span className="text-body text-danger">{error}</span> : null}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))
            : null}
        </section>
        {Object.keys(fields).length > 0 ? (
          <Notice tone="danger" live="assertive">
            Some colours are hard to read together; change the ones marked above and save again.
          </Notice>
        ) : null}
        <div className="flex justify-end">
          <Button loading={save.isPending} onClick={() => void onSave()}>
            Save for everyone
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default AppearancePage;
