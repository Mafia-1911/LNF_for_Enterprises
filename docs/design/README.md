# Design reference (saved from Figma)

Source of truth for visuals: Figma file `A49egsvB5hzErRhapPGDUQ` ("Website Design Lost and Found"), fetched 9 Nov 2026 through the Figma MCP. Work from these saved copies; call Figma again only when something is missing.

| Path                   | What                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `tokens.json`          | All variables: colour collection (8 modes = 4 themes × light/dark), size collection (radius, space, tap sizes), text styles, effect styles |
| `screens/<node>.png`   | Screenshot of each node used in phase 0                                                                                                    |
| `screens/<node>.md`    | Layout notes, copy, spacing, component names, build notes                                                                                  |
| `figma-ref/<node>.tsx` | Raw MCP reference code for the large screens (reference only, never copied)                                                                |
| `assets/<node>/`       | Images and icons exported with the reference code                                                                                          |

## Theme

Every screen in the file uses **Teal · Dark**, so it is the NSU default (`appearance` policy). Only the IT admin can change it (ADR-0010).

## Icons

The exported SVGs are Lucide icons (same paths, drawn at 20/24/28 px with matching stroke). The app uses `lucide-react` for exact matches; see `packages/ui/src/icons.ts` for the name map.

## Accessibility changes to Figma values

The text pairs all pass WCAG 2.1 AA in all 8 modes. These pairs fail and are changed in the build (prompt rule 7.10). Proposed values are the nearest passing colour, mixing `border/line` toward `text/muted` until it passes.

| Use                                                                                                  | Figma                                           | Contrast    | Build                                                                                   |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| Input, checkbox and toggle-off boundaries (WCAG 1.4.11, needs 3:1 against surface, canvas and muted) | `border/line`                                   | 1.28–1.68   | new token `border/control` (below)                                                      |
| Placeholder text                                                                                     | `text/muted` at 70 %                            | 3.24–4.46   | `text/muted` at 100 % (≥ 4.5)                                                           |
| Danger / success button labels in dark modes                                                         | `#ffffff` on `status/danger` / `status/success` | 2.55 / 2.16 | new tokens `status/on-danger`, `status/on-success` = the mode's `bg/canvas` (7.2 / 8.5) |
| Check icon on the success hero (dark modes, Teal light)                                              | `brand/accent` on `brand/primary`               | 1.06–2.77   | `brand/on-primary` (≥ 6)                                                                |

`border/control` values:

| Mode         | Value     | Worst contrast |
| ------------ | --------- | -------------- |
| navy-light   | `#838791` | 3.02           |
| navy-dark    | `#64718a` | 3.01           |
| forest-light | `#838877` | 3.02           |
| forest-dark  | `#677669` | 3.03           |
| indigo-light | `#87859f` | 3.03           |
| indigo-dark  | `#6a6889` | 3.04           |
| teal-light   | `#7a8b8c` | 3.03           |
| teal-dark    | `#5d7877` | 3.03           |

`status/on-danger` and `status/on-success` are `#ffffff` in light modes and the mode's `bg/canvas` in dark modes.

## Text size

The SRS sets a 16 px minimum. Figma styles below 16 px (Body/S 15, Label/M 15, Label/S 14, Caption 14, Overline 12) render at 16 px. The logo lockup subtitle keeps 12 px as part of the logo, and the dev-only prototype toolbar keeps its Figma sizes.

## Plan §9 fixes applied to these screens

- §9.4 office location: Admin Building, Ground floor, Security Room (the student home card that says "Library … LIB-012" is wrong).
- §9.5 "Claims Resolved within 30 Mins": replaced with "48 hours · to hand in a found item".
- §9.13 prototype toolbar: dev and staging builds only, wired to the server clock; it has no theme switcher because only the IT admin may change themes.
