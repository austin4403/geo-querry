-- =============================================================================
-- database/seeds/test_seed.sql
-- Seed Data for Development and Automated Testing Environments Only
-- =============================================================================

-- Seed Organizations
INSERT INTO organizations (id, name, slug)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Acme Mining Ltd', 'acme-mining'),
    ('22222222-2222-2222-2222-222222222222', 'Rift Valley Exploration', 'rift-valley-geo')
ON CONFLICT (id) DO NOTHING;

-- Seed Users
-- Password is 'password123' bcrypt hashed (cost 10)
INSERT INTO users (id, email, display_name, password_hash)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@acme.com', 'Alice Mwangi', '$2a$10$7EqJtq98hPqEX7fNZaFWoO...'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@acme.com', 'Bob Otieno', '$2a$10$7EqJtq98hPqEX7fNZaFWoO...'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'charlie@riftvalley.com', 'Charlie Kipkorir', '$2a$10$7EqJtq98hPqEX7fNZaFWoO...')
ON CONFLICT (id) DO NOTHING;

-- Seed Memberships
INSERT INTO organization_members (organization_id, user_id, role)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'),
    ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'geologist'),
    ('22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner')
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Seed Projects
INSERT INTO projects (id, organization_id, name, description, target_commodity, crs_epsg)
VALUES
    ('p1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Kitui South Lithium Project', 'Hard-rock pegmatite exploration in Kitui', 'Lithium', 'EPSG:32636'),
    ('p2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Kakamega Gold Concession', 'Greenstone belt orogenic gold survey', 'Gold', 'EPSG:32636')
ON CONFLICT (organization_id, id) DO NOTHING;

-- Seed Plans
INSERT INTO plans (plan_id, name, description, currency, amount_minor_units, billing_interval)
VALUES
    ('plan_starter_kes', 'Field Starter', 'Entry plan for small field exploration teams', 'KES', 500000, 'month'),
    ('plan_pro_kes', 'Commercial Exploration', 'Advanced spatial analytics and team telemetry', 'KES', 2500000, 'month'),
    ('plan_enterprise_usd', 'Global Enterprise', 'Unlimited concessions, multi-sensor 3D logs', 'USD', 49900, 'month')
ON CONFLICT (plan_id) DO NOTHING;

-- Seed Entitlements
INSERT INTO organization_entitlements (organization_id, feature_key, is_enabled)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'team_telemetry', TRUE),
    ('11111111-1111-1111-1111-111111111111', 'export_shapefile', TRUE),
    ('22222222-2222-2222-2222-222222222222', 'team_telemetry', TRUE)
ON CONFLICT (organization_id, feature_key) DO NOTHING;
