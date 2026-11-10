# Phase 0 + 0.5 implementation plan

Status: in progress · Written 9 Nov 2026 · Scope: plan v0.3 §4 and §14 phases 0 and 0.5, with the local-first rules from the Phase 0 prompt.

## 1. Milestones and order

Each milestone ends with the parts of `pnpm verify` that exist so far, then a conventional commit.

| #   | Milestone                | Main output                                                                                                                                                                                                     |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | Repo and tooling         | pnpm workspace, tsconfig (strictest), ESLint + boundaries + the five §3.2 rules, Prettier, lefthook, AGENTS.md, `.agents/rules/`, CODEOWNERS, ADRs, docs moved                                                  |
| b   | Local infra and platform | `infra/docker-compose.dev.yml` (Postgres 16, MinIO, Mailpit, mock OIDC), `.env.example`, `platform/{config,logger,errors,clock,calendar,db,storage,email,sms,jobs,http}`, `/healthz`, OpenAPI JSON, SPA serving |
| c   | Auth                     | Better-Auth (generic OIDC, email OTP, phone OTP), staff-SSO-only and domain rules, role middleware, `/api/me`                                                                                                   |
| d   | Core data and audit      | tenants, role assignments, catalog tables + NSU seed, `packages/domain` (IDs, lifecycles, calendar), audit tables + triggers + checkpoint job + `verify-audit`, backup/restore scripts                          |
| e   | UI tokens and components | `packages/ui` tokens (8 modes, generated CSS), the 16 base components, `/dev/components`                                                                                                                        |
| f   | Auth screens and shell   | Sign in, Visitor sign up, code entry, student shell (header, nav, tab bar), role landing redirect, prototype toolbar (dev/staging), admin Appearance page                                                       |
| g   | Golden slice backend     | contracts, schema, repo, `transition()`, service with `withTx` + `boss.send`, route, `match-lost-report` job stub, API + rollback tests                                                                         |
| h   | Golden slice frontend    | 4 steps + submitted screen, drafts, generated client, Playwright (360 px + 1280 px) + axe                                                                                                                       |
| i   | Quality gates green      | Stryker ≥ 80 %, route coverage check, squawk, drift check, audit, gitleaks, semgrep, CI workflow, README                                                                                                        |

## 2. Key design decisions (best guesses, all listed in the final report)

1. **Default theme: Teal · Dark.** Every screen in the Figma file uses it (the Figma variable default is Navy · Light). Stored per tenant as the `appearance` policy; only the IT admin role can change it, including custom palettes. No user-facing theme toggle anywhere. The prototype toolbar does not get theme swatches.
2. **Theme storage:** `policies` table (catalog module), key `appearance` = `{ preset, mode: light|dark|system, custom? }`. `GET /api/theme` is public (the sign-in page needs it); `PUT /api/admin/theme` is IT admin only, validated with Zod including WCAG contrast checks, and audited.
3. **Custom palette** = a base preset plus overrides for the 8 brand tokens, for light and dark. The contrast check rejects pairs below AA.
4. **Accessibility fixes to Figma colours** (prompt rule 7.10): new `border/control` token for input, checkbox and toggle boundaries (3:1); `status/on-danger` / `status/on-success` for dark modes; placeholders at full `text/muted`; success-hero check icon uses `brand/on-primary`. Values in `docs/design/README.md`.
5. **16 px minimum text** (SRS + prompt): every type style below 16 px is raised to 16 px. The only exception is the logo lockup subtitle, which is part of the logo; the dev-only prototype toolbar keeps its Figma sizes.
6. **IDs:** `<TYPE>-<YYMM>-<SEQ><CHECK>` with a fixed 4-digit SEQ (9,999 per type per month per tenant) and a mod-23 weighted check letter over the type index and all digits, drawn from a 23-letter alphabet without I, O and U. A fixed width is what makes the "any single changed character is detected" property hold even when dashes are optional.
7. **`transition()` lives in the audit module** (it must write audit rows, and only the audit repo touches audit tables). Each module binds it once to its machine and repo functions: `lostReportTransition(tx, record, event, data)`.
8. **Schema files may import other modules' `schema.ts` for foreign keys only.** This is the one exception to plan §3.2 rule 2, enforced by lint. `tenants` and `id_counters` live in `platform` because every module needs them.
9. **Drizzle without the relational `schema` option.** Plain query builder only, so no file has to aggregate every module's schema.
10. **Reads also go through `withTx(ctx, fn, { readOnly: true })`**, so services never hold the raw `db`.
11. **Tenant resolution by Host header** (`tenants.hostnames`). Dev maps `localhost` to NSU; API tests use `nsu.test` and `other.test`.
12. **Match job stub** writes a `match_runs` row (no found items exist yet) in a small `matching` module.
13. **Holidays table** in a small `retention` module (plan §3.1 says retention owns the holiday calendar).
14. **Office location** (plan §9.4): Admin Building, Ground floor, Security Room.
15. **"Claims Resolved within 30 Mins"** (plan §9.5) becomes "48 hours · to hand in a found item".
16. **Avatars** use initials for seeded users; no stock face photos go into the repo.
17. **MinIO:** the official images are no longer published, so the dev stack uses `cgr.dev/chainguard/minio` (free, built from MinIO source) pinned by digest.
18. **Versions:** pinned to the newest release that satisfies every peer range. TypeScript 5.9.3 (typescript-eslint needs < 6.1 and openapi-typescript needs 5.x; 7.0 is out), ESLint 9.39.5 (eslint-plugin-jsx-a11y does not support 10 yet), Node 22 per the plan.
19. **Dev runtime:** `tsx watch` for the server, Vite dev server with `/api` proxy for the SPA. In production the Hono app serves the built SPA.
20. **API tests** use the compose Postgres: a template database is migrated and seeded once, then each test file gets `CREATE DATABASE … TEMPLATE`, so insert-only audit tables never need truncating.

