// Applies the university's theme (set by the IT admin, ADR-0010). People can't change it.
import type { Appearance, BrandToken } from '@lf/contracts';
import { THEME_PALETTES } from '@lf/ui/tokens';

const STYLE_ID = 'lf-custom-theme';

function customCss(appearance: Appearance): string {
  if (!appearance.custom) return '';
  const base = THEME_PALETTES[appearance.preset];
  const vars = (mode: 'light' | 'dark') => {
    const merged: Record<string, string> = {
      ...base[mode],
      ...(appearance.custom?.[mode] as Record<BrandToken, string>),
    };
    // Colour values were validated as #rrggbb by the server contract.
    return Object.entries(merged)
      .filter(([, v]) => /^#[0-9a-f]{6,8}$/i.test(v))
      .map(([k, v]) => `--lf-${k.replace('/', '-')}: ${v};`)
      .join(' ');
  };
  return [
    `[data-theme='custom'][data-mode='light'], [data-theme='custom'][data-mode='system'] { color-scheme: light; ${vars('light')} }`,
    `[data-theme='custom'][data-mode='dark'] { color-scheme: dark; ${vars('dark')} }`,
    `@media (prefers-color-scheme: dark) { [data-theme='custom'][data-mode='system'] { color-scheme: dark; ${vars('dark')} } }`,
  ].join('\n');
}

export function applyAppearance(
  appearance: Appearance,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset['theme'] = appearance.custom ? 'custom' : appearance.preset;
  root.dataset['mode'] = appearance.mode;
  let style = document.getElementById(STYLE_ID);
  const css = customCss(appearance);
  if (css) {
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = css;
  } else {
    style?.remove();
  }
  try {
    window.localStorage.setItem('lf.appearance', JSON.stringify(appearance));
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
}
