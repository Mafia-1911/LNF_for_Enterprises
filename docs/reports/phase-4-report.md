# Phase 4 report: supervisor and timers

Date: 11 Nov 2026 · Scope: plan v0.3 §14 phase 4 (timers, retention, dispatch directory and export, disputes, flags, policies, staff, paper register import, outage sheets) · Previous: [phase 3](phase-3-report.md)

**Summary.** The supervisor now has their own screens, with a sidebar as in Figma 39:20616:

- **Supervise:** Overview, Approvals, Retention, Dispatch directory, Disputes, Flags.
- **Desk:** Desk actions.
- **Manage:** Reports, Paper register, Policies, Staff.

The timers run as jobs: retention daily, lost-report expiry hourly, alongside the existing hand-in and pickup timers. The desk also gained outage label sheets, proxy pickup, walk-in reports and duplicate merging. Every corner case CC-01 to CC-17 has a passing test (table below), which is the plan's "done when".

As asked, this phase was built **showable first**: every feature works end to end and has API and e2e tests, while rare edge cases and mutation-score work are listed in `docs/todo.md#deepen-4`.

## What was built

| Area                               | What works                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retention (WF-05, CC-02, NF-09)    | Daily job (00:30 Dhaka): recalculates every end date from the policy (60 days, 30 for look-alikes), "Keep longer" days and closure pauses; moves items past it to EXPIRED; sends owners of similar open reports one last-chance alert 7 days before.                         |
| Retention & disposal (39:21973)    | Awaiting decision, Ending within 14 days, and Decided. Donate, transfer or dispose of one item or many, with a required note. "Keep longer" gives 30 more days from today. "Run daily job now".                                                                              |
| Lost-report expiry (WF-01)         | Hourly: "Your report expires in 2 days", then EXPIRED with a renew link. Renewing clears the reminder.                                                                                                                                                                       |
| Overview (39:20616)                | In custody, Claims to review, Returned (30 days), Expiring this week; Needs your decision (retention, overdue reviews, disputes, approvals); Latest activity from the audit log; the desk's Today list. Sidebar badges.                                                      |
| Policies (39:26930)                | Proxy pickup, retention, look-alike retention, pickup window, active claim cap, all audited. Changes apply straight away: retention ends are recalculated, and claims use the cap and window. Holiday pause: add or remove closures (retention pauses, and no working days). |
| Staff (39:27640)                   | Add a desk officer or supervisor by university email. People who haven't signed in yet are invited, and get the role on their first single sign-on. Deactivate removes desk access, but you can't remove yourself.                                                           |
| Dispatch directory (39:22656)      | Search by DSP ID, FND ID, claimant name or ID last 4, plus date range and category. CSV export (cells quoted, formulas defused) and a printable page (browser "Save as PDF"). Editable/Locked (24 h), Dispute and amendment badges. Record page with item history.           |
| Amendments (FR-17)                 | Corrections are added with a reason, by whom and when. The DSP record itself never changes.                                                                                                                                                                                  |
| Disputes (WF-06, 39:23422)         | A losing claimant can dispute within 7 days, and an owner can report a wrong handover ("Dispute" on the claim page). Supervisors get an alert, add notes (append-only), and uphold or reject, optionally flagging the recipient (CC-14). The raiser is told.                 |
| Flags (39:23882)                   | Repeat no-show finders (2+ posts not handed in), claimants paused after 3 failed verifications in 7 days, wrong recipients. "Review done — clear" hides a flag until new evidence arrives and lifts a claim pause (CC-15 "pending review").                                  |
| Approvals (39:21514)               | At handover the desk taps "Ask a supervisor" for a high-value item; the request appears on Approvals; once approved, the officer can choose "Supervisor approved" and finish (CC-08, CC-10).                                                                                 |
| Loss hotspots (39:25136, NF-07)    | 30/90/180 days: records in range, top hotspot, peak hour, return rate; by building, floor, hour of day and category.                                                                                                                                                         |
| Paper register (39:26196, WF-07)   | Fast table entry, or download the CSV template and upload it. Rows become FND items marked "migrated", in custody from their logbook date. Notes are private to staff. Errors point at the row and cell.                                                                     |
| Outage label sheets (NF-04, CC-17) | Desk → More: reserve 6–48 FND IDs from the normal series and print a sheet with QR codes. Later, "Enter now" opens the log flow under that ID with the time it was tagged, and retention counts from then.                                                                   |
| Proxy pickup (CC-09)               | If the policy allows, an approved owner nominates someone by university ID (encrypted; shown as ••••0613). At the desk: "Who is collecting?", and the proxy's ID must match. The DSP records both names.                                                                     |
| Walk-in (US-10)                    | Desk → More → Help a walk-in student: the lost report belongs to the student, by university email.                                                                                                                                                                           |
| Duplicates (CC-04)                 | The desk record lists records of the same category, place and day. "Merge into this record" marks the duplicate VOID, points it to the kept one, and tells the finder.                                                                                                       |

