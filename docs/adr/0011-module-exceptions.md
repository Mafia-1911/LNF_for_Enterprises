# ADR-0011: Two deliberate refinements to the module rules

Status: accepted · 2026-11-09

## Context

Plan §3.2 says `schema.ts` can't be imported outside its module, and §3.4 says state changes go through `transition(tx, record, event, data)`, which also inserts the audit event. Foreign keys across modules need the referenced table object, and only the audit module may write audit tables.

## Decision

1. A module's `schema.ts` may import another module's `schema.ts`, **for foreign keys only**. Lint allows exactly this pair and nothing else.
2. `transition()` lives in `modules/audit` and is bound once per record type: `bindTransition({ recordType, machine, create, update })` returns `transition(tx, record, event, data)`. The machine (from `packages/domain`) checks the event and role, the module's repo writes the row, and the audit module inserts the event, all on `tx`.
3. Tables every module needs (`tenants`, `id_counters`) live in `platform`.

## Consequences

- Cross-module queries still go through the other module's `index.ts` service functions.
