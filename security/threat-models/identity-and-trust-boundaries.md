# Threat Model: Identity, Authentication, and Trust Boundaries

## 1. System Boundaries and Actors

```text
[ Browser User ] ──(HTTPS/Cookies)──> [ Next.js BFF ] ──(Ed25519 Assertion)──> [ Go Core Backend ] ──> [ Neon DB ]
                                                                                      │
[ Native Clients (Mobile/Desktop) ] ──(Direct TLS / Bearer Token)────────────────────┘
                                                                                      │
[ Isolated GIS Worker Sandbox ] ──────(mTLS / Workload Identity)─────────────────────┘
```

### Trust Zones
1. **Untrusted Zone**: Public Internet, web browsers, native mobile clients running on unmanaged Android/iOS hardware, compromised networks.
2. **DMZ / BFF Zone**: Next.js running on Cloudflare edge. Terminates browser cookies, handles CSRF tokens, signs internal assertions.
3. **Internal Trusted Core Zone**: Go authoritative backend service, River queue workers. Owns business logic and authoritative RBAC evaluation.
4. **Isolated Sandbox Zone**: Workers processing untrusted binary files (Shapefiles, GeoTIFFs, CWLS LAS). Network-isolated, read-only root filesystem.
5. **Authoritative Storage Zone**: Neon PostgreSQL with PostGIS, Cloudflare R2 object storage.

## 2. Threat Analysis (STRIDE)

| Threat Category | Potential Vector | Mitigation Control |
|---|---|---|
| **Spoofing** | Forged user ID or tenant header sent to Go core backend | Go backend rejects raw HTTP headers. Only verified Ed25519-signed internal assertions (or validated OAuth2 bearer tokens) are accepted. |
| **Tampering** | Modification of claims, price, or role during transit | Cryptographic Ed25519 signature verification; roles/prices are never accepted from clients; resolved from DB catalog. |
| **Repudiation** | An admin deletes a project or transfers tenant ownership without a record | Append-only `audit_logs` table. Non-repudiable audit event emission on all sensitive actions. |
| **Information Disclosure** | Bearer tokens logged via SSE query parameters or URLs | Query string authentication prohibited. Single-use, short-lived (30s) stream tickets or authenticated headers. |
| **Denial of Service** | Archive traversal bombs or corrupt GeoTIFFs consuming server memory | Ingestion sandbox with CPU/memory limits, decompression limits, and quarantine prefix storage. |
| **Elevation of Privilege** | An organization member invokes owner-restricted API (e.g. transfer ownership) | Go backend resolves user's real-time role in PostgreSQL; enforces sudo reauthentication for sensitive operations. |

## 3. Boundary Invariants
1. **No Injected Tenancy**: Client-supplied `organization_id` or `project_id` in headers is treated solely as an unverified *requested target*. The backend verifies that the caller's verified `sub` possesses active membership in that organization.
2. **Zero-Trust Assertion**: Assertions convey only validated identity (`sub`, `auth_time`, `amr`, `jti`). They never convey permissions or roles.
3. **No Credential Logging**: Passwords, TOTP secrets, recovery codes, auth cookies, bearer tokens, and precise field personnel GPS locations are scrubbed prior to logging.
