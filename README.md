# NSU Campus Lost & Found Portal

A web portal where North South University students, staff and visitors report lost items, the Lost & Found desk logs found items, and the two are matched and returned. Phases 0, 1 and 3 to 5 are built **showable first** (every feature works end to end and is tested; edge cases are deepened later): reporting and intake, matching, claims and handover, the supervisor's tools and timers, and demo hardening. Phase 2 (AI photo assist) and phase 6 (integrations) are not built yet. Each phase has a report in [docs/reports/](docs/reports/).

- What we are building and why: [docs/source/srs-v0.1.txt](docs/source/srs-v0.1.txt) (SRS) and [docs/plan/Lost-and-Found-Build-Plan-v0.3.md](docs/plan/Lost-and-Found-Build-Plan-v0.3.md) (build plan)
- Decisions: [docs/adr/](docs/adr/README.md)
- Rules for anyone (or any agent) writing code here: [AGENTS.md](AGENTS.md)
- Known follow-ups: [docs/todo.md](docs/todo.md)
- Public demo (sample data, "sign in as" any role): **https://lnf-for-enterprises.vercel.app/dev/tools**. It deploys from `main` automatically once CI passes ([docs/deploy-vercel.md](docs/deploy-vercel.md))

## Run it locally

You need **Docker** (with Compose v2), **Node 22** (see `.nvmrc`; Node 24 also works) and **pnpm 12.18.0** (`npm install --global pnpm@12.18.0`). Everything runs on your machine. There are no paid services, accounts or telemetry.

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres, MinIO, Mailpit, mock SSO
pnpm install
pnpm dev                                               # API on :3000, web app on :5173
```

The containers belong to the Compose project `lost-and-found`. If you run `up` from a second copy of the repo, they switch to that copy's mounted files (the mock SSO login page, the Postgres init script). Run `bash scripts/infra-up.sh` from the copy you work in to switch them back.

The first `pnpm dev` creates `.env` from `.env.example`, applies the migrations and loads the seed data. Running it again is safe. To wait until the local services are healthy (useful in scripts), use `bash scripts/infra-up.sh` instead of `up -d`.

| What              | URL                                  | Notes                                                                           |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| Web app           | http://localhost:5173                | The portal                                                                      |
| Practice mode     | http://practice.localhost:5173       | A second tenant with the same seed data, for training (FR-21)                   |
| API               | http://localhost:3000                | `GET /healthz`, OpenAPI at `/api/openapi.json`                                  |
| Mailpit (email)   | http://localhost:8025                | Every email the app sends, including sign-in codes                              |
| MinIO console     | http://localhost:9101                | User `lf-dev-minio`, password `minio-dev-only-password` (local only)            |
| Mock NSU SSO      | http://localhost:8090/nsu            | Stand-in for Microsoft Entra ID. Its sign-in page has a quick pick of the staff |
| Dev tools         | http://localhost:5173/dev/tools      | Sign in as anyone; move the server clock                                        |
| Dev SMS inbox     | http://localhost:5173/dev/sms        | Phone sign-in codes (the dev SMS adapter never sends real texts)                |
| Component gallery | http://localhost:5173/dev/components | Every UI component in every colour mode                                         |

### Seeded people

The people from the Figma screens, one per role. All of them are fictional.

| Role         | Person        | Sign in with                                                              |
| ------------ | ------------- | ------------------------------------------------------------------------- |
| Student      | Rafiq Ahmed   | **Email code**: `rafiq.ahmed@northsouth.edu`, code from Mailpit (or SSO)  |
| Desk officer | Nusrat Jahan  | **NSU SSO**: `nusrat.jahan@northsouth.edu`                                |
| Supervisor   | Farhana Islam | **NSU SSO**: `farhana.islam@northsouth.edu`                               |
| IT admin     | Tanvir Alam   | **NSU SSO**: `tanvir.alam@northsouth.edu`                                 |
| Visitor      | Karim Hossain | **Phone code**: `+8801700000001` (or `01700000001`), code from `/dev/sms` |

Staff must use SSO. Email codes only work for `@northsouth.edu` addresses, and phone codes only for visitors. Any other `@northsouth.edu` address can sign in by email code and becomes a new student. In development, **http://localhost:5173/dev/tools** lets you sign in as any seeded person without a code and move the server clock forward (`+1 hour`, `+1 day`, `+1 week`). Nothing dev-only appears on the app's top bar, and the `/dev` pages are left out of production builds.

## Checks

```bash
pnpm verify          # every gate CI runs (needs Docker; semgrep needs uv)
pnpm verify --quick  # skips end-to-end, mutation and semgrep
```

| Command                | What it runs                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `pnpm typecheck`       | TypeScript (strictest settings) in every package                                   |
| `pnpm lint`            | ESLint, including the architecture rules in `eslint/architecture.js`               |
| `pnpm test:unit`       | Domain rules, contracts, UI components and the web form (Vitest)                   |
| `pnpm test:coverage`   | Coverage for `packages/domain` (floor: 95%)                                        |
| `pnpm test:api`        | API tests against a real Postgres with two tenants and a leak check on every reply |
| `pnpm check:routes`    | Fails if any API route has no test                                                 |
| `pnpm test:e2e`        | Playwright at 360 px and 1280 px, with axe accessibility checks                    |
| `pnpm test:mutation`   | Stryker on `packages/domain` (fails below 80%)                                     |
| `pnpm gen:api`         | Regenerates the typed web client from the server's OpenAPI document                |
| `pnpm db:generate`     | Writes a migration for schema changes (then read `.agents/rules/migrations.md`)    |
| `pnpm db:verify-audit` | Checks the audit log's hash chain                                                  |

Git hooks (installed by `pnpm install`) scan staged changes for secrets, run ESLint and Prettier on staged files, typecheck the touched packages and check that commit messages follow Conventional Commits.

## Backups

`scripts/backup.sh` writes an encrypted (`age`) `pg_dump` to the `lostfound-backups` bucket in MinIO and keeps 35 days of backups. `scripts/restore-test.sh` restores the newest one into a throwaway Postgres container and runs the audit-chain check on it. The local encryption key is created in `.backup-keys/`, which git ignores. Keep a copy of it somewhere else, because without it no backup can be read.

## Layout

```
apps/server      Hono API: src/platform (shared plumbing) and src/modules (one folder per business area)
apps/web         React SPA: src/routes (pages) and src/features (flows)
packages/domain  Pure business rules: roles, record IDs, state machines, working-day calendar
packages/contracts  Zod request/response schemas shared by server and web
packages/ui      Design tokens (8 colour modes) and the base components
infra            Docker Compose for the local stand-ins
e2e              Playwright tests
docs             SRS, plan, ADRs, design reference (Figma screenshots and tokens)
```
