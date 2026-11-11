# Phase 3 report: match, claim, hand back

Date: 11 Nov 2026 · Scope: plan v0.3 §14 phase 3 (matching and alerts, claims, side-by-side review, pickup codes, hand-back with checks, signature, DSP) · Previous: [phase 1](phase-1-report.md)

**Summary.** WF-04 now works end to end:

1. An owner is alerted when a likely match reaches the desk, or sees it under "Likely matches in custody" on their report.
2. They tap "This is mine" and answer 2–3 questions built from details recorded at intake.
3. The desk reviews every claim on the item side by side and approves one.
4. The owner gets a 6-digit pickup code and a 3-working-day window.
5. At the desk the officer enters the code, fetches the item from the shown bin, checks the ID (plus a second check for high-value items), and takes a signature.
6. That creates a DSP record. The item is DISPATCHED, the claim COLLECTED and the lost report RESOLVED, and the finder is told.

## What was built

| Area                                  | What works                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matching (FR-07, US-04)               | Two jobs, `match-found-item` (when an item reaches the desk) and `match-lost-report` (on submit), score with the shared FR-07 rules and store each pair's score and reasons. An owner is alerted at most once per pair (score ≥ 5), and their report moves to POSSIBLE_MATCH. Pairs scoring ≥ 3 are listed on the report.                                                                                                                            |
| Lost report page (39:6605, 39:7051)   | Status track; "Open until" with one-tap renew (twice at most); "I found it myself" closes the report and cancels its open claims (US-12, CC-16); likely matches with "This is mine".                                                                                                                                                                                                                                                                 |
| Claim form (NF-03, FR-11)             | Questions come from the private ticks (e.g. "What was inside?"), topped up to 2–3 with general ones. Optional link to my lost report, plus a proof photo (staff only). Answers are encrypted. Limits: 3 open claims per person, one claim per item, no claiming your own find. After 3 failed verifications in 7 days, claims are paused (CC-15).                                                                                                    |
| Desk review (FR-12, 39:15356)         | The item and what was recorded at intake on the left, each claim's answers next to it, with Pass/Fail per answer and Approve, Reject or Ask for more. Approval needs every answer marked Pass, creates the code and window, moves the item to READY_FOR_PICKUP, and closes the other claims with a notice that the owner can dispute within 7 days (CC-01). Rejecting the last claim returns the item to the shelf and the report to POSSIBLE_MATCH. |
| My claim page                         | Status track, the desk's question with an answer box, and the pickup code with deadline, office and the ID to bring. Withdraw, or re-request once after a lapse (CC-11). The code is never emailed.                                                                                                                                                                                                                                                  |
| Pickup timer (CC-11)                  | Hourly: one reminder a day before the window closes. Then the claim lapses, the item goes back IN_CUSTODY, and the owner is told.                                                                                                                                                                                                                                                                                                                    |
| Hand an item back (39:18978–39:20329) | Step 1, the code (wrong codes get Figma's message). Step 2, fetch from the bin, check the person against their ID, and type the ID's last 4. For high-value items there's a second check (device unlocked, serial/IMEI, cash recounted, or supervisor). A visitor collecting a high-value item needs a supervisor on their own account (CC-10). Step 3, a signature on screen, saved through the photo pipeline. Then "Handed over" with the DSP ID. |
| Desk home                             | "Hand an item back" and "Check claims" are live. Today shows claims to review and pickups due.                                                                                                                                                                                                                                                                                                                                                       |

## Decisions and deviations

- **Lost-report lifecycle:** two additions. An owner may claim straight from OPEN (a gallery claim before any match alert), and CLAIM_ENDED (system) returns a CLAIMED report to POSSIBLE_MATCH when its claim is rejected, withdrawn or lapses. The hand-written transition table in the domain tests was updated to match.
- **Side effects as the system:** a claim moving the item to CLAIM_PENDING, or a lapse returning it, is audited as `system:claims`, not as the student.
- **Account photo:** Figma shows "The person matches the account photo", but accounts have no photos (no face photos in the repo). The tick reads "The person matches the photo on their university ID" (or NID/passport for visitors).
- **Demo codes on the pickup screen:** Figma lists demo pickup codes. They're not shown anywhere; tests read the code from the claimant's page.
- **Student claim form:** there's no Figma frame, so it's built from the lost-report components (item card, questions, optional report link and proof photo).
- **Not in this phase:** proxy pickup (CC-09), the desk filing a claim for a walk-in (US-10), undo within 10 minutes, DSP amendments after the 24 h lock (FR-17), and disputes (WF-06). They're in `docs/todo.md` for Phase 4.

## Tests

| Layer                           | Result                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain                          | 461 pass. New: claim questions (fast-check property), high-value list, working-day deadlines, the new lost-report transitions. Mutation score 94.55% (matching 98%, claims 98%, private details 100%) |
| API (two tenants)               | 133 tests pass (18 new). 49 routes covered                                                                                                                                                            |
| End-to-end (360 + 1280 px, axe) | New: claim → review → pickup code → handover with a drawn signature; lost report renew and "I found it myself". The whole suite passes (17 tests, plus 4 desktop-only skips at 360 px)                |

## Open questions

1. Should a report in POSSIBLE_MATCH be renewable too? Today only OPEN and EXPIRED reports can be renewed.
2. Pickup window: 3 working days ending at 17:00 Dhaka. Is that the office's real closing time?
3. Is the alert threshold (score 5, e.g. same colour and same building) too eager or too strict once real data arrives?
