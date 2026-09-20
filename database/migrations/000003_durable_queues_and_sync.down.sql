-- =============================================================================
-- 000003_durable_queues_and_sync.down.sql
-- Rollback for River Queues and Sync Tables
-- =============================================================================

DROP TABLE IF EXISTS sync_tombstones;
DROP TABLE IF EXISTS sync_operations;
DROP TABLE IF EXISTS river_client;
DROP TABLE IF EXISTS river_leader;
DROP TABLE IF EXISTS river_job;
