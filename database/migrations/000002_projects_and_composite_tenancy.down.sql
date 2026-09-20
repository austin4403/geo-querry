-- =============================================================================
-- 000002_projects_and_composite_tenancy.down.sql
-- Rollback for Spatial Schema and Composite Tenancy
-- =============================================================================

DROP TABLE IF EXISTS borehole_intervals;
DROP TABLE IF EXISTS boreholes;
DROP TRIGGER IF EXISTS trg_raw_observations_immutable ON raw_observations;
DROP FUNCTION IF EXISTS trg_prevent_raw_observation_mutation();
DROP TABLE IF EXISTS raw_observations;
DROP TABLE IF EXISTS rock_samples;
DROP TABLE IF EXISTS structural_measurements;
DROP TABLE IF EXISTS stations;
DROP TABLE IF EXISTS concessions;
DROP TABLE IF EXISTS projects;
