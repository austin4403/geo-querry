# Security Control: Append-Only Audit Event Model

## 1. Principles
Every state-altering or security-sensitive action across GeoQuerry generates an immutable, non-repudiable audit event. Audit records are written within the same database transaction as the business operation or dispatched via a durable transactional outbox.

## 2. Mandatory Audit Actions
The following actions must emit audit events:
- **Tenant Management**:
  - `ORGANIZATION_CREATED`
  - `ORGANIZATION_RENAMED`
  - `ORGANIZATION_OWNERSHIP_TRANSFERRED` (Requires Sudo)
  - `ORGANIZATION_DELETED` (Requires Sudo)
- **Membership & Access**:
  - `MEMBER_INVITED`
  - `MEMBER_JOINED`
  - `MEMBER_ROLE_CHANGED` (e.g. promoted to admin)
  - `MEMBER_REMOVED`
- **Security Credentials**:
  - `MFA_ENABLED` / `MFA_DISABLED`
  - `RECOVERY_CODE_CONSUMED`
  - `API_KEY_CREATED` / `API_KEY_REVOKED`
  - `PASSWORD_RESET_COMPLETED`
- **Billing & Commercial**:
  - `SUBSCRIPTION_STARTED` / `SUBSCRIPTION_CANCELED`
  - `PAYMENT_ATTEMPT_INITIATED` / `PAYMENT_SETTLED`
  - `ENTITLEMENT_MODIFIED`
- **Geological & Spatial Data**:
  - `PROJECT_CREATED` / `PROJECT_DELETED`
  - `PROJECT_CRS_CHANGED` (Altering spatial projection)
  - `SURVEY_DATA_EXPORTED` (Tracking intellectual property exports)
  - `CONCESSION_BOUNDARY_MUTATED`

## 3. Audit Event Record Schema
```protobuf
message AuditEvent {
  string id = 1;                    // UUIDv4
  string organization_id = 2;       // Tenant partition
  string actor_user_id = 3;         // Authenticated subject
  string actor_ip_address = 4;      // Client IP (hashed or subnet-masked if PII restricted)
  string user_agent = 5;
  string action = 6;                // e.g. "ORGANIZATION_OWNERSHIP_TRANSFERRED"
  string resource_type = 7;         // e.g. "organization", "project", "api_key"
  string resource_id = 8;           // Target identifier
  google.protobuf.Struct details = 9; // Contextual metadata (pre-change and post-change)
  google.protobuf.Timestamp timestamp = 10;
}
```

## 4. Redaction Invariants
The audit subsystem strictly scrubs and prohibits the persistence of:
- Session tokens, bearer authorization headers, or Ed25519 signatures.
- User passwords, TOTP secret seeds, or plaintext recovery codes.
- Full credit card numbers (PAN), CVVs, or bank account numbers.
- Raw precise GPS coordinates of field team personnel (stored separately with retention expirations).
