---
trigger: glob
globs: 'apps/server/src/{platform/db,platform/crypto,platform/clock,platform/tenancy,modules/identity,modules/audit,modules/dispatch}/**'
description: Extra care for identity, audit, crypto, tenancy and dispatch code
---

# Security-sensitive paths

These paths need human review (CODEOWNERS). Keep changes small and explain them.

- **Tenancy:** every repo function takes `tenantId` and uses it in every `where`, insert and join. Every API test runs `expectNoLeak` for tenant B. Never resolve the tenant from request bodies; it comes from the `Host` header via `platform/tenancy`.
- **Private details, claim answers, pickup codes:** encrypt with `platform/crypto` (AES-256-GCM with `key_version`). Never return them to students, never log them, never put them in errors or test snapshots. Add new field names to the logger deny-list in `platform/logger`.
- **Audit:** `audit_events`, `audit_checkpoints`, `audit_checkpoint_events` are insert-only. Never add UPDATE/DELETE code paths. State changes go through `transition()` only.
- **Auth:** staff roles (desk_officer, supervisor, it_admin) sign in with SSO only; visitors with phone OTP only; email OTP only for the tenant's university domain. Keep these checks in `modules/identity/auth-policy.ts` with tests.
- **Clock:** the only source of "now" is `platform/clock`. Time-travel is dev/staging only.
- **Secrets:** never commit real values. `.env.example` holds obviously fake development values that production refuses.
- Errors shown to users are one sentence: what happened and what to do next. No stack traces, codes or internal IDs.
