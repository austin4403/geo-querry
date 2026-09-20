-- =============================================================================
-- 000004_billing_and_entitlements.sql
-- Trusted Pricing Catalog, Minor-Unit Monetary Columns, Idempotent Inbox, Ledger
-- =============================================================================

CREATE TABLE IF NOT EXISTS plans (
    plan_id            VARCHAR(100) PRIMARY KEY,
    name               VARCHAR(255) NOT NULL,
    description        TEXT,
    currency           VARCHAR(10) NOT NULL, -- 'KES' or 'USD'
    amount_minor_units BIGINT NOT NULL,      -- e.g. 500000 for 5000 KES, 4900 for $49 USD
    billing_interval   VARCHAR(50) NOT NULL, -- 'month' or 'year'
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_positive_amount CHECK (amount_minor_units >= 0)
);

CREATE TABLE IF NOT EXISTS payment_attempts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id              VARCHAR(100) NOT NULL REFERENCES plans(plan_id),
    provider             VARCHAR(50) NOT NULL CHECK (provider IN ('mpesa', 'stripe')),
    amount_minor_units   BIGINT NOT NULL,
    currency             VARCHAR(10) NOT NULL,
    status               VARCHAR(50) NOT NULL DEFAULT 'INITIATED' 
                         CHECK (status IN ('INITIATED', 'PENDING', 'SETTLED', 'FAILED', 'EXPIRED', 'RECONCILED')),
    provider_attempt_id  VARCHAR(255),
    customer_identifier  VARCHAR(255),
    failure_reason       TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_org ON payment_attempts (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_prov_id ON payment_attempts (provider, provider_attempt_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_pending ON payment_attempts (provider, status) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS payment_transactions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_attempt_id      UUID NOT NULL REFERENCES payment_attempts(id) ON DELETE RESTRICT,
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    provider                VARCHAR(50) NOT NULL,
    provider_transaction_id VARCHAR(255) NOT NULL UNIQUE,
    amount_minor_units      BIGINT NOT NULL,
    currency                VARCHAR(10) NOT NULL,
    settled_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_transactions_org ON payment_transactions (organization_id, settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_receipt ON payment_transactions (provider_transaction_id);

CREATE TABLE IF NOT EXISTS webhook_inbox (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider     VARCHAR(50) NOT NULL,
    event_id     VARCHAR(255) NOT NULL,
    payload      JSONB NOT NULL,
    status       VARCHAR(50) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED')),
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_inbox_pending ON webhook_inbox (provider, status, received_at) WHERE status = 'RECEIVED';

CREATE TABLE IF NOT EXISTS organization_subscriptions (
    organization_id      UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id              VARCHAR(100) NOT NULL REFERENCES plans(plan_id),
    provider             VARCHAR(50) NOT NULL,
    status               VARCHAR(50) NOT NULL DEFAULT 'INACTIVE'
                         CHECK (status IN ('INACTIVE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID')),
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_entitlements (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    feature_key     VARCHAR(100) NOT NULL,
    is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMPTZ,
    PRIMARY KEY (organization_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_org ON organization_entitlements (organization_id);
