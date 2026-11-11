# AGENTS.md

Instructions for AI agents (and people) writing code in this repo. Read this file, [docs/adr/](docs/adr/README.md) and the plan ([docs/plan/Lost-and-Found-Build-Plan-v0.3.md](docs/plan/Lost-and-Found-Build-Plan-v0.3.md)) before writing code. Path-specific rules are in [.agents/rules/](.agents/rules/): `migrations.md`, `security-sensitive.md`, `frontend.md`.

**Copy the lost-report slice in `apps/server/src/modules/items` (and `apps/web/src/features/lost-report`). Do not invent new patterns.** Files in the slice start with a `GOLDEN SLICE` comment that says what to copy.

When the plan, the SRS (`docs/source/srs-v0.1.txt`) and the Figma screens (`docs/design/screens/`) disagree, follow plan → SRS → Figma for behaviour and Figma for visuals, and write down the choice in your PR. Unclear points go in `docs/todo.md` with an anchor.

## Commands

```bash
docker compose -f infra/docker-compose.dev.yml up -d && pnpm install && pnpm dev
pnpm verify            # every CI gate; run before you say you are done
pnpm verify --quick    # without e2e, mutation and semgrep
pnpm test:unit | test:api | test:e2e | test:mutation | lint | typecheck
pnpm db:generate       # after editing a schema.ts
pnpm gen:api           # after changing a route or contract (CI fails if the client is stale)
pnpm build:vercel      # the public demo on Vercel (docs/deploy-vercel.md)
```

## Layout

```
apps/server/src
  platform/<part>/        shared plumbing; never imports a module
    auth/                 Better-Auth (3 sign-in methods), dev "sign in as"
    calendar/ clock/ config/ crypto/ db/ email/ errors/ http/ ids/ jobs/ logger/ registrar/ sms/ storage/ tenancy/
  modules/<name>/         one folder per business area
    index.ts              the ONLY file other modules may import
    schema.ts             Drizzle tables (tenant_id first in every key and index)
    repo.ts               the ONLY file that touches this module's tables (tx.db)
    service.ts            use cases: plain functions (deps, ctx, input); a big module may split
                          them by record type (items/found-items.ts), same rules
    routes.ts             Hono + zod-openapi routes, thin handlers
    jobs.ts               pg-boss queue definitions and workers (optional)
  app.ts                  composition root: middleware + module routes
  services.ts             builds db, boss, auth, adapters; lists every module's jobs
  main.ts                 starts HTTP + workers, graceful shutdown
  vercel.ts               the demo's serverless entry: drains queued jobs after requests (APP_ENV=demo)
  seed/                   idempotent seed (NSU + practice tenant)
apps/server/test          API tests (real Postgres, two tenants) and harness
apps/web/src
  routes/<area>/          pages per role (auth, student, staff, admin, dev)
  features/<flow>/        multi-step flows (lost-report is the template)
  api/                    generated client (schema.d.ts) + React Query hooks
  lib/                    clock, theme, auth client
  components/             app shell pieces
packages/domain           pure rules: roles, IDs, state machines, calendar (no I/O, no imports)
packages/contracts        Zod schemas shared by server routes, web forms and OpenAPI
packages/ui               tokens (8 colour modes) + base components
```

Current modules: `identity` (roles, sign-in policy, `/api/me`, member lookups, staff and invites, account flags), `catalog` (places, desks, bins, categories, colours, policies: appearance and the supervisor's settings), `audit` (insert-only events, `bindTransition`, checkpoints, latest activity), `items` (lost reports, found items, private details, finder pings, gallery and desk search, labels, duplicates and merging, outage label sheets, paper register import, the hand-in, retention and lost-report timers), `photos` (upload pipeline, permission-checked viewing, cleanup), `notifications` (in-app alerts + emails queued in the transaction), `matching` (scored pairs, one alert per owner per pair, likely matches), `claims` (questions, answers and pickup codes encrypted, side-by-side review, the desk Today list, the pickup timer, proxy pickup, high-value approvals), `dispatch` (pickup-code lookup, handover checks, DSP records, the dispatch directory with CSV and amendments, disputes), `supervision` (the supervisor's overview, policies and closures, staff, flags and the hotspot report; owns no tables). Dependencies point one way: `supervision` → `dispatch` → `claims` → `matching`/`items` → `photos`/`notifications`/`catalog`/`identity`. The FR-07 score is in `packages/domain/src/matching.ts`; claim questions and deadlines in `packages/domain/src/claims.ts`; retention, look-alikes and the holiday pause in `packages/domain/src/retention.ts`.

