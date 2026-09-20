-- =============================================================================
-- 000002_projects_and_composite_tenancy.up.sql
-- Spatial Schema & Composite Relational Tenancy Keys
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- -----------------------------------------------------------------------------
-- Projects (Tenant-Scoped Container)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id               UUID NOT NULL DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             VARCHAR(255) NOT NULL,
    description      TEXT,
    target_commodity VARCHAR(100), -- Gold, Lithium, Copper, Rare Earths
    crs_epsg         VARCHAR(50) NOT NULL DEFAULT 'EPSG:4326',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (organization_id, id),
    UNIQUE (id) -- Allows singular foreign key references where appropriate, while composite key enforces isolation
);

CREATE INDEX IF NOT EXISTS idx_projects_org_updated ON projects (organization_id, updated_at);

-- -----------------------------------------------------------------------------
-- Concessions / Tenements (Composite Tenant Foreign Key)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS concessions (
    id              UUID NOT NULL DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id      UUID NOT NULL,
    code            VARCHAR(100) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    license_type    VARCHAR(100) NOT NULL,
    geom            GEOMETRY(MultiPolygon, 4326),
    status          VARCHAR(50) DEFAULT 'active',
    valid_until     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      BIGINT NOT NULL,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (organization_id, id),
    UNIQUE (id),
    CONSTRAINT fk_concessions_project_tenant
        FOREIGN KEY (organization_id, project_id)
        REFERENCES projects(organization_id, id)
        ON DELETE CASCADE,
    UNIQUE (organization_id, project_id, code)
);

CREATE INDEX IF NOT EXISTS idx_concessions_geom ON concessions USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_concessions_tenant_updated ON concessions (organization_id, project_id, updated_at);

-- -----------------------------------------------------------------------------
-- Stations (Outcrop Observation Points)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stations (
    id               UUID NOT NULL,
    organization_id  UUID NOT NULL,
    project_id       UUID NOT NULL,
    code             VARCHAR(50) NOT NULL,
    name             VARCHAR(255),
    geom             GEOMETRY(PointZ, 4326) NOT NULL,
    gps_accuracy     DOUBLE PRECISION,
    outcrop_exposure VARCHAR(50),
    lithology        VARCHAR(255),
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       BIGINT NOT NULL,
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (organization_id, id),
    UNIQUE (id),
    CONSTRAINT fk_stations_project_tenant
        FOREIGN KEY (organization_id, project_id)
        REFERENCES projects(organization_id, id)
        ON DELETE CASCADE,
    UNIQUE (organization_id, project_id, code)
);

CREATE INDEX IF NOT EXISTS idx_stations_geom ON stations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_stations_tenant_updated ON stations (organization_id, project_id, updated_at);

