-- =============================================================================
-- 000001_organizations_tenancy_and_audit.up.sql
-- Core Tenancy, User Identities, RBAC Memberships, Sessions, and Immutable Audit
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Organizations (Tenancy Roots)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations (slug);

-- -----------------------------------------------------------------------------
-- Users (Global Identities)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    display_name  VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    totp_secret_enc TEXT,               -- AES-256-GCM encrypted TOTP seed
    mfa_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- -----------------------------------------------------------------------------
-- Organization Memberships (RBAC)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'geologist', 'viewer')),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members (organization_id, role);

-- -----------------------------------------------------------------------------
-- User MFA Single-Use Recovery Codes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_recovery_codes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  VARCHAR(255) NOT NULL, -- bcrypt/argon2 hash
    used       BOOLEAN NOT NULL DEFAULT FALSE,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON user_recovery_codes (user_id, used);

-- -----------------------------------------------------------------------------
-- User Sessions & Sudo State
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(255) NOT NULL UNIQUE,
    status             VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    ip_address         INET,
    user_agent         TEXT,
    sudo_expires_at    TIMESTAMPTZ,
    expires_at         TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_lookup ON user_sessions (session_token_hash, status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions (expires_at);

-- -----------------------------------------------------------------------------
-- Append-Only Immutable Audit Logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email      VARCHAR(255),
    action           VARCHAR(100) NOT NULL,
    resource_type    VARCHAR(100) NOT NULL,
    resource_id      VARCHAR(255) NOT NULL,
    ip_address       INET,
    user_agent       TEXT,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs (organization_id, resource_type, resource_id);

-- Enforce append-only invariant on audit_logs via trigger
CREATE OR REPLACE FUNCTION trg_prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE statements are strictly prohibited.'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION trg_prevent_audit_mutation();
