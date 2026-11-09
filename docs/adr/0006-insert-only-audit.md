# ADR-0006: Insert-only audit log with membership checkpoints

Status: accepted · 2026-11-09

## Context

FR-14 requires an append-only log of every state change. Hashing `bigserial` ID ranges misses rows that commit out of order (event 101 can commit after 102). Writing a checkpoint id back onto audit rows would need UPDATE on a table we promised is insert-only.

## Decision

Three insert-only tables: `audit_events`, `audit_checkpoints`, `audit_checkpoint_events` (membership). The hourly job takes `pg_advisory_xact_lock`, selects events with no membership row, hashes them in id order with the previous checkpoint hash, and inserts the checkpoint and its memberships. Late commits land in the next checkpoint. Triggers reject UPDATE, DELETE and TRUNCATE on all three tables, and the app role only has INSERT and SELECT. `scripts/verify-audit.ts` recomputes every checkpoint and the chain.

## Consequences

- Every state change goes through `transition()` (exported by `modules/audit`), which writes the audit row in the same transaction.
- Tests never truncate audit tables; each API test file gets a fresh database cloned from a template.
