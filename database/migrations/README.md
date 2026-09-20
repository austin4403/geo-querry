# Database Migration Engineering & Expand-Migrate-Contract Discipline

## 1. Migration Discipline
1. **Bidirectional Files**: Every schema modification provides both an `.up.sql` and a `.down.sql` script.
2. **Lexical Ordering**: Migrations follow sequential numbering with 6-digit zero padding:
   - `000001_organizations_tenancy_and_audit.up.sql`
   - `000002_projects_and_composite_tenancy.up.sql`
   - `000003_durable_queues_and_sync.up.sql`
   - `000004_billing_and_entitlements.up.sql`
3. **Atomic Execution**: Each migration file executes inside its own atomic PostgreSQL transaction.
4. **Advisory Lock Serialization**: Concurrent application boots and rolling deployments acquire a global advisory lock (`pg_advisory_lock(0x47454F5155455259)`) before inspecting or applying migrations.

## 2. Expand-Migrate-Contract Pattern for Zero Downtime
Destructive schema changes (column removals, table renames, type changes) must never occur in a single migration:
1. **Phase 1 (Expand)**:
   - Add the new column/table as nullable or with safe defaults.
   - Deploy backend code that writes to both old and new columns, reading from the old column.
2. **Phase 2 (Migrate)**:
   - Backfill historical data in background batches using River queue jobs.
   - Deploy backend code that reads from the new column and writes to both.
3. **Phase 3 (Contract)**:
   - Drop the deprecated column or table after verifying zero traffic on the old model.
