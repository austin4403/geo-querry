# Integration Checklist: Vertical Slice Milestone 1

The primary production milestone is the **Secure Tenant and Project Vertical Slice**:
```text
Login 
  -> Organization membership verification
  -> Create Project in organization
  -> Authorize Project access in Go core
  -> Render Project in Next.js portal
  -> Reject cross-tenant access attempt (negative test)
  -> Verify append-only audit event record
```

## Gate 1: Contract & Database Alignment
- [ ] Protobuf contract defines `CreateProjectRequest`, `GetProjectRequest`, `ProjectResponse`.
- [ ] Database migration establishes `organizations`, `organization_members`, `projects` with composite key `(organization_id, id)`.
- [ ] Composite foreign key constraint `fk_projects_organization` verified.

## Gate 2: Authentication & Token Exchange
- [ ] Next.js BFF generates Ed25519-signed internal assertion with verified `sub`.
- [ ] Go backend verifies assertion signature, validity window (`exp <= 300s`), and `jti` uniqueness.
- [ ] Go backend rejects tokens containing client-injected role or organization claims.

## Gate 3: Authorization & Domain Execution
- [ ] Go backend queries PostgreSQL to verify caller's membership in target organization.
- [ ] Caller with `geologist` or `admin` role allowed to create project.
- [ ] Caller with `viewer` role denied permission with `CodePermissionDenied`.
- [ ] Negative test: User A in Org 1 attempts to read Project belonging to Org 2; Go returns `CodeNotFound` (preventing ID enumeration).

## Gate 4: Web BFF & Portal Presentation
- [ ] Next.js renders project list in authenticated layout.
- [ ] Navigation shell reflects active organization context without flashing unauthorized state.
- [ ] UI displays proper empty state when no projects exist.

## Gate 5: Security & Audit Verification
- [ ] `audit_logs` record created with `action = "PROJECT_CREATED"`, actor ID, timestamp, and metadata.
- [ ] Attempted cross-tenant access produces `SECURITY_VIOLATION` audit log with client IP and correlation ID.
