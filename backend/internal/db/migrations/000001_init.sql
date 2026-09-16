-- Enable PostGIS spatial extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Projects & Concessions
CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS concessions (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    license_type VARCHAR(100) NOT NULL,
    geom GEOMETRY(MultiPolygon, 4326),
    status VARCHAR(50) DEFAULT 'active',
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS  idx_concessions_geom ON concessions using GIST (geom);

-- Stations (Outcrops)
CREATE TABLE IF NOT EXISTS stations (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    geom GEOMETRY(PointZ, 4326) NOT NULL,
    gps_accuracy DOUBLE PRECISION,
    outcrop_exposure VARCHAR(50),
    lithology VARCHAR(255),
    notes TEXT,
    updated_at BIGINT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS  idx_stations_geom ON stations using GIST (geom);
CREATE INDEX IF NOT EXISTS  idx_stations_project ON stations (project_id, updated_at);

-- Stations (Strike/Dip/Plunge)
CREATE TABLE IF NOT EXISTS structural_measurements (
    id BIGSERIAL PRIMARY KEY,
    station_id BIGINT REFERENCES stations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    strike DOUBLE PRECISION NOT NULL,
    dip DOUBLE PRECISION NOT NULL,
    dip_direction VARCHAR(10) NOT NULL,
    auto_captured BOOLEAN DEFAULT FALSE,
    trend DOUBLE PRECISION,
    plunge DOUBLE PRECISION,
    notes TEXT,
    updated_at BIGINT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS  idx_measurements_station ON structural_measurements (station_id);

-- Rock Samples
CREATE TABLE IF NOT EXISTS rock_samples (
    id BIGSERIAL PRIMARY KEY,
    station_id BIGINT REFERENCES stations(id) ON DELETE CASCADE,
    sample_tag VARCHAR(100) NOT NULL UNIQUE,
    lithology_class VARCHAR(255),
    mineralization_notes TEXT,
    photo_r2_keys TEXT[] DEFAULT '{}',
    code VARCHAR(50) NOT NULL,
    updated_at BIGINT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS  idx_samples_station ON rock_samples (station_id);

--Vegetation
CREATE TABLE IF NOT EXISTS vegetation(
    id BIGSERIAL PRIMARY KEY,
    station_id BIGINT REFERENCES stations(id) ON DELETE CASCADE,
    description TEXT,
    photo_r2_keys TEXT[] DEFAULT '{}',
    updated_at BIGINT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE
    );

CREATE INDEX IF NOT EXISTS idx_vegetation_station on vegetation (station_id);

-- Boreholes
CREATE TABLE IF NOT EXISTS boreholes(
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    borehole_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255),
    geom GEOMETRY(PointZ, 4326) NOT NULL,
    total_depth_meters DOUBLE PRECISION,
    water_strike_depth DOUBLE PRECISION,
    yield_liters_per_hour DOUBLE PRECISION,
    updated_at BIGINT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_boreholes_geom on boreholes USING GIST (geom);

-- Borehole lithology Intervals
CREATE TABLE IF NOT EXISTS borehole_intervals (
    id BIGSERIAL PRIMARY KEY,
    borehole_id BIGINT REFERENCES boreholes(id) ON DELETE CASCADE,
    depth_from DOUBLE PRECISION NOT NULL,
    depth_to DOUBLE PRECISION NOT NULL,
    description TEXT,
    recovery_percentage DOUBLE PRECISION DEFAULT 100.0
    );
