-- Trigram search for found items (FR-10, NFR-02: search under 1 s across 50k records).
-- pg_trgm is a trusted extension, so the database owner (lf_owner) may create it.
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
