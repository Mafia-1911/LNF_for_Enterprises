# Phase 5 report: demo hardening

Date: 12 Nov 2026 · Scope: plan v0.3 §14 phase 5 (accessibility audit, practice mode, monitoring, restore test, NFR-01 officer trial), plus a public demo · Previous: [phase 4](phase-4-report.md)

**Summary.** The build is showable end to end. Every screen has a help how-to for a new officer (NFR-01), the desk has the daily shelf check (FR-15, left over from phase 4), and the app runs as a public demo on Vercel's free plan at **https://lnf-for-enterprises.vercel.app**, deployed automatically from `main` once CI passes ([deploy-vercel.md](../deploy-vercel.md)). As asked, this phase is **showable first**: the officer trial and the restore drill need people and a real server, so they are listed below rather than faked.

## What was built

| Area                      | What works                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Help how-tos (NFR-01)     | A "Help" button on every screen opens short steps for that screen (`apps/web/src/lib/help.ts`), so a new officer can do intake and handover without training.                                     |
| Daily shelf check (FR-15) | Desk → More → Shelf check: items in custody bin by bin; tick present or missing. Missing items get a "Shelf check: missing" line in their history and are listed for follow-up.                   |
| Accessibility audit       | axe runs on every screen at 360 px and 1280 px in Playwright (32 tests). No serious or critical findings.                                                                                         |
| Practice mode             | The practice tenant (`practice.localhost:5173`) has the same people and catalog with sample records, so officers can rehearse without touching real data.                                         |
| Monitoring                | `/healthz` reports database, jobs and storage (503 when the database or jobs are down).                                                                                                           |
| Public demo (Vercel)      | `pnpm build:vercel` builds the web app in demo mode and bundles the server into one Node function. Photos can live in Postgres, queued jobs run after requests, and a daily cron runs the timers. |
| CI/CD                     | `verify` runs every gate on each push and pull request; `deploy` (main only, after `verify` passes) migrates and seeds the demo database, builds, deploys to Vercel and checks `/healthz`.        |

## Decisions and deviations

- **Demo mode is its own `APP_ENV`.** `APP_ENV=demo` with `NODE_ENV=production` keeps the production build, https and the "no `.env.example` secrets" check, but allows the dev adapters (SMS, registrar, memory email) and `/dev/tools` so visitors can "sign in as". `APP_ENV=production` is unchanged and still refuses all of them. Tested in `config.test.ts`.
- **Photos in Postgres for the demo** (`STORAGE_DRIVER=database`). Vercel has no S3, and a second storage service would be another sign-up. The `stored_objects` table is keyed tenant first like every other table, and the key is the same one the bucket would use.
- **Jobs without workers.** A serverless function can't keep pg-boss workers or its cron monitor alive. `drainJobs` runs queued jobs after a request (within 8 s), and `sendDueSchedules` queues each timer at most once per period (pg-boss singleton slots). A daily Vercel cron (the Hobby limit) covers days with no visitors. The VM keeps using normal workers.
- **Client IP behind a proxy.** `TRUSTED_CLIENT_IP_HEADER=x-real-ip` makes rate limits use the visitor's address on Vercel instead of the proxy's.
- **Generated API client is formatted.** `pnpm gen:api` now runs prettier on its output, so the "client up to date" check compares content rather than whitespace (it failed on every fresh run before).
- **Sign-in in the demo** is only "sign in as" on `/dev/tools`. There is no identity provider for SSO, and no email service for codes.
- **Supply-chain policy decided** (open since phase 0, and it kept CI red, so no deploy could follow): `minimumReleaseAge: 10080` (7 days) and `trustPolicy: no-downgrade`, as semgrep recommends. The exceptions are exact versions already in the lockfile: 74 releases younger than 7 days (they can go after 2026-11-19), and `undici-types@6.21.0` (type declarations only, needed by `@types/node@22`). This is stricter than before; to undo it, go back to `minimumReleaseAge: 1440` and accept the semgrep finding.
- **CI start-up diagnosis.** The first GitHub run failed while starting the local services, and its log needs admin rights to read. `scripts/infra-up.sh` now polls the one-shot bucket container instead of `compose wait` (which differs across Compose versions), and on failure prints each container's state and logs, also as a run annotation.
- **Deploys only from `main` after CI**, with no preview deploys: a preview would share the one demo database. Migrations run as Neon's owner role; the app connects as `lf_app`.

## Not done yet

| Item                                   | Why                                                                                                                                     | Anchor               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| NFR-01 officer trial                   | Needs a new desk officer and 15 minutes with the app; the help how-tos are ready for it.                                                | `todo#officer-trial` |
| Restore drill on the production server | Needs the production VM; `scripts/restore-test.sh` passed locally in phase 0 (restore into a throwaway container, then `verify-audit`). | `todo#restore-test`  |
| Undo within 10 minutes                 | Corrections and amendments with a reason work; one-tap undo doesn't yet.                                                                | `todo#undo`          |
| Desk filing a claim for a walk-in      | The desk can file a lost report for a walk-in student, not yet a claim.                                                                 | `todo#walk-in-claim` |

## Tests

| Layer                           | Result                                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                            | Pass. New: demo-mode and storage-driver config rules, timer periods from cron expressions                                                                                                            |
| API (two tenants)               | Pass. New: `demo-hosting.api` (Postgres storage keeps tenants apart; a queued match job runs without workers; timers queued once per period), `desk-extras.api` (shelf check). All 84 routes covered |
| End-to-end (360 + 1280 px, axe) | 32 pass, plus 4 desktop-only skips at 360 px                                                                                                                                                         |
| `pnpm verify`                   | Every gate passes except semgrep's two pnpm supply-chain findings, which wait on your decision (`todo#supply-chain`)                                                                                 |
