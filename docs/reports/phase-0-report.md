# Phase 0 + 0.5 report

Date: 10 Nov 2026 · Scope: build prompt sections 5.1 (Foundations) and 5.2 (golden slice "Submit a lost report") · Commits `7020536` to `HEAD` on `main`.

**Summary.** Everything in 5.1 and 5.2 is built. On a fresh clone, `docker compose -f infra/docker-compose.dev.yml up -d && pnpm install && pnpm dev` brings up the app. Sign-in works three ways for each of the five roles. A student can complete the 4-step lost flow and gets an `LST-YYMM-NNNNX` ID. `pnpm verify` passes 13 of its 14 gates. The 14th, semgrep, fails on two pnpm supply-chain settings that need your decision (section 6, item 1). I didn't silence that rule.

## 1. How to run it

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres 16, MinIO, Mailpit, mock SSO
pnpm install                                           # pnpm 12.18.0, Node 22 (Node 24 also works)
pnpm dev                                               # creates .env, migrates, seeds, starts API + web
pnpm verify                                            # every gate (pnpm verify --quick skips e2e, Stryker, semgrep)
```

| What              | URL                                  | Notes                                                   |
| ----------------- | ------------------------------------ | ------------------------------------------------------- |
| App               | http://localhost:5173                | Practice mode: http://practice.localhost:5173           |
| API               | http://localhost:3000                | `/healthz`, `/api/openapi.json`                         |
| Mailpit           | http://localhost:8025                | Email sign-in codes                                     |
| MinIO console     | http://localhost:9101                | `lf-dev-minio` / `minio-dev-only-password` (local only) |
| Mock SSO          | http://localhost:8090/nsu            | Stand-in for Entra; its page has a quick pick of staff  |
| Dev SMS inbox     | http://localhost:5173/dev/sms        | Phone sign-in codes (nothing is really sent)            |
| Component gallery | http://localhost:5173/dev/components | Every component, every state, all 8 colour modes        |

| Role         | Person        | Sign in with                                                         |
| ------------ | ------------- | -------------------------------------------------------------------- |
| Student      | Rafiq Ahmed   | Email code to `rafiq.ahmed@northsouth.edu` (code in Mailpit), or SSO |
| Desk officer | Nusrat Jahan  | SSO: `nusrat.jahan@northsouth.edu`                                   |
| Supervisor   | Farhana Islam | SSO: `farhana.islam@northsouth.edu`                                  |
| IT admin     | Tanvir Alam   | SSO: `tanvir.alam@northsouth.edu`                                    |
| Visitor      | Karim Hossain | Phone code to `01700000001` (code at `/dev/sms`)                     |

In development, the prototype toolbar's "View as" menu switches between these people without signing in, and its clock buttons move the server time forward.

## 2. Walkthrough

App screenshots were taken on 10 Nov 2026 at 1440 px (mobile versions at 360 px are in `docs/reports/phase-0/*-mobile.png`). Each Figma image is the frame saved in `docs/design/screens/`. Sign-in codes were typed by the script and never appear in a screenshot.

### Sign-in, method 1: email code

**Sign in (student / staff tab)**

| App (built)                                                                          | Figma                                                                                           |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| <img src="phase-0/sign-in.png" alt="App: Sign in (student / staff tab)" width="440"> | <img src="../design/screens/39-283.png" alt="Figma: Sign in (student / staff tab)" width="440"> |

**Email code sent; code entry (no Figma frame)**

| App (built)                                                                                                 | Figma          |
| ----------------------------------------------------------------------------------------------------------- | -------------- |
| <img src="phase-0/auth-email-code.png" alt="App: Email code sent; code entry (no Figma frame)" width="440"> | No Figma frame |

**Signed in: student home (Figma frame is shell reference only)**

| App (built)                                                                                                                       | Figma                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| <img src="phase-0/auth-email-signed-in.png" alt="App: Signed in: student home (Figma frame is shell reference only)" width="440"> | <img src="../design/screens/39-899.png" alt="Figma: Signed in: student home (Figma frame is shell reference only)" width="440"> |

### Sign-in, method 2: phone code (visitor)

**Visitor sign up**

| App (built)                                                            | Figma                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| <img src="phase-0/visitor.png" alt="App: Visitor sign up" width="440"> | <img src="../design/screens/39-582.png" alt="Figma: Visitor sign up" width="440"> |

**Text sent; code entry (no Figma frame)**

| App (built)                                                                                           | Figma          |
| ----------------------------------------------------------------------------------------------------- | -------------- |
| <img src="phase-0/auth-phone-code.png" alt="App: Text sent; code entry (no Figma frame)" width="440"> | No Figma frame |

**Signed in: visitor home (no Gallery tab for visitors)**

| App (built)                                                                                                               | Figma          |
| ------------------------------------------------------------------------------------------------------------------------- | -------------- |
| <img src="phase-0/auth-phone-signed-in.png" alt="App: Signed in: visitor home (no Gallery tab for visitors)" width="440"> | No Figma frame |

### Sign-in, method 3: NSU single sign-on

**Mock NSU SSO (stand-in for Entra, quick pick of seeded staff)**

| App (built)                                                                                                                | Figma          |
| -------------------------------------------------------------------------------------------------------------------------- | -------------- |
| <img src="phase-0/auth-sso-page.png" alt="App: Mock NSU SSO (stand-in for Entra, quick pick of seeded staff)" width="440"> | No Figma frame |

**Desk officer lands on the desk placeholder**

| App (built)                                                                                             | Figma          |
| ------------------------------------------------------------------------------------------------------- | -------------- |
| <img src="phase-0/auth-sso-desk.png" alt="App: Desk officer lands on the desk placeholder" width="440"> | No Figma frame |

**IT admin lands on Appearance (the only place the theme changes)**

| App (built)                                                                                                                   | Figma          |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------- |
| <img src="phase-0/auth-sso-admin.png" alt="App: IT admin lands on Appearance (the only place the theme changes)" width="440"> | No Figma frame |

### Lost report flow

**Step 1 of 4: What is it?**

| App (built)                                                                   | Figma                                                                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| <img src="phase-0/step1.png" alt="App: Step 1 of 4: What is it?" width="440"> | <img src="../design/screens/39-3802.png" alt="Figma: Step 1 of 4: What is it?" width="440"> |

**Step 2 of 4: Describe it**

| App (built)                                                                   | Figma                                                                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| <img src="phase-0/step2.png" alt="App: Step 2 of 4: Describe it" width="440"> | <img src="../design/screens/39-4459.png" alt="Figma: Step 2 of 4: Describe it" width="440"> |

**Step 3 of 4: Where and when**

| App (built)                                                                      | Figma                                                                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| <img src="phase-0/step3.png" alt="App: Step 3 of 4: Where and when" width="440"> | <img src="../design/screens/39-4998.png" alt="Figma: Step 3 of 4: Where and when" width="440"> |

**Step 4 of 4: Check and submit**

| App (built)                                                                        | Figma                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| <img src="phase-0/step4.png" alt="App: Step 4 of 4: Check and submit" width="440"> | <img src="../design/screens/39-5493.png" alt="Figma: Step 4 of 4: Check and submit" width="440"> |

**Submitted, with the LST- ID**

| App (built)                                                                          | Figma                                                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| <img src="phase-0/submitted.png" alt="App: Submitted, with the LST- ID" width="440"> | <img src="../design/screens/39-5855.png" alt="Figma: Submitted, with the LST- ID" width="440"> |

### Component gallery

**/dev/components (Figma: Button 31:5 shown; Icon button, Badge, Notice, Input, Selection, Category & colour, Stepper & avatar, Navigation, Overlays are in docs/design/screens/)**

