-- =============================================================================
-- 000001_init.sql — GeoQuerry spatial schema (PostgreSQL 16+ / PostGIS 3.4+)
-- =============================================================================
-- CONVENTIONS USED THROUGHOUT THIS SCHEMA (the sync engine depends on them):
--
--   1. updated_at is BIGINT storing UNIX MILLISECONDS (not TIMESTAMPTZ!).
--      The mobile client also tracks time as unix-ms int64 in protobuf, so
--      comparing "who wrote last" (Last-Write-Wins) is a single integer
--      compare with no timezone parsing on the hot sync path.
--
--   2. Every syncable row carries is_deleted BOOLEAN. Offline devices can't
--      know what other devices deleted, so deletion is a SOFT state that
--      syncs like any other edit; hard DELETE would silently resurrect on
--      the next push from a device that never saw the deletion.
--
--   3. Lat/lon/elevation live inside PostGIS geometry columns
--      (GEOMETRY(PointZ, 4326)), NOT as three float columns. That gives us
--      GIST spatial indexes, ST_DWithin proximity queries, and interop with
--      map tooling for free. Plain columns are extracted on read with
--      ST_X/ST_Y/ST_Z when building protobuf responses.
--
--   4. Client-generated UUIDs are the primary keys everywhere. Because the
--      mobile app mints the UUID offline, the SAME row keeps the SAME id on
--      device and server — that is what makes push (upsert by id) and pull
--      (delta by updated_at) trivial.
--
--   5. borehole_intervals intentionally has NO updated_at / is_deleted:
--      intervals always travel nested inside their parent Borehole message
--      and are replaced wholesale on every borehole upsert. Sync granularity
--      for intervals is therefore the parent borehole's updated_at.
-- =============================================================================

-- Teach PostgreSQL about geography: the postgis extension provides the
-- GEOMETRY type, GIST spatial indexing and all ST_* functions.
-- (Available by default on Neon; requires the DB cluster to have it installed.)
CREATE EXTENSION IF NOT EXISTS postgis;

-- -----------------------------------------------------------------------------
-- Projects & Concessions
-- -----------------------------------------------------------------------------
-- projects is the top-level container every field entity hangs off. It is
-- created from the office (web portal), not synced from the field, hence
-- TIMESTAMPTZ bookkeeping columns instead of the BIGINT sync convention.
CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- concessions: licensed exploration / mining blocks. geom holds the license
-- boundary as a MultiPolygon in WGS84 (EPSG:4326) so it renders directly in
-- MapLibre and can answer "which concession am I standing in?" via spatial
-- containment. valid_until stays TIMESTAMPTZ here (it is real calendar data,
-- converted to unix-ms only when serialised to protobuf).
CREATE TABLE IF NOT EXISTS concessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code         VARCHAR(100) NOT NULL,          -- e.g. "ML-2020-01"
    name         VARCHAR(255) NOT NULL,          -- e.g. "Kitui South"
    license_type VARCHAR(100) NOT NULL,          -- e.g. "prospecting" | "mining"
    geom         GEOMETRY(MultiPolygon, 4326),
    status       VARCHAR(50) DEFAULT 'active',   -- active | expired | pending | revoked
    valid_until  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   BIGINT NOT NULL,                -- unix ms (sync convention #1)
    UNIQUE (project_id, code)                    -- a license code is unique per project
);

-- GIST index makes polygon containment / intersection queries fast.
CREATE INDEX IF NOT EXISTS idx_concessions_geom ON concessions USING GIST (geom);
-- Composite index matches the pull-delta query: "rows of project X changed
-- since timestamp T" — index-only for the filter, then heap fetch.
CREATE INDEX IF NOT EXISTS idx_concessions_project ON concessions (project_id, updated_at);

