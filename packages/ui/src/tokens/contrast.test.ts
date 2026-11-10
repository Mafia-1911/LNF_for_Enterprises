// Every preset palette, in light and dark, keeps the colour pairs the components use readable
// (WCAG 2.1 AA: 4.5:1 for text, 3:1 for control boundaries). Fails the build if a token edit
// in docs/design/tokens.json breaks a pair.
import { describe, expect, it } from 'vitest';
import { THEME_PALETTES, type ColourToken } from './tokens';

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const BACKGROUNDS: ColourToken[] = ['bg/canvas', 'bg/surface', 'bg/muted'];
const TEXT_PAIRS: [ColourToken, ColourToken][] = [
  ...BACKGROUNDS.flatMap((bg): [ColourToken, ColourToken][] => [
    ['text/ink', bg],
    ['text/muted', bg],
  ]),
  ['brand/primary', 'bg/surface'],
  ['text/on-hero', 'bg/hero'],
  ['brand/on-primary', 'brand/primary'],
  ['brand/on-primary', 'brand/primary-strong'],
  ['brand/primary', 'brand/primary-soft'],
  ['brand/on-accent', 'brand/accent'],
  ['brand/accent-strong', 'brand/accent-soft'],
  ['status/success', 'status/success-soft'],
  ['status/warning', 'status/warning-soft'],
  ['status/danger', 'status/danger-soft'],
  ['status/info', 'status/info-soft'],
  ['status/on-danger', 'status/danger'],
  ['status/on-success', 'status/success'],
];
const CONTROL_PAIRS: [ColourToken, ColourToken][] = BACKGROUNDS.map((bg) => ['border/control', bg]);

const MODES = Object.entries(THEME_PALETTES).flatMap(([theme, modes]) =>
  (['light', 'dark'] as const).map((mode) => ({ name: `${theme}-${mode}`, palette: modes[mode] })),
);

describe.each(MODES)('$name palette', ({ palette }) => {
  it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(CONTROL_PAIRS)('%s against %s is at least 3:1', (fg, bg) => {
    expect(ratio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(3);
  });
});
