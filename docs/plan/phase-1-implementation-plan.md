# Phase 1 implementation plan: report and intake

Status: in progress · Written 10 Nov 2026 · Scope: plan v0.3 §14 phase 1 (WF-02, WF-03, photo pipeline, labels and bins, gallery, search, sensitive lane, ID card fast lane), with the zero-cost rules from the Phase 0 prompt.

## Screens (Figma, saved in `docs/design/screens/`)

| Screen                                   | Node                                           | Route                      |
| ---------------------------------------- | ---------------------------------------------- | -------------------------- |
| I found something (one page, live panel) | `39:8079`                                      | `/found/new`               |
| Found item posted (FND ID + QR)          | `39:9137`                                      | `/found/:id/posted`        |
| Gallery                                  | `39:1542`                                      | `/gallery`                 |
| Alerts                                   | `39:2896`                                      | `/alerts`                  |
| My activity                              | `39:2534`                                      | `/activity` (found + lost) |
| Desk home + Today                        | `39:11179`                                     | `/desk`                    |
| More                                     | `39:11754`                                     | `/desk/more`               |
| Log a found item, steps 1–4              | `39:16020`, `39:16781`, `39:17272`, `39:17629` | `/desk/log?step=`          |
| Saved + label                            | `39:18010`                                     | `/desk/items/:id/label`    |
| Find an item                             | `39:12155`                                     | `/desk/find`               |
| Item record (+ correct dialog)           | `39:13027`, `39:14473`                         | `/desk/items/:id`          |

## Modules (plan §3.1)

- `photos`: upload pipeline (§6.1), `photos` table, streaming GET with permission checks, daily cleanup job for unattached photos.
- `items`: `found_items` (+ the existing `private_details`), found-item transitions, student post, desk intake, receive at desk, correct, void, gallery and desk search.
- `custody`: bin suggestion and the label (QR) for an item.
- `matching`: rule-based score (FR-07) in `packages/domain`, the live "Someone lost this?" panel, anonymous pings (NF-01), and "similar in custody" on lost-report submit (replaces Phase 0's empty list).
- `notifications`: in-app alerts + email (FR-09). SMS stays out (cost).
- `integrations`: RDS (registrar) lookup behind an adapter for the ID card fast lane; a dev directory stands in.

## Decisions (best guesses, all listed in the phase report)

1. **Photos are streamed by the API** (`GET /api/photos/{id}`) after a permission check, not via signed storage URLs. Sensitive photos are staff-only; this also keeps the CSP closed to the storage host.
2. **QR encodes a link** `<app origin>/i/<FND-ID>`. A phone camera opens the record; a USB scanner (keyboard wedge) types the link into the "Scan or type FND ID" field, which accepts a link or an ID. No camera scanning in the browser.
3. **QR images are generated on the server** (`qrcode`, SVG → data URI) and returned with the label, so the browser ships no QR library.
4. **Bins** follow Figma's shelf codes: `S` small valuables, `A` accessories and electronics, `B` bags, umbrellas, books, `C` clothing. The suggested bin is the least-full bin on the category's shelf. Seeded: S-01…S-08, A-01…A-10, B-01…B-12, C-01…C-12.
5. **Gallery** lists `IN_CUSTODY`, `CLAIM_PENDING` ("Claim under review") and `READY_FOR_PICKUP` items. Never: restricted categories, University ID cards, items not yet at the desk. Sensitive categories show the category icon and "Photo hidden". Visitors get 403.
6. **Matching score** (FR-07): category must match; colour, brand, building, zone and overlapping time add points; up to 5 results with plain reasons. Pure function in `packages/domain`, property-tested. Phase 3 reuses it for alerts.
7. **Pings** ("This might be theirs") create an in-app alert + email for the lost report's owner. Neither side sees the other's name or contact. When the pinged item reaches the desk, or becomes NOT_RECEIVED, pinged owners are told.
8. **Hand-in timer**: an hourly job reminds the finder at 24 h and moves the item to NOT_RECEIVED at 48 h (tenant policy `found_item.hand_in_hours`), telling pinged owners.
9. **ID card fast lane** (NF-02): for `university_id`, the officer types the ID number. It is stored encrypted, shown masked to the last 4 digits, and looked up in the registrar adapter; the owner gets an email at once. Never in the gallery.
10. **Restricted categories** (weapon, drugs, university keys, hazardous) are logged at the desk only, get no bin, and show "Transfer to security today" (CC-12). Students can't pick them.
11. **Corrections** need a reason and add an audit event (`CORRECT`, with the reason as the note); records are never edited silently. Undo (10 minutes) is Phase 4.
12. **Desk "Today"** shows items to shelve (student posts awaiting hand-in) and expiring this week now; claims and pickups appear when Phase 3 adds them (sections show "Nothing waiting").
