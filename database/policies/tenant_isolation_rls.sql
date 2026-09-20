-- =============================================================================
-- database/policies/tenant_isolation_rls.sql
-- Row-Level Security (RLS) Policies and Session Context Application
-- =============================================================================
-- In addition to composite foreign keys at the relational schema layer,
-- RLS provides defense-in-depth against accidental omission of tenant filters.
--
-- USAGE IN GO BACKEND:
-- Inside every transactional database query, the Go tenant interceptor executes:
--   SET LOCAL app.current_organization_id = '<AUTH_ORG_UUID>';
--
-- 'SET LOCAL' ensures the variable is scoped strictly to the current transaction.
-- When the transaction completes (COMMIT or ROLLBACK), the variable is automatically
-- cleared by PostgreSQL before the physical connection is returned to the pool.
-- =============================================================================

-- Enable RLS on core tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE concessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE structural_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rock_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE boreholes ENABLE ROW LEVEL SECURITY;
ALTER TABLE borehole_intervals ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_entitlements ENABLE ROW LEVEL SECURITY;

-- Helper function to read the current transaction tenant context safely
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(CURRENT_SETTING('app.current_organization_id', TRUE), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Projects Policy
DROP POLICY IF EXISTS tenant_isolation_projects ON projects;
CREATE POLICY tenant_isolation_projects ON projects
    FOR ALL
    USING (organization_id = current_tenant_id())
    WITH CHECK (organization_id = current_tenant_id());

-- Concessions Policy
DROP POLICY IF EXISTS tenant_isolation_concessions ON concessions;
CREATE POLICY tenant_isolation_concessions ON concessions
    FOR ALL
    USING (organization_id = current_tenant_id())
    WITH CHECK (organization_id = current_tenant_id());

-- Stations Policy
DROP POLICY IF EXISTS tenant_isolation_stations ON stations;
CREATE POLICY tenant_isolation_stations ON stations
    FOR ALL
    USING (organization_id = current_tenant_id())
    WITH CHECK (organization_id = current_tenant_id());

-- Structural Measurements Policy
DROP POLICY IF EXISTS tenant_isolation_measurements ON structural_measurements;
CREATE POLICY tenant_isolation_measurements ON structural_measurements
    FOR ALL
    USING (organization_id = current_tenant_id())
    WITH CHECK (organization_id = current_tenant_id());

-- Rock Samples Policy
DROP POLICY IF EXISTS tenant_isolation_samples ON rock_samples;
CREATE POLICY tenant_isolation_samples ON rock_samples
    FOR ALL
    USING (organization_id = current_tenant_id())
    WITH CHECK (organization_id = current_tenant_id());

-- Raw Observations Policy
DROP POLICY IF EXISTS tenant_isolation_raw_obs ON raw_observations;
CREATE POLICY tenant_isolation_raw_obs ON raw_observations
    FOR ALL
    USING (organization_id = current_tenant_id())
    WITH CHECK (organization_id = current_tenant_id());

-- Boreholes Policy
DROP POLICY IF EXISTS tenant_isolation_boreholes ON boreholes;
CREATE POLICY tenant_isolation_boreholes ON boreholes
    FOR ALL
    USING (organization_id = current_tenant_id())
    WITH CHECK (organization_id = current_tenant_id());

-- Borehole Intervals Policy
DROP POLICY IF EXISTS tenant_isolation_intervals ON borehole_intervals;
CREATE POLICY tenant_isolation_intervals ON borehole_intervals
    FOR ALL
    USING (organization_id = current_tenant_id())
    WITH CHECK (organization_id = current_tenant_id());