## 3. Risks

| Risk                                                                                                                        | Mitigation                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Library APIs moved since the plan's snippets (pg-boss 12, Better-Auth 1.7, boundaries 7, zod-openapi 1.6, Vite 8, Vitest 5) | Read the installed type definitions before use; note every difference in the report                                         |
| pg-boss needs DDL rights for queues                                                                                         | Migration owner creates the pg-boss schema; app role gets only the rights pg-boss needs, checked against the pinned version |
| Root disk nearly full (Docker images, browsers)                                                                             | Reuse cached Chromium build 1248, `uvx semgrep` instead of a Docker image, small Alpine images                              |
| NTFS project drive                                                                                                          | Symlinks and exec tested OK; pnpm store kept on the same drive                                                              |
| Mutation score below 80 %                                                                                                   | Property tests plus exhaustive transition tables in `packages/domain`                                                       |
| Playwright needs the whole stack                                                                                            | `webServer` starts server and web; email OTP read from the Mailpit API                                                      |

## 4. Task list

- [x] a1 workspace, tsconfig, prettier, editorconfig, nvmrc, gitignore
- [x] a2 ESLint flat config with boundaries and §3.2 rules (+ a lint self-test fixture)
- [x] a3 lefthook + lint-staged + commit-msg check
- [x] a4 AGENTS.md, `.agents/rules/*`, CODEOWNERS, ADRs 0001–0010, docs/todo.md
- [x] b1 compose file + Postgres init (roles, DBs) + MinIO bucket init + Mailpit + mock OIDC (custom login page)
- [x] b2 config, logger, errors, clock, calendar wrapper
- [x] b3 db pool, `withTx`, migrations runner, roles and grants
- [x] b4 pg-boss bootstrap + graceful shutdown
- [x] b5 Hono app: headers, CORS, body limit, request id, healthz, openapi, SPA
- [x] b6 storage, email, SMS adapters
- [x] c1 Better-Auth schema + config + three methods
- [x] c2 sign-in policy hooks (domain, staff SSO only, visitor phone only)
- [x] c3 role middleware, `/api/me`, dev impersonation for "View as"
- [x] d1 tenants, policies, catalog schema + seed (NSU + tenant B)
- [x] d2 packages/domain: ids, lifecycles, calendar + tests
- [x] d3 audit module: tables, triggers, transition, checkpoint job, verify-audit
- [x] d4 seed.ts (idempotent), practice dataset, backup.sh, restore-test.sh
- [x] e1 token build script → CSS variables for 8 modes (+ a11y additions)
- [x] e2 components + `/dev/components`
- [x] f1 sign-in, visitor sign-up, code entry, auth client
- [x] f2 shell, landing redirect, role placeholders, appearance admin page
- [x] f3 prototype toolbar (dev/staging only) + clock endpoint
- [x] g1 lost report contracts, schema, repo, machine binding
- [x] g2 service + route + job stub + private details encryption
- [x] g3 API tests (two tenants, expectNoLeak, auth cases, rollback)
- [x] h1 flow screens + drafts + submitted screen
- [x] h2 Playwright + axe
- [x] i1 Stryker, route-coverage check, squawk, drift check, audit, gitleaks, semgrep
- [ ] i2 CI workflow, README, final report
