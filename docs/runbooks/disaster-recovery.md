# Runbook: Database Backup, Point-In-Time Restoration, and Disaster Recovery

## Objective
Restore database integrity and operational continuity within an **RTO (Recovery Time Objective) of <= 30 minutes** and **RPO (Recovery Point Objective) of <= 5 minutes**.

## 1. Automated Neon Backup Topology
- **Continuous Write-Ahead Logging (WAL)**: Neon automatically replicates WAL streams to object storage, supporting Point-In-Time Restore (PITR) up to 7 days on production branches.
- **Scheduled Logical Dumps**: Nightly logical backups executed via `pg_dump` with compression, streamed to Cloudflare R2 (`s3://geoquerry-backups/pg-logical/`).

## 2. Point-in-Time Restoration Procedure

### Scenario: Accidental Data Corruption or Catastrophic Migration Failure
1. **Identify Corruption Timestamp**:
   Determine exact UTC timestamp $T_{corrupt}$ preceding the incident.
2. **Provision Instant Neon Branch**:
   Via Neon Console or CLI:
   ```bash
   neonctl branches create --name recovery-branch --parent-id <PARENT_BRANCH_ID> --timestamp "2026-09-20T19:30:00Z"
   ```
3. **Verify Data Integrity**:
   Connect via psql to `recovery-branch` and execute consistency checks:
   ```sql
   SELECT count(*) FROM organizations;
   SELECT count(*) FROM projects;
   SELECT count(*) FROM observations;
   ```
4. **Promote Branch**:
   Update `DATABASE_URL` secret across backend services to point to the restored compute endpoint.
5. **Restart Services**:
   Initiate rolling deployment of `services/core`.

## 3. Storage (R2) Recovery
- Cloudflare R2 bucket versioning is enabled. Accidental deletion of geological rasters or survey photos can be recovered via S3 version retrieval.
