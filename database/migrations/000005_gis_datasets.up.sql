-- =============================================================================
-- 000005_gis_datasets.up.sql
-- Spatial GIS Ingestion Quarantine, CRS Metadata, and PostGIS Geometries
-- =============================================================================

CREATE TABLE IF NOT EXISTS gis_datasets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,
    project_id        UUID NOT NULL,
    kind              VARCHAR(50) NOT NULL, -- e.g. SHAPEFILE, GEOTIFF, CWLS_LAS
    display_name      VARCHAR(255) NOT NULL,
    byte_size         BIGINT NOT NULL,
    status            VARCHAR(50) NOT NULL DEFAULT 'QUARANTINED'
                      CHECK (status IN ('QUARANTINED', 'SCANNING', 'PROCESSING', 'READY', 'FAILED')),
    failure_reason    TEXT,
    crs_epsg          VARCHAR(50) DEFAULT 'EPSG:4326',
    crs_datum         VARCHAR(100) DEFAULT 'WGS 84',
    crs_projection    VARCHAR(100) DEFAULT 'Geographic / UTM',
    crs_units         VARCHAR(50) DEFAULT 'degree',
    bounds_wgs84      GEOMETRY(Polygon, 4326),
    r2_quarantine_key TEXT,
    r2_verified_key   TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gis_datasets_proj ON gis_datasets (organization_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gis_datasets_bounds ON gis_datasets USING GIST (bounds_wgs84);