## Corner cases (Phase 4 "done when")

| CC    | Test                                                                                                                                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CC-01 | `claims.api` (side-by-side review, losing claimants told), `supervisor-records.api` (dispute within 7 days)                                                                                          |
| CC-02 | `supervisor.api` and `found-items.api` (look-alikes: 30-day retention), `desk-extras.api` (look-alike claims ask for a distinguishing mark; with none, only a supervisor approves; added in phase 5) |
| CC-03 | `found-items-timers.api` (24 h reminder, 48 h NOT_RECEIVED, pinged owners told), `supervisor-records.api` (repeat no-shows flagged)                                                                  |
| CC-04 | `desk-extras.api` (duplicate listed and merged, old ID points to the kept record)                                                                                                                    |
| CC-05 | `claims.api` (a new report is matched against items already in custody)                                                                                                                              |
| CC-06 | `found-items.api` (sensitive photo hidden, number masked to the last 4)                                                                                                                              |
| CC-07 | `claims.api` (cash: amount question and recount second check)                                                                                                                                        |
| CC-08 | `claims.api` (second check required), `supervisor-records.api` (supervisor approval)                                                                                                                 |
| CC-09 | `desk-extras.api` (proxy nominated, ID checked, both on the DSP; refused when the policy is off)                                                                                                     |
| CC-10 | `claims.api`, `supervisor-records.api` (visitor plus high-value item needs a supervisor)                                                                                                             |
| CC-11 | `claims-timers.api` (one reminder, lapse, back in custody, one re-request)                                                                                                                           |
| CC-12 | `found-items.api` (restricted items transferred, never shelved)                                                                                                                                      |
| CC-13 | `found-items.api` (condition note and photos at intake)                                                                                                                                              |
| CC-14 | `supervisor-records.api` (wrong handover dispute, recipient flagged)                                                                                                                                 |
| CC-15 | `claims.api` (3-claim cap, pause), `supervisor-records.api` (flagged; clearing lifts the pause)                                                                                                      |
| CC-16 | `claims.api` (withdraw cancels open claims)                                                                                                                                                          |
| CC-17 | `supervisor-reports.api` (entered later under the printed ID with the original intake time)                                                                                                          |

## Decisions and deviations

- **New `supervision` module.** It sits at the top of the dependency chain and owns no tables. Retention decisions stay in `items`, and disputes and the directory in `dispatch`, because those modules own the records.
- **Look-alike categories:** umbrella, bottle, charger, keys, calculator (the Figma policy text).
- **Holiday pause:** pauses on closures and semester breaks, not single public holidays. Closures also count as non-working days for the review and pickup deadlines. A closure can be at most 120 days, and closures can't overlap.
- **Keep longer** adds 30 days from today (not from the old end), so an item that expired weeks ago doesn't expire again on the next run.
- **Timer side effects** (EXPIRE, last-chance alerts) are audited as `system:found-item-retention`, even when a supervisor presses "Run daily job now"; the run itself is audited under the supervisor.
- **Staff deactivation** makes the person an ordinary university member again rather than deleting them; the audit keeps the history.
- **Disputes** are raised by the claimant from their claim page. The desk can't raise one on someone's behalf yet.
- **CSV export path** is `/api/supervisor/exports/dispatches.csv`. Under `/dispatches/` it collided with `/dispatches/{id}` in route coverage. The PDF is the browser's print-to-PDF of a print-styled page (zero cost).
- **Paper register:** the Figma "Zone" column is dropped; put it in the logbook note. Rows are validated all at once, and errors are keyed `rows.<n>.<field>`.
- **SMS alerts:** the toggle is shown disabled with "Coming later" (needs a paid provider; `todo#sms`).
- **Drop points (P2)** and the **shelf check (FR-15, P1)** are not built (`todo#drop-points`, `todo#shelf-check`). **Undo within 10 minutes** is also not built yet (`todo#undo`).
- **Squawk:** foreign keys added to the existing `claims` table are `NOT VALID` in 0007 and validated in 0008, as squawk recommends. All 10 migrations pass.

## Tests

| Layer                           | Result                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain                          | 473 pass. New: retention end with pauses (fast-check property), look-alikes, reminder windows, KEEP and dispute lifecycles. Mutation score 94.55% (from Phase 3) |
| API (two tenants)               | 156 pass (23 new across 4 files). All 82 routes covered                                                                                                          |
| End-to-end (360 + 1280 px, axe) | 28 pass, plus 4 desktop-only skips at 360 px. New: all supervisor screens, outage sheets, the walk-in start                                                      |

## Open questions

1. ~~Should look-alike claims require a distinguishing mark (CC-02)?~~ Built in phase 5: yes, and a supervisor decides when there is none.
2. Retention for paper-register items starts on the logbook date, so old items go straight to "Awaiting decision". Is that what the office wants on the first import?
3. Should staff deactivation also sign the person out immediately? Today their next request is refused.
