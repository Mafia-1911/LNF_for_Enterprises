---
trigger: glob
globs: '**/migrations/**'
description: Rules for database migrations
---

# Migrations

- Generate schema migrations with `pnpm db:generate` after editing a module's `schema.ts`. Never hand-edit a generated file; add a new migration instead.
- Hand-written SQL (triggers, grants, functions) goes in a custom migration: `pnpm --filter @lf/server exec drizzle-kit generate --custom --name <what>`.
- Every migration must be backward compatible with the previous app version: add columns/tables first, backfill, remove in a later release. No `DROP COLUMN`, no renames, no `NOT NULL` without a default on an existing table.
- Create indexes on existing large tables with `CREATE INDEX CONCURRENTLY` in its own migration.
- New tables get `tenant_id uuid not null references tenants(id)` and every index that serves a query starts with `tenant_id`.
- The app role (`lf_app`) gets privileges from default privileges set in `0001`. Insert-only tables must `REVOKE UPDATE, DELETE, TRUNCATE` from `lf_app` and add the `reject_mutation()` trigger (see the audit migration).
- `pnpm verify` runs `squawk` on every migration. Do not silence a squawk rule; fix the migration.
- Migrations are owned by humans (CODEOWNERS). Explain the reason in the PR.