| App (built)                                                                                                                                                                                                                                   | Figma                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="phase-0/dev-components.png" alt="App: /dev/components (Figma: Button 31:5 shown; Icon button, Badge, Notice, Input, Selection, Category & colour, Stepper & avatar, Navigation, Overlays are in docs/design/screens/)" width="440"> | <img src="../design/screens/31-5.png" alt="Figma: /dev/components (Figma: Button 31:5 shown; Icon button, Badge, Notice, Input, Selection, Category & colour, Stepper & avatar, Navigation, Overlays are in docs/design/screens/)" width="440"> |

### Phones (360 px)

No Figma mobile frames exist; these are the layouts at 360 px.

| sign-in                                                                    | visitor                                                                    | home                                                                 | step1                                                                  | step2                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| <img src="phase-0/sign-in-mobile.png" alt="sign-in at 360 px" width="170"> | <img src="phase-0/visitor-mobile.png" alt="visitor at 360 px" width="170"> | <img src="phase-0/home-mobile.png" alt="home at 360 px" width="170"> | <img src="phase-0/step1-mobile.png" alt="step1 at 360 px" width="170"> | <img src="phase-0/step2-mobile.png" alt="step2 at 360 px" width="170"> |

| step3                                                                  | step4                                                                  | submitted                                                                      | dev-components                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| <img src="phase-0/step3-mobile.png" alt="step3 at 360 px" width="170"> | <img src="phase-0/step4-mobile.png" alt="step4 at 360 px" width="170"> | <img src="phase-0/submitted-mobile.png" alt="submitted at 360 px" width="170"> | <img src="phase-0/dev-components-mobile.png" alt="dev-components at 360 px" width="170"> |