When a module must move another module's record as a side effect (e.g. a claim moves the found item to CLAIM_PENDING), call that module's exported transition with `{ ...tx, actor: { kind: 'system', job: '<module>' } }` so the audit shows the system did it.

## Architecture rules (enforced)

| Rule                                                                                                       | Enforced by                                                               |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A module imports another module only through its `index.ts`                                                | `boundaries/dependencies` (`eslint/architecture.js`)                      |
| `schema.ts`/`repo.ts` are private to their module (exception: `schema.ts` → `schema.ts` for FKs, ADR-0011) | `boundaries/dependencies`                                                 |
| `platform/*` never imports a module                                                                        | `boundaries/dependencies`                                                 |
| Only `repo.ts`, `platform/*` and tests use `tx.db` or the raw pool                                         | `boundaries/dependencies` + `no-restricted-syntax` (`tx.db`)              |
| No `Date.now()` / `new Date()` outside `platform/clock` and `apps/web/src/lib/clock.ts`                    | `no-restricted-syntax`                                                    |
| No `console.*`; use the logger                                                                             | `no-console`                                                              |
| `packages/domain` imports nothing outside itself                                                           | `no-restricted-imports`                                                   |
| Web imports only `ui`, `contracts`, `domain`; contracts only `domain`                                      | `boundaries/dependencies`                                                 |
| No `any`, no `@ts-ignore`/`@ts-nocheck`; `@ts-expect-error` needs a reason                                 | `@typescript-eslint/no-explicit-any`, `ban-ts-comment`                    |
| No floating promises, exhaustive `switch`, throw only `Error`s (web: TanStack `redirect` too)              | `no-floating-promises`, `switch-exhaustiveness-check`, `only-throw-error` |
| `===` only, no implicit coercion                                                                           | `eqeqeq`, `no-implicit-coercion`                                          |
| Every API route has a test                                                                                 | `pnpm check:routes`                                                       |
| No tenant-B data in any tenant-A response                                                                  | `expectNoLeak` on every response in the API harness                       |
| Migrations are safe to run on a live database                                                              | squawk in `pnpm verify`                                                   |
| UI has no serious/critical accessibility violations                                                        | axe in every Playwright test                                              |

`eslint/architecture.test.ts` checks each rule against fixtures. Never weaken, skip or delete a test or a lint rule to make something pass. A disabled lint rule needs a comment explaining why and a maintainer's approval.

## Request context, transactions and tenants

Every request and every job has a `RequestCtx`:

```ts
type RequestCtx = {
  tenantId: string;
  actor: Actor;
  requestId: string;
  clock: Clock;
  db: DatabaseHandle;
};
type Actor = { kind: 'user'; userId; role; name } | { kind: 'system'; job: string };
```

Route guards build it: `guards.requireRole('student', 'visitor')` or `guards.requireUser()` put it on `c.var.ctx`. Jobs build it from the job data (see `modules/matching/jobs.ts`).

**`withTx(ctx, fn, { readOnly? })`** (`platform/db/tx.ts`) is the only way to touch the database. It gives `fn` one `Tx` on one pg client:

```ts
type Tx = { db; jobs; tenantId; actor; requestId; now: Date };
await withTx(ctx, async (tx) => {
  const report = await lostReportTransition(tx, { id, state: null }, 'SUBMIT', { values });
  await deps.boss.send(
    MATCH_LOST_REPORT_JOB,
    { tenantId: tx.tenantId, reportId: id },
    { db: tx.jobs },
  );
});
```

- One `withTx` per use case. Rows, audit events and queued jobs commit or roll back together (ADR-0002).
- `tx.now` is read once per transaction. Use it for every timestamp you write.
- Use `{ readOnly: true }` for reads.

**Tenancy (ADR-0005, no RLS in v1):**

