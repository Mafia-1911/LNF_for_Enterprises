---
trigger: glob
globs: '{apps/web,packages/ui}/**'
description: Frontend conventions for the web app and UI package
---

# Frontend conventions

- Build screens from `packages/ui` components and token classes (`bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-primary`, …). No hex colours, no arbitrary Tailwind colour values, no inline colour styles.
- Visual source of truth: `docs/design/screens/<node>.png` and `.md`. Check the design notes before changing a screen. Figma wins on visuals unless plan §9 lists a fix.
- Minimum text size 16 px (`text-body` and up); touch targets at least 44 px tall. Every input has a visible label; every icon-only button has `aria-label`; focus is always visible.
- Users cannot change the theme. Theme comes from `GET /api/tenant` (`appearance`) and is applied by `lib/theme.ts`; only the IT admin Appearance page (`PUT /api/admin/appearance`) changes it.
- Call the API only through the generated client (`src/api/client.ts` + hooks). Run `pnpm gen:api` after changing a server route; CI fails if `src/api/schema.d.ts` is stale.
- Forms use React Hook Form with the Zod schema from `@lf/contracts`, so the browser and the server validate with the same rules.
- "Now" comes from `src/lib/clock.ts` (it follows the server's dev clock). `Date.now()`/`new Date()` are banned elsewhere by lint.
- Error copy is one sentence: what happened and what to do next. Never show error codes.
- Every new screen gets a Playwright test with an axe check (zero serious or critical violations) at 360 px and 1280 px.
- Dev-only things (prototype toolbar, `/dev/*` pages) are behind `__PROTOTYPE__` (false in production builds) and must not appear in production builds; `pnpm verify` checks the built bundle.