## 3. Test results

| Layer                                             | Count                                                 | Result                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (`vitest --project unit`)                    | 608 tests in 12 files                                 | Pass. Domain 378 (including fast-check properties), token contrast 176 (8 modes × 22 colour pairs), contracts, server platform, lint-rule self-test                                                                                       |
| Component (`--project unit-dom`)                  | 15 tests in 2 files                                   | Pass: `packages/ui` components and the lost-report form logic                                                                                                                                                                             |
| API (`--project api`, real Postgres, two tenants) | 82 tests in 5 files                                   | Pass. `expectNoLeak` checked every tenant-A response; `pnpm check:routes`: all 15 routes have a test                                                                                                                                      |
| End-to-end (Playwright, 360 + 1280 px)            | 12 tests: 8 run, 4 skipped                            | Pass. The 4 sign-in-method tests run once, at desktop width (codes are rate-limited per address)                                                                                                                                          |
| Accessibility (axe, WCAG 2.1 A/AA)                | 20 scans across 10 screens                            | 0 serious or critical violations (the gate). Moderate and minor findings are not gated                                                                                                                                                    |
| `packages/domain` coverage                        | 140 statements, 69 branches, 40 functions             | 100% on all four (CI floor: 95%)                                                                                                                                                                                                          |
| Stryker on `packages/domain`                      | 515 mutants                                           | **92.79%** (460 killed, 3 timed out, 31 survived, 5 not covered, 16 compile errors). Threshold 80%                                                                                                                                        |
| Migrations (squawk)                               | 3 migrations                                          | 0 issues. The initial schema migration has one documented file-level ignore (section 6, item 3)                                                                                                                                           |
| Supply chain                                      | `pnpm audit --prod`, gitleaks (full history + staged) | No known vulnerabilities, no secrets                                                                                                                                                                                                      |
| Dev-only dependencies (`pnpm audit`, not gated)   | 5 moderate                                            | `qs` (4 advisories, through Stryker's `typed-rest-client`) and `minimatch` (through typescript-eslint). Both are local tools that never see untrusted input, and neither ships. Left as they are; they'll go away when those tools update |
| semgrep `p/default`                               | Whole repo                                            | **2 findings, both in `pnpm-workspace.yaml`**: 7-day `minimumReleaseAge` and `trustPolicy` (section 6, item 1)                                                                                                                            |

The same tests also pass on Node 22.23.4 (what CI uses) and on Node 24.19.0 (what this machine has).

**Clean clone.** I cloned `main` into an empty folder and ran only the README commands (`docker compose … up -d`, `pnpm install`), then `pnpm verify`. The results matched the working copy: 13 gates passed and semgrep failed with the same two findings. The first run created `.env` from `.env.example` by itself.

One lesson from that test: both copies use the same Compose project (`lost-and-found`). Running `up` from the clone re-pointed the mock SSO container's mounted files at the clone, and deleting the clone then broke the mock SSO. Running `bash scripts/infra-up.sh` from the main copy fixed it. The README now warns about this.

## 4. Deviations from the plan, SRS and Figma

**Set by your instructions (not choices of mine):** local stand-ins instead of R2, SMTP, SMS and Entra (MinIO, Mailpit, `DevSmsAdapter`, mock-oauth2-server; ADR-0009). No deployment, VM, Cloudflare or DNS records. Theme and colours are controlled by the IT admin only, including custom palettes.

**Plan**

| What                    | Plan                                      | Built                                                                                                                                     | Why                                                                                                                                                                  |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transition()`          | One `transition(tx, record, event, data)` | `bindTransition({ recordType, machine, create, update })` in `modules/audit`, bound once per record type (ADR-0011)                       | It must write audit rows, and only the audit module may. Binding keeps each module's repo private                                                                    |
| Schema imports          | `schema.ts` private to its module         | A `schema.ts` may import another module's `schema.ts` for foreign keys only (lint-enforced, ADR-0011)                                     | Drizzle foreign keys need the referenced table object                                                                                                                |
| Drizzle                 | `drizzle(client, { schema })`             | `drizzle({ client })` without the relational `schema`                                                                                     | Otherwise one file would have to import every module's schema                                                                                                        |
| Reads                   | Not specified                             | Reads also use `withTx(ctx, fn, { readOnly: true })`                                                                                      | Services never hold the raw `db`, so the lint rule stays simple                                                                                                      |
| `withTx` extras         | —                                         | Sets `app.tenant_id` per transaction, gives `tx.now` from the clock, destroys a client whose ROLLBACK failed                              | Groundwork for RLS (plan §15) and one "now" per transaction                                                                                                          |
| Holiday calendar        | Owned by the retention module (§3.1)      | `platform/calendar`                                                                                                                       | Several modules need working-day maths and platform can't import modules. Move it when retention exists, if that still makes sense                                   |
| Backups                 | Nightly pg-boss cron                      | `scripts/backup.sh` + `scripts/restore-test.sh` (pg_dump → age → MinIO; restore into a throwaway container, then `verify-audit`)          | `pg_dump` runs beside Postgres, not in the app. Scheduling it (host cron or a job) is a Phase 1 decision                                                             |
| PWA (`vite-plugin-pwa`) | In the stack                              | Not built (`docs/todo.md#pwa`)                                                                                                            | Not needed by the slice; caching the shell needs care with auth                                                                                                      |
| `npm audit`             | All dependencies                          | `pnpm audit --prod`, as your prompt says                                                                                                  | Dev-only advisories don't ship                                                                                                                                       |
| Theme endpoints         | —                                         | `GET /api/tenant` (public, carries `appearance`), `PUT /api/admin/appearance` (IT admin, contrast-checked, audited)                       | One public call for the name, hostnames and theme the sign-in page needs                                                                                             |
| Practice mode           | Phase 5                                   | Seeded second tenant at `practice.localhost` (FR-21)                                                                                      | Your prompt asked for a practice dataset; a tenant was the cleanest way                                                                                              |
| Versions                | Latest                                    | TypeScript 5.9.3, ESLint 9.39.5, lefthook 2.2.1, Node 22 (CI pins 22.23.4)                                                                | Peer ranges: typescript-eslint and openapi-typescript need TS < 6, eslint-plugin-jsx-a11y doesn't support ESLint 10. lefthook 2.2.2 was published without provenance |
| MinIO image             | `minio/minio`                             | `cgr.dev/chainguard/minio`, pinned by digest                                                                                              | MinIO stopped publishing free images; Chainguard's is free and built from source                                                                                     |
| Security override       | —                                         | `@esbuild-kit/core-utils>esbuild` → 0.25.12                                                                                               | GHSA-67mh-4wv8-2f99 in drizzle-kit's old loader; drizzle-kit still generates correctly                                                                               |
| Extra gates             | —                                         | Prettier check, 95% domain coverage floor, token contrast test, production bundle check (no toolbar or `/dev` code), staged gitleaks hook | Cheap and they catch real mistakes                                                                                                                                   |
| Commits                 | One per milestone a–i                     | 9 commits; b–d were one commit (`ac4ea0b`), and the API tests landed separately                                                           | The platform, auth and data were built and tested together                                                                                                           |

**SRS**

| What                       | SRS                                 | Built                                         | Why                                                                                                           |
| -------------------------- | ----------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Staff email-code fallback  | "Email OTP fallback"                | Staff roles are refused email codes; SSO only | Your prompt (item 21) and the plan say staff use SSO only. Break-glass access is an open question (section 6) |
| Private note in the draft  | Drafts autosave                     | Everything autosaves except the private note  | It would sit unencrypted in `localStorage`. The form says "Not saved in the draft"                            |
| Who can file a lost report | Students; desk for walk-ins (US-10) | Student, visitor, desk officer, supervisor    | Visitors lose things too; supervisors cover the desk                                                          |
| Hand-in stat on sign-in    | —                                   | "48 hours · to hand in a found item"          | Plan §9.5 replaces Figma's "Claims resolved within 30 mins"                                                   |

**Figma**

| What                 | Figma                                                            | Built                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default theme        | Variables default to Navy · Light; every screen uses Teal · Dark | Teal · Dark, set per tenant by the IT admin                                                                                                                                                                                  |
| Prototype toolbar    | Theme swatches + Light/Dark toggle                               | Removed. Only "View as" and the clock remain, because nobody but the IT admin may change the theme                                                                                                                           |
| Text size            | Styles at 12–15 px                                               | Raised to 16 px (SRS minimum). Exceptions: the logo subtitle (part of the logo) and the dev-only toolbar                                                                                                                     |
| Colour contrast      | Four pairs fail WCAG AA                                          | New `border/control` (3:1 for inputs and toggles), `status/on-danger` and `status/on-success` in dark modes, placeholders at full `text/muted`, success check icon in `brand/on-primary` (values in `docs/design/README.md`) |
| Avatars              | Stock face photos                                                | Initials (no face photos in the repo)                                                                                                                                                                                        |
| Photos on step 2     | Working "Add photo" tile                                         | Disabled "Photos (coming soon)" area, as your prompt asks                                                                                                                                                                    |
| Sign-in footnote     | "…use 'View as' above to switch roles"                           | That sentence only appears while the prototype toolbar exists                                                                                                                                                                |
| Office location      | Varies                                                           | "Admin Building, Ground floor, Security Room" (plan §9.4)                                                                                                                                                                    |
| Mobile               | No mobile frames                                                 | My own 360 px layouts: single column, bottom tab bar, hero hidden on sign-in                                                                                                                                                 |
| Screens not in Figma | —                                                                | Code entry, desk/supervisor placeholders and the admin Appearance page are built from the same components                                                                                                                    |

## 5. Library API differences from the plan's snippets

| Library                       | Plan snippet / assumption                | Current API (what the code does)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drizzle ORM 0.45              | `drizzle(client, { schema })`            | `drizzle({ client })`; the relational `schema` option is not used                                                                                                                                                                                                                                                                                                                                                                                                                         |
| pg-boss 12                    | `boss.send(name, data, { db: tx.jobs })` | Same option name (`db`, an object with `executeSql(text, values)`). But a queue must exist before `send`, so `ensureQueues()` runs `createQueue` at startup. Handlers receive an array of jobs. The app role runs with `migrate: false, createSchema: false` and the owner installs the schema. Cron is `schedule(name, cron, data, { tz })`                                                                                                                                              |
| Plan's `Tx` type              | `rows: any[]`                            | `rows: unknown[]`, because `any` is banned                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| @hono/zod-openapi 1.6 + Zod 4 | `.openapi()` on schemas                  | Schemas are named with Zod 4's `.meta({ id })`. The OpenAPI 3.1 document comes from `app.doc31()`. Validation errors go through `defaultHook`, which turns them into one-sentence field errors                                                                                                                                                                                                                                                                                            |
| Better-Auth 1.7               | "generic OIDC"                           | `genericOAuth` providers are called through the social endpoints: `authClient.signIn.social({ provider: 'nsu-sso' })` and `/api/auth/callback/nsu-sso`, not `/sign-in/oauth2`. Visitors sign up through `phoneNumber({ signUpOnVerification })` with a placeholder email (`<digits>@visitors.lostfound.invalid`). There is no built-in "sign in as" for non-admin dev use, so the dev plugin is a small `createAuthEndpoint` + `setSessionCookie`. Rate limits are stored in the database |
| eslint-plugin-boundaries 7    | `element-types` / `entry-point` rules    | One `boundaries/dependencies` rule with element selectors (`fileInternalPath`, `captured`). The last matching policy wins                                                                                                                                                                                                                                                                                                                                                                 |
| Vitest 5                      | Workspace file                           | `test.projects` in `vitest.config.ts` (unit, unit-dom, api)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Vite 8                        | Vite (esbuild/Rollup)                    | Rolldown bundler; `*.localhost` is allowed by default, so practice mode works                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tailwind 4                    | `tailwind.config.js`                     | CSS-first: `@theme inline` maps the token variables, and the default palette and sizes are removed                                                                                                                                                                                                                                                                                                                                                                                        |
| pnpm 12                       | `onlyBuiltDependencies`                  | `allowBuilds`, `minimumReleaseAge`, `blockExoticSubdeps` and `overrides` in `pnpm-workspace.yaml`                                                                                                                                                                                                                                                                                                                                                                                         |
| TanStack Router               | —                                        | `throw redirect()` is the documented guard flow but trips `only-throw-error`. A one-type allow-list in `eslint.config.js` needs your approval (section 6, item 2)                                                                                                                                                                                                                                                                                                                         |
| Playwright 1.65               | `playwright install`                     | `playwright install --only-shell chromium` (headless shell, smaller)                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 6. Open questions and risks for Phase 1

**Needs your decision now**

1. **Supply-chain policy (semgrep fails until decided).** Semgrep wants `minimumReleaseAge: 10080` (7 days) and `trustPolicy: no-downgrade`. The 7-day wait rejects today's pinned "current stable" versions (AWS SDK, Babel, Vite and others released this week). The trust policy rejects `undici-types@6.21.0`, which `@types/node@22` requires and which has never shipped with provenance. The options are: wait and re-pin, add a reviewed exception list, or accept the finding. Today the repo has a 1-day age limit plus `blockExoticSubdeps` (`docs/todo.md#supply-chain`).
2. **Lint exception:** allow TanStack Router's `Redirect` type in `@typescript-eslint/only-throw-error` for `apps/web` (commented in `eslint.config.js`).
3. **Squawk:** `0001_schema.sql` has one `squawk-ignore-file` for three rules (NOT VALID foreign keys, CONCURRENTLY indexes, FK constraints). The tables are created empty in that same file, so the rules don't apply there. Every later migration is fully linted. Approve it, or I split the initial schema so no ignore is needed.

**Risks and questions for Phase 1**

4. **Staff sign-in when Entra is down.** Staff have no fallback (SSO only). Decide on break-glass access, for example a supervisor-issued one-time code.
5. **Real Entra.** You'll need an app registration, a redirect URI, and the claims to use (email, name, maybe department). The mock returns whatever claims we choose, so the first real sign-in may differ.
6. **SMS for visitors.** The zero-cost rule rules out real SMS. Phase 1 needs a decision: a paid SMS provider later, or visitors use email.
7. **Rate limits by IP.** The server overwrites `x-lf-client-ip` with the socket address, so clients can't spoof it. Locally, every browser shares one bucket (127.0.0.1). Behind a reverse proxy, everyone would share the proxy's address. Before deploying, read the client IP from the proxy's forwarded header, trusting only the proxy.
8. **Photo pipeline (Phase 1 core).** sharp decode → rotate → strip EXIF → WebP → MinIO, the unattached-photo cleanup job, and the photos field in the draft (`docs/todo.md#photos`).
9. **Backups are not scheduled.** The scripts work, and the restore test passed. Someone has to own the age key (`.backup-keys/`) and the schedule.
10. **Node 22** is in maintenance LTS until April 2027. Move to Node 24 LTS (`docs/todo.md#node-lts`).
11. **RLS** is deferred until a second university is onboarded (ADR-0005). Isolation rests on `tenant_id` in every repo query plus the two-tenant tests.
12. **Dev machine disk:** the root disk is 98% full. Docker images and browsers live there.

## 7. Suggested prompt for Phase 1

```
Build Phase 1 ("Report and intake") of the NSU Lost & Found Portal on top of the Phase 0.5 repo.

Read first: AGENTS.md, docs/adr/, docs/plan/Lost-and-Found-Build-Plan-v0.3.md (§6 photos, §9, §14),
docs/source/srs-v0.1.txt (WF-01, WF-02, WF-03, FR-01–FR-06, FR-08), docs/reports/phase-0-report.md, docs/todo.md.
Copy the lost-report slice (apps/server/src/modules/items, apps/web/src/features/lost-report,
apps/server/test/api/submit-lost-report.api.test.ts). Do not invent new patterns.

Decisions from the Phase 0 report: <fill in answers to section 6, items 1–6>.

Build, in this order, committing after each:
1. Photo pipeline: POST /api/photos (multipart, size/type limits) → sharp decode, rotate, strip all metadata,
   re-encode WebP ≤ 500 KB → MinIO; raw bytes never stored; photos start "unattached"; daily cleanup job for
   unattached photos older than 7 days; signed GET for viewing. Add photos (0–5) to the lost-report form and draft.
2. Found items (WF-02): students post a found item (FND- ID, the FoundItem lifecycle from packages/domain),
   with the "hand in within 48 hours" instructions; desk intake (WF-03) receives it at the desk into a bin
   (labels and bins from the catalog), state → IN_CUSTODY, printable label (PDF via a free library).
3. Sensitive lane and restricted categories (ID cards, cash, cards, documents): desk-only, never public,
   ID-card fast lane as the plan describes (RDS lookup stubbed behind an adapter).
4. Gallery and search (FR-08): public-safe fields only, Postgres full-text + pg_trgm, filters by category,
   colour, building, date; visitors can't browse.
5. Desk home for desk officers (replace the placeholder) using the Figma desk frames (fetch them with the
   Figma MCP server first and save to docs/design/screens/).

Rules: everything in the Phase 0 prompt sections 3.3, 7 and 8 still applies (zero cost, local stand-ins,
exact pins, no weakened tests or lint rules, one-sentence errors, WCAG 2.1 AA, 16 px / 44 px).
Every new route has two-tenant API tests; every state change goes through bindTransition; every screen has
Playwright + axe at 360 and 1280 px. pnpm verify must pass (except anything still waiting on a decision).

Out of scope: AI photo assist, matching logic, claims, hand-back, dispatch, supervisor screens, notifications
beyond what intake needs, MCP, deployment.

End with the same style of report (run steps, walkthrough next to Figma, test results, deviations,
library differences, open questions, Phase 2 prompt), then stop.
```
