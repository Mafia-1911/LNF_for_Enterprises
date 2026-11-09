# ADR-0008: Vite + React SPA, not SSR

Status: accepted · 2026-11-09

## Context

The app sits behind sign-in, so SEO does not matter. One Node container should serve everything.

## Decision

**Vite + React SPA** with TanStack Router, TanStack Query, React Hook Form, Tailwind 4 and Radix UI. The Hono app serves the built files with a history fallback; in development Vite proxies `/api` to the server. Types for API calls are generated from the server's OpenAPI document (`pnpm gen:api`, `openapi-typescript` + `openapi-fetch`), and CI fails if the generated file is stale.

## Consequences

- No server rendering framework. The design tokens and base components live in `packages/ui`.
- The prototype toolbar is compiled out of production builds.
