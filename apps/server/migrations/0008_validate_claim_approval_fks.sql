-- Validates the two foreign keys 0007 added to claims as NOT VALID. VALIDATE takes only a
-- SHARE UPDATE EXCLUSIVE lock, so reads and writes to claims continue meanwhile.
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
ALTER TABLE "claims" VALIDATE CONSTRAINT "claims_approval_requested_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "claims" VALIDATE CONSTRAINT "claims_supervisor_approved_by_users_id_fk";