- The tenant comes from the `Host` header (`platform/tenancy`), never from the request body or query string.
- Every repo function takes `(tx, tenantId, …)` and uses `tenantId` in every `where`, insert and join. Every table has `tenant_id`, and every primary key and query index starts with it.
- A record from another tenant is "not found", never "forbidden".
- Every API test talks to tenant A while tenant B holds overlapping data. The harness fails the test if a tenant-B ID, name or email shows up in any response.

## State changes: `transition()`

Lifecycles are state machines in `packages/domain/src/lifecycles/` (states, events, which roles may fire each event). Each module binds its machine once (ADR-0011):

```ts
export const lostReportTransition = bindTransition({
  recordType: 'lost_report',
  machine: lostReportMachine,
  create: (tx, record, to, data) => insertLostReport(tx, tx.tenantId, record.id, to, data.values),
  update: (tx, record, to, data) => updateLostReportState(tx, tx.tenantId, record.id, record.state, to, data.patch),
});
await lostReportTransition(tx, record, 'SUBMIT', data, note?);
```

`transition` checks the event and the actor's role (it throws `Forbidden` or `InvalidTransition`), writes the row through the repo, and inserts the audit event, all on `tx`.

- The `update` repo function must guard on the current state (`where state = from`) and throw `Conflict` when no row matches. That is the optimistic lock.
- Never write a `state` column any other way.
- Audit tables are insert-only. Triggers reject UPDATE, DELETE and TRUNCATE, and `lf_app` has only INSERT and SELECT. `pnpm db:verify-audit` checks the hash-chained checkpoints.

## Record IDs

`nextId(tx, 'LST' | 'FND' | 'CLM' | 'DSP')` returns `TYPE-YYMM-NNNNX` (ADR-0012). The month is in Asia/Dhaka, the counter is per tenant, type and month, and the last letter is a check letter. Accept IDs typed by people with `normaliseId()` from `@lf/domain` (any case, dashes optional).

## Errors

Throw typed errors from `platform/errors`: `ValidationFailed(fields)`, `Unauthenticated`, `Forbidden`, `NotFound`, `InvalidTransition`, `Conflict`, `RateLimited`, `Unavailable`. The error handler turns them into `{ error: { kind, message, fields? } }` with the right status. Anything else becomes a generic 500 with no details.

- Every message a person can see is **one sentence: what happened, then what to do next.** For example: `"That place isn't on the campus list; pick the building and floor again."` No codes, stack traces or internal IDs.
- Field errors are keyed by the contract path (`'place.buildingCode'`), so the web form puts them on the right field and step.
- Zod contract messages follow the same rule; the server and the form show the same text.

## Secrets, private data and logs

- Private details, claim answers and pickup codes are encrypted with `platform/crypto` (AES-256-GCM; the key version is stored; the AAD is `tenantId:recordType:recordId`). Never return them to students, log them, or put them in errors, snapshots or screenshots.
- Add every new sensitive field name to `LOG_DENY_LIST` in `platform/logger`.
- Photos enter only through `modules/photos` (sniffed, re-encoded to WebP, metadata dropped; ADR-0007). Never hand out storage URLs: the browser loads `/api/photos/{id}`, which checks who may see it (uploader, desk staff, or anyone signed in once the record is public). Sensitive and condition photos stay staff-only.
- University ID and card numbers are encrypted like private notes and shown only as `••••1234` (`maskLast4`).
- `.env.example` holds obviously fake values (they contain `dev-only`). Production refuses them, and also refuses the dev SMS adapter and dev tools. Never commit real secrets. The pre-commit hook runs gitleaks.
- No paid services, telemetry or sign-ups. Local stand-ins only (ADR-0009).

## How to…

**Add an API route.**

1. Add the request and response schemas to `packages/contracts/src/<area>.ts` with `.meta({ id })` and export them from its index.
2. In `modules/<m>/routes.ts`: `createRoute({ method, path, tags, summary, middleware: [guards.requireRole(...)] as const, request, responses: { 201: …, 400: errorResponses[400], 401: errorResponses[401], 403: errorResponses[403] } })`. Then `router.openapi(route, async (c) => c.json(await useCase(deps, c.var.ctx, c.req.valid('json')), 201))`.
3. Write the use case in `service.ts` (one `withTx`) and the SQL in `repo.ts`.
4. Mount it in `app.ts` if the module is new.
5. Write API tests in `apps/server/test/api/<feature>.api.test.ts` (see below).
6. Run `pnpm gen:api` and use the endpoint from the web only through `src/api/hooks.ts`.

