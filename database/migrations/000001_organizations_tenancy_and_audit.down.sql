-- =============================================================================
-- 000001_organizations_tenancy_and_audit.down.sql
-- Rollback for Core Tenancy and Audit
-- =============================================================================

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
DROP FUNCTION IF EXISTS trg_prevent_audit_mutation();
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS user_recovery_codes;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;
