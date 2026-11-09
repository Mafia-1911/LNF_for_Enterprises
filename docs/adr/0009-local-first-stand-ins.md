# ADR-0009: Local-first stand-ins for every external service

Status: accepted · 2026-11-09

## Context

No cloud accounts, no costs, no sign-ups. Everything must run on a laptop, and moving to the real services later must be an environment change only.

## Decision

| Real service          | Local stand-in                                                                                      | Switch                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Cloudflare R2         | MinIO (`cgr.dev/chainguard/minio`, pinned by digest; official MinIO images are no longer published) | `STORAGE_*`                                             |
| Email provider        | Mailpit                                                                                             | `EMAIL_TRANSPORT=smtp`, `SMTP_*`                        |
| SMS gateway           | `DevSmsAdapter` (logs the code, dev page `/dev/sms`)                                                | `SMS_PROVIDER=dev` (refused when `NODE_ENV=production`) |
| Microsoft Entra       | `ghcr.io/navikt/mock-oauth2-server`                                                                 | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`   |
| VM, Caddy, Cloudflare | localhost                                                                                           | n/a                                                     |

Each adapter is a small interface in `apps/server/src/platform` with one implementation per provider.

## Consequences

- The config refuses to start in production with dev adapters or the placeholder keys from `.env.example`.
- Sentry is skipped; structured logs carry a request id on every line.
