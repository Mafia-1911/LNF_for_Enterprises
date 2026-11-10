# ADR-0003: Better-Auth for sign-in

Status: accepted · 2026-11-09

## Context

Students and staff sign in with university SSO (Microsoft Entra later), with email OTP as a fallback; visitors use phone OTP. Staff roles must use SSO only. We need sessions in Postgres and no passwords.

## Decision

Use **Better-Auth** (pinned 1.7.x) mounted at `/api/auth/*`, with the `genericOAuth` (OIDC), `emailOTP` and `phoneNumber` plugins and the Drizzle adapter. Policy rules (university domain, staff SSO only, visitors phone only) run in Better-Auth `hooks.before`/`databaseHooks` (`platform/auth/index.ts`), which call the `AuthPolicy` from `createAuthPolicy` in `modules/identity/service.ts`. Platform code never imports a module; the policy is passed in from `services.ts`. Locally, `ghcr.io/navikt/mock-oauth2-server` stands in for Entra (ADR-0009).

## Consequences

- OTP: 6 digits, 5 minutes, 5 attempts, hashed at rest, rate limited (Better-Auth limiter + plugin limits).
- Sessions are HttpOnly, SameSite=Lax cookies; Secure in production.
- Telemetry is explicitly disabled.
- Switching to Entra is an environment change: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`.
