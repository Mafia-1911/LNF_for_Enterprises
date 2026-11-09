-- The audit log is insert-only (FR-14, plan §5.4, ADR-0006): the app role can only INSERT and
-- SELECT, and triggers reject UPDATE, DELETE and TRUNCATE for every role, including the owner.
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events, audit_checkpoints, audit_checkpoint_events FROM lf_app;
--> statement-breakpoint
CREATE TRIGGER audit_events_insert_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_checkpoints_insert_only BEFORE UPDATE OR DELETE ON audit_checkpoints
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_checkpoints_no_truncate BEFORE TRUNCATE ON audit_checkpoints
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_checkpoint_events_insert_only BEFORE UPDATE OR DELETE ON audit_checkpoint_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_checkpoint_events_no_truncate BEFORE TRUNCATE ON audit_checkpoint_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
