# ADR-0001: Hono for the HTTP server

Status: accepted · 2026-11-09

## Context

Most code is written by AI agents. NestJS decorators and dependency injection were a frequent source of agent mistakes in the v0.2 review, and Better-Auth and Zod fit awkwardly into it.

## Decision

The server is **Hono** on Node.js 22 (`@hono/node-server`), with routes declared through **`@hono/zod-openapi`** `createRoute`. Dependencies are wired by a plain `createServices(deps)` composition root (`apps/server/src/app.ts`); tests pass fakes as arguments. Module structure is enforced by ESLint (`eslint/architecture.js`), not by the framework.

## Consequences

- One declaration per route gives validation, types and the OpenAPI document (`/api/openapi.json`).
- No decorators, no DI container. Agents copy the lost-report slice (`apps/server/src/modules/items`).
- Do not bring back NestJS or another DI framework without a new ADR.