-- -----------------------------------------------------------------------------
-- Structural Measurements (Composite Tenant Foreign Key via Station)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS structural_measurements (
    id               UUID NOT NULL,
    organization_id  UUID NOT NULL,
    station_id       UUID NOT NULL,
    measurement_type VARCHAR(100) NOT NULL,
    strike           DOUBLE PRECISION NOT NULL,
    dip              DOUBLE PRECISION NOT NULL,
    dip_direction    DOUBLE PRECISION,
    auto_captured    BOOLEAN NOT NULL DEFAULT FALSE,
    trend            DOUBLE PRECISION,
    plunge           DOUBLE PRECISION,
    notes            TEXT,
    updated_at       BIGINT NOT NULL,
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (organization_id, id),
    UNIQUE (id),
    CONSTRAINT fk_measurements_station_tenant
        FOREIGN KEY (organization_id, station_id)
        REFERENCES stations(organization_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_measurements_station_tenant ON structural_measurements (organization_id, station_id);

-- -----------------------------------------------------------------------------
-- Rock Samples (Composite Tenant Foreign Key)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rock_samples (
    id                   UUID NOT NULL,
    organization_id      UUID NOT NULL,
    station_id           UUID NOT NULL,
    sample_tag           VARCHAR(100) NOT NULL,
    lithology_class      VARCHAR(255),
    mineralization_notes TEXT,
    photo_r2_keys        TEXT[] NOT NULL DEFAULT '{}',
    updated_at           BIGINT NOT NULL,
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,
    assays_status        VARCHAR(50) NOT NULL DEFAULT 'pending',
    PRIMARY KEY (organization_id, id),
    UNIQUE (id),
    CONSTRAINT fk_samples_station_tenant
        FOREIGN KEY (organization_id, station_id)
        REFERENCES stations(organization_id, id)
        ON DELETE CASCADE,
    UNIQUE (organization_id, station_id, sample_tag)
);

CREATE INDEX IF NOT EXISTS idx_samples_station_tenant ON rock_samples (organization_id, station_id);

-- -----------------------------------------------------------------------------
-- Immutable Raw Survey Observations (Append-Only Scientific Evidence)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_observations (
    id               UUID NOT NULL DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    project_id       UUID NOT NULL,
    station_id       UUID,
    device_id        VARCHAR(100) NOT NULL,
    operator_user_id UUID REFERENCES users(id),
    geom             GEOMETRY(PointZ, 4326) NOT NULL,
    gps_accuracy     DOUBLE PRECISION,
    heading_deg      DOUBLE PRECISION,
    pitch_deg        DOUBLE PRECISION,
    roll_deg         DOUBLE PRECISION,
    mag_field_ut     DOUBLE PRECISION,
    raw_payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at      BIGINT NOT NULL,
    received_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, id),
    CONSTRAINT fk_raw_obs_project_tenant
        FOREIGN KEY (organization_id, project_id)
        REFERENCES projects(organization_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_raw_obs_geom ON raw_observations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_raw_obs_tenant_project ON raw_observations (organization_id, project_id, recorded_at DESC);

-- Invariant: Raw observations are immutable and can NEVER be overwritten or updated
CREATE OR REPLACE FUNCTION trg_prevent_raw_observation_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Raw observations are immutable scientific records. UPDATE and DELETE are prohibited.'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_raw_observations_immutable ON raw_observations;
CREATE TRIGGER trg_raw_observations_immutable
    BEFORE UPDATE OR DELETE ON raw_observations
    FOR EACH ROW
    EXECUTE FUNCTION trg_prevent_raw_observation_mutation();

-- -----------------------------------------------------------------------------
-- Boreholes & Intervals (Composite Tenant Foreign Key)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boreholes (
    id                    UUID NOT NULL,
    organization_id       UUID NOT NULL,
    project_id            UUID NOT NULL,
    borehole_code         VARCHAR(50) NOT NULL,
    name                  VARCHAR(255),
    geom                  GEOMETRY(PointZ, 4326) NOT NULL,
    total_depth_meters    DOUBLE PRECISION,
    water_strike_depth    DOUBLE PRECISION,
    yield_liters_per_hour DOUBLE PRECISION,
    updated_at            BIGINT NOT NULL,
    is_deleted            BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (organization_id, id),
    UNIQUE (id),
    CONSTRAINT fk_boreholes_project_tenant
        FOREIGN KEY (organization_id, project_id)
        REFERENCES projects(organization_id, id)
        ON DELETE CASCADE,
    UNIQUE (organization_id, project_id, borehole_code)
);

CREATE INDEX IF NOT EXISTS idx_boreholes_geom ON boreholes USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_boreholes_tenant_updated ON boreholes (organization_id, project_id, updated_at);

CREATE TABLE IF NOT EXISTS borehole_intervals (
    id                  UUID NOT NULL,
    organization_id     UUID NOT NULL,
    borehole_id         UUID NOT NULL,
    depth_from          DOUBLE PRECISION NOT NULL,
    depth_to            DOUBLE PRECISION NOT NULL,
    lithology           VARCHAR(255),
    description         TEXT,
    recovery_percentage DOUBLE PRECISION DEFAULT 100.0,
    PRIMARY KEY (organization_id, id),
    CONSTRAINT fk_borehole_intervals_tenant
        FOREIGN KEY (organization_id, borehole_id)
        REFERENCES boreholes(organization_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intervals_borehole_tenant ON borehole_intervals (organization_id, borehole_id);
