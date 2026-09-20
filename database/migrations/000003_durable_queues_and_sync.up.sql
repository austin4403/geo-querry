-- =============================================================================
-- 000003_durable_queues_and_sync.up.sql
-- Durable Job Queues (River), Sync Operations, and Tombstones
-- =============================================================================

-- -----------------------------------------------------------------------------
-- River Queue Core Schema (PostgreSQL Durable Job Engine)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS river_job (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    args        JSONB NOT NULL,
    attempt     SMALLINT NOT NULL DEFAULT 0,
    attempted_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    errors      JSONB[] NOT NULL DEFAULT '{}',
    finalized_at TIMESTAMPTZ,
    kind        TEXT NOT NULL,
    max_attempts SMALLINT NOT NULL DEFAULT 5,
    metadata    JSONB NOT NULL DEFAULT '{}',
    priority    SMALLINT NOT NULL DEFAULT 1,
    queue       TEXT NOT NULL DEFAULT 'default',
    state       TEXT NOT NULL DEFAULT 'available' CHECK (state IN ('available', 'cancelled', 'completed', 'discarded', 'pending', 'retryable', 'running', 'scheduled')),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tags        VARCHAR(255)[] NOT NULL DEFAULT '{}',
    unique_key  BYTEA
);

CREATE INDEX IF NOT EXISTS idx_river_job_state_queue ON river_job (queue, state, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_river_job_kind ON river_job (kind);

CREATE TABLE IF NOT EXISTS river_leader (
    elected_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    leader_id  TEXT NOT NULL PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT 'default' UNIQUE
);

CREATE TABLE IF NOT EXISTS river_client (
    id         TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata   JSONB NOT NULL DEFAULT '{}',
    paused_at  TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Sync Operations (Audited Delta Ingestion)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_operations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,
    project_id        UUID NOT NULL,
    client_device_id  VARCHAR(100) NOT NULL,
    client_timestamp  BIGINT NOT NULL,
    server_timestamp  BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    entity_type       VARCHAR(50) NOT NULL,
    entity_id         UUID NOT NULL,
    operation         VARCHAR(20) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    status            VARCHAR(50) NOT NULL DEFAULT 'COMMITTED',
    conflict_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_ops_project_server ON sync_operations (organization_id, project_id, server_timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_ops_entity ON sync_operations (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- Sync Tombstones (90-Day Retention Floor Tracking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_tombstones (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL,
    project_id         UUID NOT NULL,
    entity_type        VARCHAR(50) NOT NULL,
    entity_id          UUID NOT NULL,
    deleted_at_unix_ms BIGINT NOT NULL,
    retention_floor_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days'),
    UNIQUE (project_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_tombstones_tenant_proj ON sync_tombstones (organization_id, project_id, deleted_at_unix_ms);
CREATE INDEX IF NOT EXISTS idx_tombstones_retention ON sync_tombstones (retention_floor_at);
