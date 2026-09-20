# Connection Pooling and Tenant Context Security

## 1. Problem Statement
When using connection pooling (such as Neon serverless pooling, PgBouncer transaction-mode pooling, or Go `pgxpool`), physical database connections are shared among different HTTP requests and tenants.

If a developer executes a persistent configuration command such as:
```sql
-- DANGEROUS: Leaks to subsequent requests sharing the pooled connection!
SET app.current_organization_id = 'tenant-123';
```
The variable remains in the session state of that connection. If the connection is subsequently reused by a request from `tenant-456`, severe cross-tenant data leakage occurs.

## 2. Hard Security Controls

### Rule 1: Always Use `SET LOCAL` Inside Explicit Transactions
`SET LOCAL` binds configuration parameters strictly to the enclosing database transaction:
```sql
BEGIN;
SET LOCAL app.current_organization_id = 'tenant-123';
-- queries executed here are constrained by RLS
COMMIT; -- Context is guaranteed reset upon transaction termination
```

### Rule 2: Composite Relational Foreign Keys are Primary Defense
Do not rely exclusively on RLS. All tables enforce composite foreign keys `(organization_id, parent_id)`. Even if an attacker were to query without RLS active, they cannot link resources across differing tenant organizations because the relational constraint rejects the insert or join.

### Rule 3: `pgxpool` Reset Hook
In the Go backend, connections borrowed from `pgxpool` are sanitized:
```go
// Reset session parameters if any connection was returned in an unclean state
conn.Exec(ctx, "DISCARD TEMP; RESET ALL;")
```
