# Phase 1 report: report and intake

Date: 10 Nov 2026 · Scope: plan v0.3 §14 phase 1 (WF-02, WF-03, photo pipeline, labels and bins, gallery, search, sensitive lane, ID card fast lane) · Plan: [docs/plan/phase-1-implementation-plan.md](../plan/phase-1-implementation-plan.md)

**Summary.** A student can post a found item and get an FND ID, a QR and a 48-hour hand-in deadline. While they fill the form, the "Someone lost this?" panel shows similar open lost reports, and they can ping an owner anonymously. The desk logs walk-in items in four steps, or receives a student's post by typing or scanning its ID. Each item gets a suggested bin and a printable A4 label. Students browse the gallery and search it. Sensitive items never show a photo, ID cards are never listed, and their owners are emailed at once through the registrar adapter. The top bar no longer shows any prototype controls; they moved to `/dev/tools`.

## What was built

| Area                               | What works                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photos (FR-05, ADR-0007)           | `POST /api/photos`: the browser shrinks to 1600 px, then the server sniffs the file type, decodes with limits, rotates, re-encodes to WebP within 500 KB without metadata, and stores it in MinIO. Photos start "unattached" and are deleted after 7 days if never used. `GET /api/photos/{id}` checks who may see each photo (uploader, desk, or students once the item is public).        |
| Student post (WF-02, US-02, NF-01) | `/found/new` (Figma 39:8079): one page in four sections, an autosaved draft (without the private note), category-specific tick boxes, and the live panel with up to 5 similar reports and plain reasons. Neither side sees the other's name. "This might be theirs" notifies the owner by alert and email. `/found/:id/posted` (39:9137) shows the QR, deadline, office and a print option. |
| Hand-in timer (CC-03)              | Hourly job: reminds the finder at 24 h; at 48 h the post becomes NOT_RECEIVED and pinged owners are told. A late item can still be received (REOPEN, then RECEIVE_AT_DESK).                                                                                                                                                                                                                 |
| Desk intake (WF-03, US-03)         | `/desk/log` (39:16020–39:17629): photo, category (restricted ones included), where/when/condition with a damage photo, private ticks and note, ID or card number, then check and save with a suggested bin. Restricted items are never shelved ("hand it to security today"). Saving goes to the label (39:18010).                                                                          |
| Receive a student post             | Type or scan the FND ID (any case, no dashes, or the label link) in "Student brought a QR code?". The form fills from the post; saving moves it to IN_CUSTODY, makes its photos visible, and tells pinged owners it arrived.                                                                                                                                                                |
| ID card fast lane (NF-02, CC-06)   | For University ID the number is required, stored encrypted and shown as `••••5042`. The registrar adapter finds the owner (a fictional directory locally, limited to the tenant's email domain), who is emailed and alerted immediately. The card is never in the gallery.                                                                                                                  |
| Labels and bins (FR-13)            | Figma bin codes: S (small valuables), A (accessories), B (bags, umbrellas, books), C (clothing). The suggestion is the least-full bin on the right shelf. The QR encodes `<origin>/i/<FND-ID>`, which opens the record for desk staff and the post for its finder. Labels print in the first position of an Avery L7165 A4 sheet.                                                           |
| Gallery and search (FR-10)         | `/gallery` (39:1542) shows IN_CUSTODY, claim-under-review and ready-for-pickup items, with word search (pg_trgm), building, date and category filters. Sensitive items show "Photo hidden". Visitors get no gallery.                                                                                                                                                                        |
| Desk views                         | Desk home with the Today list (39:11179), "Find an item" by ID or words (39:12155), the item record with history and private details (39:13027), corrections that need a reason and go into the history (39:14473), "Mark VOID" (supervisor-only once an item is in custody), and More (39:11754).                                                                                          |
| Alerts (FR-09)                     | In-app alerts with an unread count in the nav (39:2896), plus email. Emails are queued as jobs in the same transaction, so a rolled-back change never sends anything. Visitors' placeholder addresses are never emailed.                                                                                                                                                                    |
| Lost reports                       | Photos on step 2 (replacing "coming soon"). On submit, up to 5 similar items already in custody are shown with reasons (CC-05).                                                                                                                                                                                                                                                             |
| My activity                        | Lost and Found tabs (39:2534).                                                                                                                                                                                                                                                                                                                                                              |

## Decisions (best guesses; plan §"Decisions" lists them all)

- Photos are streamed by the API instead of signed storage URLs: a permission check on every view, and the CSP stays closed.
- QR codes are generated on the server (SVG data URI), so the browser ships no QR library. A USB scanner types the label link, which the ID field accepts. There's no camera scanning in the browser.
- Item bookkeeping (bins, labels) lives in `items` for now. A separate `custody` module waits until shelf checks and outage sheets arrive in Phase 4.
- Job names live in `platform/jobs/names.ts`, so `items` never imports `matching` (no module cycle).
- Retention is 60 days (`found_item.retention_days`) from arrival at the desk. The Figma example shows "65 days" and the SRS gives no number.
- Who may post found items: students and desk staff. Visitors may not (SRS roles).

## Deviations from Figma

| Screen          | Figma                                          | Built                                                  | Why                                                                          |
| --------------- | ---------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Desk step 2     | No colour picker                               | Colour chips added                                     | Colour is part of the FR-07 score; without it, desk-logged items match worse |
| Desk record     | "Merge duplicate" button                       | Not shown (`docs/todo.md#merge`)                       | Merging needs redirect rules for the old ID; it's in the Phase 4 list        |
| Desk home       | "Hand an item back", "Check claims" active     | Shown with a "Next update" badge                       | Claims and pickups are Phase 3                                               |
| Office location | "Library, Room LIB-012" on some frames         | "Admin Building, Ground floor, Security Room"          | Plan §9.4 (same as Phase 0)                                                  |
| Desk header     | "DESK · ROOM LIB-012" subtitle and Help button | Normal header                                          | Help how-tos and the desk room label wait for Phase 5 (demo hardening)       |
| More            | Six working entries                            | Practice mode works; the other five say "Later update" | Phases 3–4                                                                   |

## Tests

| Layer                                                  | Result                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (domain, contracts, tokens, platform, lint rules) | All pass. New: FR-07 match score, shelves and bins, masking, tick boxes, including fast-check properties. Domain coverage: 100% statements, functions and lines; 95.9% branches (floor 95%)                                                         |
| API (two tenants, `expectNoLeak` on every response)    | 115 tests, all pass. 33 routes, all covered (`pnpm check:routes`)                                                                                                                                                                                   |
| End-to-end (Playwright + axe, 360 and 1280 px)         | 3 new journeys: student post → desk receive; walk-in log → find → correct; gallery, alerts and the visitor restrictions. All pass, with 0 serious or critical axe findings                                                                          |
| Gates                                                  | Typecheck, lint, squawk (5 migrations, 0 issues), client drift, production bundle check, `pnpm audit --prod` and gitleaks all pass. Semgrep still fails only on the two supply-chain settings waiting for your decision (Phase 0 report, section 6) |

The ESLint script now runs with a 4 GB heap: type-aware linting of about 200 files needed more than Node's default 2 GB. No rules changed.

## Library notes

- `@hono/zod-openapi` can't describe Zod 4's `z.file()`. The upload part is `z.custom<File>()` with `.openapi({ type: 'string', format: 'binary' })`.
- Hono's `except()` from `hono/combine` gives `/api/photos` a 10 MB body limit while every other route keeps 1 MB.
- `sharp` 0.35.5 ships prebuilt binaries, so it needs no install script. `.withExif()` is used in tests to prove metadata is removed.
- `pg_trgm` is a trusted extension, so the database owner creates it in a custom migration (`0003_pg_trgm.sql`).

## Open questions

1. Retention period: 60 days is a guess. Should look-alike items (umbrellas, chargers) get a shorter one (CC-02)?
2. Registrar: who provides the RDS connection, and is an email address enough to identify the owner?
3. Label printers: is the A4 Avery L7165 sheet right for NSU, or is there a thermal printer?
4. Should desk staff see the gallery in their own navigation? They can reach it by URL now.
