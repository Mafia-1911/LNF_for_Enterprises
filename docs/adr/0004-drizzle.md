# ADR-0004: Drizzle on node-postgres

Status: accepted · 2026-11-09

## Context

We want typed SQL that stays close to SQL, readable migrations, and the ability to run Drizzle and pg-boss on one `pg` client inside a transaction.

## Decision

Use **Drizzle ORM** (0.45.x) on `node-postgres`, with **drizzle-kit** generating SQL migrations into `apps/server/migrations`. Hand-written SQL (triggers, grants, pg-boss install) goes in custom migrations. Each module owns its tables in `schema.ts`; only that module's `repo.ts` queries them. We use the query builder only (no relational `schema` option), so no file has to import every module's schema.

## Consequences

- Two database roles: `lf_owner` runs migrations, `lf_app` has DML only (and INSERT/SELECT only on audit tables).
- Migrations must stay backward compatible with the previous app version (add first, remove later); `squawk` lints them in CI.
- Drizzle 1.0 is in release candidate; upgrade through Renovate when stable.
