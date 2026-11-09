# ADR-0005: Tenant isolation without row-level security in v1

Status: accepted · 2026-11-09

## Context

One university today, more later. RLS adds friction for every query and test while there is a single tenant.

## Decision

v1 isolates tenants with three layers (plan §5.3):

1. **Lint:** raw DB access only in `repo.ts` and `platform/*` (`eslint/architecture.js`).
2. **Convention:** every repo function takes `tenantId` as its first data argument and uses it in every `where`, insert and join.
3. **Two-tenant tests:** the API harness seeds tenant A (`nsu.test`) and tenant B (`other.test`) with overlapping data (same names, same LST IDs). `expectNoLeak` runs on every tenant-A response, and `pnpm check:routes` fails if a route has no API test.

Tenants are resolved from the request `Host` header (`tenants.hostnames`).

## Consequences

- Add fail-closed RLS (no tenant setting = no rows) when a second university is onboarded (plan §15).