-- -----------------------------------------------------------------------------
-- Stations (outcrop observation points)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stations (
    id               UUID PRIMARY KEY,              -- minted on-device (convention #4)
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code             VARCHAR(50) NOT NULL,          -- e.g. "ST-04"
    name             VARCHAR(255),
    geom             GEOMETRY(PointZ, 4326) NOT NULL, -- lon/lat/elevation (convention #3)
    gps_accuracy     DOUBLE PRECISION,              -- meters, from the device GPS fix
    outcrop_exposure VARCHAR(50),                   -- "in-situ" | "float" | "subcrop"
    lithology        VARCHAR(255),
    notes            TEXT,
    updated_at       BIGINT NOT NULL,               -- unix ms (convention #1)
    is_deleted       BOOLEAN DEFAULT FALSE,         -- soft delete (convention #2)
    UNIQUE (project_id, code)
);

CREATE INDEX IF NOT EXISTS idx_stations_geom ON stations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_stations_project ON stations (project_id, updated_at);

-- -----------------------------------------------------------------------------
-- Structural measurements (strike/dip/trend/plunge taken AT a station)
-- -----------------------------------------------------------------------------
-- Child of stations: pushed AFTER its parent so the FK below is satisfiable.
CREATE TABLE IF NOT EXISTS structural_measurements (
    id               UUID PRIMARY KEY,
    station_id       UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    measurement_type VARCHAR(100) NOT NULL,         -- "bedding" | "foliation" | "fault" | "joint" ...
    strike           DOUBLE PRECISION NOT NULL,     -- 0..360 degrees
    dip              DOUBLE PRECISION NOT NULL,     -- 0..90 degrees
    dip_direction    DOUBLE PRECISION,              -- azimuth the bed dips towards (0..360)
    auto_captured    BOOLEAN DEFAULT FALSE,         -- TRUE when measured via phone sensor fusion
    trend            DOUBLE PRECISION,              -- linear feature azimuth (0..360)
    plunge           DOUBLE PRECISION,              -- linear feature inclination (0..90)
    notes            TEXT,
    updated_at       BIGINT NOT NULL,
    is_deleted       BOOLEAN DEFAULT FALSE
);

-- Children are always fetched through their station, so a plain station_id
-- index suffices (no project_id delta index needed: the sync service joins
-- through stations.project_id on pull).
CREATE INDEX IF NOT EXISTS idx_measurements_station ON structural_measurements (station_id);

-- -----------------------------------------------------------------------------
-- Rock samples
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rock_samples (
    id                   UUID PRIMARY KEY,
    station_id           UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    sample_tag           VARCHAR(100) NOT NULL,     -- e.g. "SMP-2026-001"
    lithology_class      VARCHAR(255),
    mineralization_notes TEXT,
    -- photo_r2_keys: object keys of sample photos in Cloudflare R2. Photos
    -- upload DIRECTLY device -> R2 via presigned URLs; the DB only stores
    -- references, keeping sync payloads tiny on 2G connections.
    photo_r2_keys        TEXT[] DEFAULT '{}',
    updated_at           BIGINT NOT NULL,
    is_deleted           BOOLEAN DEFAULT FALSE,
    assays_status        VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending | shipped | assayed
    UNIQUE (station_id, sample_tag)
);

CREATE INDEX IF NOT EXISTS idx_samples_station ON rock_samples (station_id);

-- -----------------------------------------------------------------------------
-- Vegetation observations (used in field mapping, e.g. indicator plants)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vegetation (
    id            UUID PRIMARY KEY,
    station_id    UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    description   TEXT,
    photo_r2_keys TEXT[] DEFAULT '{}',
    updated_at    BIGINT NOT NULL,
    is_deleted    BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_vegetation_station ON vegetation (station_id);

-- -----------------------------------------------------------------------------
-- Boreholes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boreholes (
    id                   UUID PRIMARY KEY,
    project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    borehole_code        VARCHAR(50) NOT NULL,      -- e.g. "BH-08"
    name                 VARCHAR(255),
    geom                 GEOMETRY(PointZ, 4326) NOT NULL, -- collar position; Z = collar elevation
    total_depth_meters   DOUBLE PRECISION,
    water_strike_depth   DOUBLE PRECISION,          -- depth where water was first hit
    yield_liters_per_hour DOUBLE PRECISION,         -- pump test result
    updated_at           BIGINT NOT NULL,
    is_deleted           BOOLEAN DEFAULT FALSE,
    UNIQUE (project_id, borehole_code)
);

CREATE INDEX IF NOT EXISTS idx_boreholes_geom ON boreholes USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_borehole_project ON boreholes (project_id, updated_at);

-- -----------------------------------------------------------------------------
-- Borehole lithology intervals (depth ranges down the hole)
-- -----------------------------------------------------------------------------
-- No updated_at / is_deleted BY DESIGN (convention #5 above): intervals are
-- replaced wholesale whenever their parent borehole upserts.
CREATE TABLE IF NOT EXISTS borehole_intervals (
    id                  UUID PRIMARY KEY,
    borehole_id         UUID NOT NULL REFERENCES boreholes(id) ON DELETE CASCADE,
    depth_from          DOUBLE PRECISION NOT NULL,  -- meters below collar
    depth_to            DOUBLE PRECISION NOT NULL,
    lithology           VARCHAR(255),
    description         TEXT,
    recovery_percentage DOUBLE PRECISION DEFAULT 100.0 -- core recovery of the run
);

CREATE INDEX IF NOT EXISTS idx_borehole_intervals_borehole ON borehole_intervals (borehole_id);