**Add a table or column.** Edit the module's `schema.ts` and run `pnpm db:generate`. Read `.agents/rules/migrations.md`: backward compatible only, tenant-first indexes, squawk must pass. For hand-written SQL (triggers, grants), use `pnpm --filter @lf/server exec drizzle-kit generate --custom --name <what>`. Never edit a migration that has been merged; add a new one.

**Add a background job.**

1. Add the job name (and its payload type) to `platform/jobs/names.ts`, so a module can queue it without importing the module that handles it. In `modules/<m>/jobs.ts`, export a `JobDefinition` (`name`, `options` with retry settings, an optional `cron` in Asia/Dhaka, and a `handler` that builds a system `RequestCtx` per job and calls a service).
2. Add it to the `jobs` list in `services.ts`.
3. Per-tenant timers loop over `listTenantIds(db)` from `platform/tenancy` and build one system `RequestCtx` per tenant (see `modules/items/jobs.ts`).
4. Queue it only inside `withTx` with `{ db: tx.jobs }`.

**Add a lifecycle.** Write the machine in `packages/domain/src/lifecycles/` with property tests (fast-check) and keep the Stryker score at 80% or above. Then bind it in the owning module with `bindTransition`.

**Add an API test.** Copy `apps/server/test/api/submit-lost-report.api.test.ts`:

- One `createTestContext()` per file in `beforeAll`, and `ctx.close()` in `afterAll`. Each file gets its own database cloned from a migrated template.
- People: `await ctx.as(email.student)` (or `student2`, `desk`, `supervisor`, `itAdmin`, `visitor` from `test/fixtures.ts`), then `.get/.post/.put`. Use `ctx.anonymous()` for signed out and `ctx.as(email, ctx.hosts.B)` for tenant B.
- Assert on the response and on the database (`ctx.owner.query(...)`: rows, `audit_events`, `pgboss.job`). Cover the happy path, validation, every role that must be refused, the other tenant, and rollback.
- Time comes from `ctx.clock` (a test clock at `TEST_NOW`).

**Add a screen.** Read `.agents/rules/frontend.md` and the screen's `docs/design/screens/<node>.md`. Build it from `@lf/ui` components and token classes only. Add a route in `apps/web/src/router.tsx` (lazy, `staticData.title`, a role guard in `beforeLoad`), then a Playwright test in `e2e/` that calls `expectAccessible(page, label)` (`e2e/support.ts`, axe) on every screen; it runs at both viewports. For a multi-step flow, copy `features/lost-report/LostReportFlow.tsx`: one form, the step in `?step=`, per-step `trigger()`, an autosaved draft, and server field errors mapped back to their step.

**Change the theme or tokens.** Edit `docs/design/tokens.json` and run `pnpm --filter @lf/ui build:tokens`. Every text/background pair must pass WCAG AA (4.5:1 for text, 3:1 for controls); the contrast tests fail otherwise. Only the IT admin can change the live theme (ADR-0010). There is no per-user theme switch.

## Banned patterns

- Raw SQL strings in services, `fetch()` in screens, `Date.now()` and `new Date()` outside the clock files, and `console.*`. (Lint.)
- Reading the tenant from a body or query, and queries without `tenant_id`.
- Updating `state` without `transition()`, and UPDATE or DELETE on audit tables.
- Sending a job outside the transaction that caused it.
- Hex colours or arbitrary Tailwind colours in components, text under 16 px, touch targets under 44 px, and icon buttons without `aria-label`.
- Dev-only UI anywhere except the `/dev/*` pages (nothing on the top bar), or `/dev/*` outside `__PROTOTYPE__`. `pnpm verify` checks the production bundle.
- Version ranges in `package.json`. Pin exact versions (`saveExact`), check npm for the current stable release first, and never guess a version.

## Definition of done

`pnpm verify` passes, or each failure is explained in the PR. New behaviour has tests at the right layer: domain unit/property tests, API tests with two tenants, and Playwright + axe for screens. Docs, ADRs and `docs/todo.md` match what you built. Commits follow Conventional Commits (the `commit-msg` hook checks).
