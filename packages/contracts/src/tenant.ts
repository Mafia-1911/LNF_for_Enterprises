import { z } from 'zod';
import { contrastRatio } from './contrast';

export const THEME_PRESETS = ['navy', 'forest', 'indigo', 'teal'] as const;
export const THEME_MODES = ['light', 'dark', 'system'] as const;

/** The brand tokens an IT admin may override in a custom palette (names match docs/design/tokens.json). */
export const BRAND_TOKENS = [
  'brand/primary',
  'brand/primary-strong',
  'brand/on-primary',
  'brand/primary-soft',
  'brand/accent',
  'brand/accent-strong',
  'brand/on-accent',
  'brand/accent-soft',
] as const;
export type BrandToken = (typeof BRAND_TOKENS)[number];

const hex = z.string().regex(/^#[0-9a-f]{6}$/, 'Use a 6-digit hex colour such as #0b6e6e.');
const BrandPaletteSchema = z.object(
  Object.fromEntries(BRAND_TOKENS.map((t) => [t, hex])) as Record<BrandToken, typeof hex>,
);
export type BrandPalette = z.infer<typeof BrandPaletteSchema>;

/** Pairs a custom palette must keep readable (WCAG 2.1 AA, 4.5:1 for text). */
export const CONTRAST_PAIRS: readonly [BrandToken, BrandToken, string][] = [
  ['brand/on-primary', 'brand/primary', 'text on primary buttons'],
  ['brand/on-primary', 'brand/primary-strong', 'text on hovered primary buttons'],
  ['brand/primary', 'brand/primary-soft', 'selected tiles and soft buttons'],
  ['brand/on-accent', 'brand/accent', 'text on accent buttons'],
  ['brand/accent-strong', 'brand/accent-soft', 'accent badges'],
];

function checkPalette(palette: BrandPalette, mode: 'light' | 'dark', ctx: z.RefinementCtx) {
  for (const [fg, bg, use] of CONTRAST_PAIRS) {
    const ratio = contrastRatio(palette[fg], palette[bg]);
    if (ratio < 4.5) {
      ctx.addIssue({
        code: 'custom',
        path: ['custom', mode, fg],
        message: `${fg} on ${bg} (${use}) has contrast ${ratio.toFixed(2)}:1; pick colours with at least 4.5:1.`,
      });
    }
  }
}

export const AppearanceSchema = z
  .object({
    preset: z.enum(THEME_PRESETS),
    mode: z.enum(THEME_MODES),
    /** Custom brand colours on top of `preset`; null uses the preset as designed. */
    custom: z.object({ light: BrandPaletteSchema, dark: BrandPaletteSchema }).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.custom) {
      checkPalette(value.custom.light, 'light', ctx);
      checkPalette(value.custom.dark, 'dark', ctx);
    }
  })
  .meta({ id: 'Appearance' });
export type Appearance = z.infer<typeof AppearanceSchema>;

export const DEFAULT_APPEARANCE: Appearance = { preset: 'teal', mode: 'dark', custom: null };

export const TenantSummarySchema = z
  .object({
    name: z.string(),
    shortName: z.string(),
    emailDomain: z.string(),
    isPractice: z.boolean(),
  })
  .meta({ id: 'TenantSummary' });

export const TenantInfoSchema = z
  .object({
    tenant: TenantSummarySchema,
    appearance: AppearanceSchema,
    /** Where found items are kept and when the desk is open. */
    office: z.object({ name: z.string(), location: z.string(), hours: z.string() }).nullable(),
  })
  .meta({ id: 'TenantInfo' });
export type TenantInfo = z.infer<typeof TenantInfoSchema>;
