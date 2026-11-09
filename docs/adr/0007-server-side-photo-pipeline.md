# ADR-0007: Server-side photo pipeline (no signed uploads)

Status: accepted · 2026-11-09

## Context

Signed upload URLs let raw photos with GPS metadata reach object storage, and nothing checks the upload is a real image.

## Decision

Every photo goes through `POST /api/photos` (phase 1): sniff magic bytes, decode, rotate, strip metadata, resize and re-encode to WebP with `sharp`; only the clean file is stored. The browser re-encodes HEIC to JPEG first. Raw bytes are never stored. Phase 0 builds only the storage adapter (health check and signed GET for hidden photos).

## Consequences

- No presigned PUT URLs anywhere. Do not add them.
- The lost-report form shows a disabled "Photos (coming soon)" area until phase 1.
