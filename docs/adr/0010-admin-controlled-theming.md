# ADR-0010: Design tokens and admin-controlled theming

Status: accepted · 2026-11-09

## Context

The Figma file defines 4 colour themes × light/dark as variables. The product owner decided that only the System Admin (IT) role may change the theme, including custom palettes; no other user can.

## Decision

- `docs/design/tokens.json` (exported from Figma) is the source; `packages/ui/scripts/build-tokens.ts` generates CSS variables for all 8 modes plus the accessibility additions (`border/control`, `status/on-danger`, `status/on-success`).
- The tenant's appearance is the `appearance` policy: `{ preset, mode: light|dark|system, custom? }`. `GET /api/theme` is public; `PUT /api/admin/theme` requires `it_admin`, validates colours and WCAG AA contrast, and writes an audit event.
- Default for NSU: Teal · Dark (every Figma screen uses it).
- The UI has no theme toggle. The dev-only `/dev/components` page previews every theme locally.

## Consequences

- Custom palettes override the brand tokens of a base preset; contrast is checked on save.
- Text sizes below 16 px in Figma are raised to 16 px (SRS), except the logo lockup subtitle.
