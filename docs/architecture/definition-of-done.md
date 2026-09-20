# Definition of Done (DoD) Templates

Every deliverable across all implementation waves must satisfy these criteria before being marked complete.

## 1. Universal Package DoD
- [ ] **Contract Compliance**: Uses approved Protobuf contracts from `packages/contracts/` without ad-hoc field modifications.
- [ ] **Strict Typing**: Zero `any` types in TypeScript; strict Go type models without unvalidated `interface{}`.
- [ ] **Input Validation**: Runtime boundary validation for all external parameters (length, regex, range, and format).
- [ ] **Tenant Isolation**: All database operations join on or filter by `organization_id` using composite keys.
- [ ] **Negative Path Testing**: Automated unit and integration tests prove invalid inputs, expired tokens, cross-tenant attempts, and malformed payloads are rejected.
- [ ] **Security Controls**: Zero secrets, passwords, session tokens, or private field team coordinates in log statements.
- [ ] **Code Quality**: Passes `golangci-lint` / `go vet` and ESLint / Prettier / `tsc --noEmit`.

## 2. API & Contract DoD
- [ ] All methods define explicit authentication and authorization requirements.
- [ ] Backward-compatible protobuf field numbers; deleted numbers marked `reserved`.
- [ ] Clean error details using `ErrorInfo` with machine-readable codes.
- [ ] Zero database-internal errors or stack traces leaked to clients.
- [ ] Successful client generation in Go (`protoc-gen-go`, `protoc-gen-connect-go`) and TypeScript (`@connectrpc/protoc-gen-connect-es`).

## 3. Database Migration DoD
- [ ] Migrations are strictly bidirectional (`.up.sql` and `.down.sql`).
- [ ] Composite foreign keys `(organization_id, id)` prevent cross-tenant referencing.
- [ ] Spatial columns indexed with PostGIS GIST indexes.
- [ ] Financial columns use signed 64-bit integers (`BIGINT`) representing minor currency units.
- [ ] Tested for clean rollback and re-application in isolated staging environments.
- [ ] Serialized via PostgreSQL advisory lock (`pg_advisory_lock`).

## 4. Subagent Wave Gate Checklist
- [ ] Subagent completed all assigned package deliverables.
- [ ] No changes made outside assigned ownership boundaries.
- [ ] All unit, integration, and contract tests pass green.
- [ ] Git commit and push executed to remote repository.
- [ ] Subagent reports all modified files and outstanding risks to the user for formal review.
