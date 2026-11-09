# ADR-0002: pg-boss for jobs, timers and retries

Status: accepted · 2026-11-09

## Context

State changes and the jobs they trigger (matching, emails, timers) must commit or roll back together. Adding Redis for a queue would be a second stateful system for a demo-sized deployment.

## Decision

Use **pg-boss** (pinned 12.x) in the same PostgreSQL database. Jobs are created inside the business transaction with `boss.send(name, data, { db: tx.jobs })`, where `tx.jobs` runs SQL on the same `pg` client as Drizzle (`platform/db/tx.ts`). pg-boss's schema is installed by the migration owner; the app role runs with `migrate: false` and `createSchema: false`.

## Consequences

- A thrown error after `boss.send` leaves no job and no state change (covered by `apps/server/src/modules/items/submit-lost-report.api.test.ts`).
- pg-boss 12 also offers `fromDrizzle(tx, sql)`; we keep the plan's single-client executor because it needs no wrapper and shares the exact client.
- Cron schedules run once across instances; the audit checkpoint job also takes an advisory lock.
- Do not add Redis for jobs (plan §15).
