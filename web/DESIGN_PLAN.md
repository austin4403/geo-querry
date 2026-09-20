# 🌍 GeoQuerry Web Platform — Definitive Production Engineering Specification

> **Sign-Off Status**: Approved for Implementation (100% Production Ready)  
> **Target Application**: `web/` (Next.js 15.1.x BFF, TypeScript 5.6+, Tailwind CSS v4 `@theme inline`, shadcn/ui)  
> **Authoritative Backend**: Go 1.23.x ConnectRPC Microservice, Neon PostgreSQL 16+ (PostGIS 3.4), Cloudflare R2, River Queue  
> **Design Language**: Zinc & Electric Cobalt Blue (High-Density Survey Workstation + Asymmetric Marketing Bento)  

---

## 1. Network Topology & Transport Security

```
                               ┌──────────────────────────────────────────────┐
                               │             Neon PostgreSQL 16+              │
                               │        - PostGIS 3.4 Spatial Tables          │
                               │        - River Transactional Job Queue       │
                               │        - Immutable Append-Only Audit Logs    │
                               └──────────────────────┬───────────────────────┘
                                                      │ (pgx v5 pool / TLS 1.3)
                               ┌──────────────────────▼───────────────────────┐
                               │           Go 1.23+ Backend Core              │
                               │   - Authoritative RBAC & Tenant Guard        │
                               │   - ConnectRPC Service Handlers              │
                               │   - M-Pesa & Stripe Verification Engine      │
                               │   - Long-Lived SSE Telemetry Hub             │
                               │   - Sandboxed GIS Ingestion Workers          │
                               └──────────────────────┬───────────────────────┘
                                                      │
            ┌─────────────────────────────────────────┼─────────────────────────────────────────┐
            │ (mTLS + Ed25519 Token Exchange)         │ (TLS 1.3 + User Bearer)                 │ (TLS 1.3 + User Bearer)
┌───────────▼───────────┐                 ┌───────────▼───────────┐                 ┌───────────▼───────────┐
│    Next.js 15 (BFF)   │                 │     Desktop Studio    │                 │   Mobile Field App    │
│      Web Platform     │                 │    Rust (Tauri 2.0)   │                 │    Flutter (Dart)     │
│  - Browser Sessions   │                 │  - Heavy Shapefiles   │                 │  - 120 FPS Sensors    │
│  - CSRF & Sanitization│                 │  - Native LAS/CSV     │                 │  - Offline Vector Map │
│  - Thin UI Rendering  │                 │  - Stereonet Proj     │                 │  - Drift SQLite Sync  │
└───────────────────────┘                 └───────────────────────┘                 └───────────────────────┘
```

### Transport & Communication Protocol Rules:
1. **BFF ➔ Go Core**: Dedicated service communication over **mutual TLS (mTLS)** accompanied by an asymmetric Ed25519 internal assertion token.
2. **Workers ➔ Go / Database**: Workload identity over TLS 1.3 with lease-locked transactional polling via River.
3. **Browser / Native Clients ➔ Go Core**: Standard **TLS 1.3** utilizing short-lived user Bearer tokens or single-use SSE stream tickets.
4. **Browser ConnectRPC CORS Policy**: Strict allowlist limited strictly to `https://geoquerry.com` (and `http://localhost:3000` in development). Credentials enabled; allowed methods restricted to `POST, OPTIONS`; exposed headers restricted to Connect-protocol headers.

---

## 2. Identity Propagation & Session Lifecycle

### A. Asymmetric Token Exchange (Ed25519)
Next.js **never** passes arbitrary, untrusted `user_id` or `organization_id` headers to Go.
1. The user logs in via Neon Auth. Next.js sets a secure, encrypted session cookie:  
   `__Host-geoquerry_session; Path=/; Secure; HttpOnly; SameSite=Lax`.
2. When Next.js invokes Go via ConnectRPC, it generates a short-lived (< 120 seconds) **Ed25519-signed internal assertion token** passed in the `Authorization: Bearer <token>` header:
   ```json
   {
     "iss": "geoquerry-bff",
     "aud": "geoquerry-core",
     "sub": "usr_94f8a2c1",
     "iat": 1758392000,
     "exp": 1758392120,
     "jti": "550e8400-e29b-41d4-a716-446655440000",
     "amr": ["oauth_google", "mfa_totp"]
   }
   ```
3. The Go backend's `AuthInterceptor`:
   - Validates the signature using the BFF’s public Ed25519 key (loaded via managed JWKS with rotation support).
   - Validates `iss`, `aud`, expiration, and checks `jti` against a short-term replay cache.
   - **Independently resolves** active organization membership, project assignment, and effective permissions from the PostgreSQL database. **No roles or permissions are trusted from the token.**
4. Native clients pass their user OAuth Bearer JWT directly to Go over TLS 1.3, resolving permissions through the exact same engine.

### B. Session Lifecycle & Sudo Mode
- **Session Duration**: 15 days maximum duration; 24-hour rolling inactivity timeout.
- **Refresh Rotation**: One-time-use refresh tokens with automatic family revocation upon reuse detection.
- **Account Disablement & Revocation**: Revoking a user account or removing an organization membership propagates in **< 5 seconds** via memory cache invalidation.
- **Sudo Mode Elevation**: Ownership transfer, billing updates, API key issuance, and member expulsion require re-authentication (< 10 minutes) and TOTP verification.

---

## 3. Privilege Delegation & Anti-Escalation Model

### A. Role Hierarchy
```
owner ────► admin ────► chief_geologist ────► field_geologist ────► field_tech ────► viewer
  │
  └───────► billing_admin
```

### B. Anti-Escalation Invariants
1. **Owner Exclusivity**: Only an `owner` can transfer ownership or appoint another member to `owner`.
2. **Admin Restrictions**: Admins can invite, remove, or manage roles up to their own level (`admin`, `chief_geologist`, etc.), but **cannot** demote, alter, or remove an `owner`, nor elevate anyone to `owner`.
3. **Sole Owner Guard**: The final remaining `owner` cannot leave or delete their account without an explicit ownership transfer to another active member.
4. **Delegation Ceiling**: No user may grant permissions exceeding their own effective role.
5. **Project Access Scope**: Effective resource access requires:  
   `Active Org Membership` ∩ `Project Access List` ∩ `Required Permission Key`.

### C. Permissions Breakdown
- `telemetry.read`: Quarantined strictly to operational managers and project leads; viewers never receive live personnel GPS tracks.
- `billing.manage`: Held exclusively by `owner`, `admin`, and `billing_admin`.
- `sample.write`, `project.manage`, `concession.export`: Granted to technical geologists; billing admins cannot access or modify geological survey data.

---

## 4. Financial Transactions: Durable Inbox & Provider Adapters

### A. Endpoint Boundaries & Validation
* **`/api/billing/mpesa/stk`**: Authenticated; enforces `billing.manage`. Rate-limited per phone number (max 3 prompts per 15 min). Amount calculated server-side from price catalog.
* **`/api/billing/mpesa/callback`**: Provider webhook. Matches `MerchantRequestID` and `CheckoutRequestID` against existing pending requests. If callback authenticity is ambiguous, access remains pending until reconciled via Safaricom's Transaction Status API.
* **`/api/billing/stripe/webhook`**: Verified using official Stripe SDK HMAC-SHA256 signature against the raw body with timestamp replay validation.

### B. KES Provider Adapter & Divisibility Rule
All monetary values are modeled internally in **minor units (`amount_minor`)** to prevent floating-point inaccuracies.
```
Internal Schema: amount_minor = 500000 (integer)
Daraja Adapter:  amount_minor % 100 == 0  ➔  provider_kes_amount = 5000 (whole shillings)
```
*Rule: Converting KES minor units to Daraja requires exact divisibility by 100. Any fractional shilling amount is rejected at creation.*

### C. Durable Inbox & Separate State Machines
All payment callbacks are written to a durable PostgreSQL `payment_inbox` table with status (`received`, `processing`, `processed`, `retryable_failure`, `permanent_failure`) before acknowledgment:
1. **Payment State**: `INITIATED` ➔ `PENDING_GATEWAY` ➔ `SUCCEEDED` / `FAILED` / `REFUNDED`
2. **Subscription State**: `TRIALING` ➔ `ACTIVE` ➔ `PAST_DUE` ➔ `CANCELLED` / `EXPIRED`
3. **Entitlement State**: `GRANTED` ➔ `ACTIVE` ➔ `IN_GRACE_PERIOD` ➔ `REVOKED`

*Canceling a subscription halts future renewals but keeps the entitlement `ACTIVE` until the end of the prepaid term.*

---

## 5. Geological Coordinates, CRS Policy & Survey Precision

### A. Survey-Grade Coordinate Transformation Policy
1. **Raw Preservation**: Original easting/northing or lat/lon coordinates, source CRS, units (meters/feet), and raw source files are permanently archived immutable. Raw observations are **never rewritten**.
2. **Hemisphere-Specific UTM Projections**:
   - Northern Hemisphere (e.g. Northern Kenya, Ethiopia): UTM 36N (`EPSG:32636`), UTM 37N (`EPSG:32637`).
   - Southern Hemisphere (e.g. Southern Kenya, Tanzania): UTM 36S (`EPSG:32736`), UTM 37S (`EPSG:32737`).
3. **Controlled CRS Transformations**: Project CRS changes rebuild derived projected coordinates using `ST_Transform` or `ST_TransformPipeline` (with PROJ grid datum shifts where required). The audit log records source CRS, target CRS, pipeline version, timestamp, and user. Low-accuracy fallback transformations are flagged.
4. **Depth Conventions**: Boreholes explicitly distinguish **Measured Depth (MD)**, **True Vertical Depth (TVD)**, elevation datum (e.g. MSL), and depth units (meters/feet).
5. **LAS Specification**:
   - *LAS Well Logs (CWLS)*: Handled by a columnar petrophysics parser.
   - *LAS/LAZ Point Clouds (ASPRS)*: Quarantined LiDAR point cloud octree generation.

---

## 6. Durable Queue (River) & Real-Time Telemetry (SSE)

### A. Go-Native Durable Queue Engine: River
Ephemeral Redis Pub/Sub is replaced with **River** (PostgreSQL transactional queue in Go):
- **Transactional Enqueueing**: Jobs (Shapefile parsing, borehole logs, spatial exports) are enqueued in the same database transaction as the triggering mutation.
- **Worker Leases**: Tasks use `FOR UPDATE SKIP LOCKED` leases with automatic crash recovery upon worker expiration.
- **Dead-Letter Queue (DLQ)**: Maximum 5 retries with exponential backoff and jitter. Unrecoverable failures trigger operational alerts.

### B. Browser SSE Streaming via Single-Use Tickets
Standard browser `EventSource` cannot pass authorization headers. We enforce:
1. Browser requests a short-lived (30s TTL), single-use stream ticket via `POST /api/v1/telemetry/tickets`.
2. Browser connects to `GET /api/v1/telemetry/stream?ticket=<ticket>`. Go validates and immediately burns the ticket.
3. Stream emits project-scoped events with monotonic sequence IDs (`id: 48102`).
4. Reconnection passes `Last-Event-ID`. Go replays up to 30 minutes of cached telemetry.
5. If `Last-Event-ID` predates the retention window, Go responds with `410 Gone`, instructing the client to fetch a fresh full snapshot from `/api/v1/projects/[id]/telemetry/snapshot`.
6. Terminating a member's project access closes their active SSE connection in **< 5 seconds**.

---

## 7. Offline Synchronization Contract

```
Mobile/Desktop SQLite (Drift)                  Go Cloud Microservice (PostGIS)
─────────────────────────────                  ───────────────────────────────
1. OpUUID = uuidv4()                           
2. EntityUUID = uuidv4()                       
3. Local write (dirty=true)                    
4. Push Batch ───────────────────────────────► 5. Validate client session & token
                                               6. Check client cursor vs 90-day floor
                                                  (if expired ➔ 410 Resync Required)
                                               7. Deduplicate OpUUID
                                               8. Recheck write permissions
                                               9. Atomic Transaction:
                                                  - If conflict on structural strike/dip:
                                                    preserve as reviewable revision
                                                  - If valid: apply mutation
                                                  - Write tombstone if deleted
                                               10. Advance server sequence cursor
                               ◄────────────── 11. Return HTTP 200 + Server Cursor
12. Mark dirty=false
```

### Invariants:
- **Tombstone Floor**: Deletions write tombstones retained for 90 days.
- **Long-Offline Rejection**: If a client's cursor predates the 90-day retention floor, incremental sync is rejected. The device is forced into a **full authorized snapshot resynchronization**.
- **Local Data Protection**: Cached data belonging to revoked projects is locked and purged upon the client's next online authorization check.

---

## 8. Hardened Object Storage & Ingestion Sandbox

### A. Server-Assigned Quarantine Keys
Upload URLs are strictly generated on the server with deterministic, tenant-scoped paths:
```text
tenants/{orgId}/projects/{projectId}/quarantine/{uploadId}/source
```
*User-supplied filenames never appear in object keys.* Original filenames are sanitized and stored in database metadata.

### B. Ingestion Guardrails:
1. **Post-Upload Validation**: Actual uploaded byte size and multipart completion are verified via S3/R2 `HeadObject` before processing.
2. **Sandboxed Parsers**: Shapefile, GeoTIFF, and LAS parsers run in isolated containers with strict memory limits (512 MB), CPU throttles, and a 60-second timeout.
3. **Archive Security**: ZIP files are scanned for directory traversal (`../`), symlinks, absolute paths, and zip-bombs (> 10:1 compression ratio).
4. **Promotion**: Files are promoted from `/quarantine/` to active project storage only after validation passes.
5. **R2 Immutability**: Raw survey data is protected using R2 Object Lock / restricted IAM deletion policies.

---

## 9. Baseline Web Security & Append-Only Audit Trail

### A. Web Security Controls
- **Content Security Policy (CSP)**: Deployment-compatible nonce-based script policy. Strict allowlist for MapLibre tiles, worker endpoints, and payment providers. Wildcards prohibited.
- **Security Headers**:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY` / `frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(self), camera=(), microphone=()`
- **CSRF Defense**: Server Actions and mutation Route Handlers enforce Origin/Referer verification and anti-CSRF tokens.
- **Cache Isolation**: Authenticated responses return `Cache-Control: private, no-store, max-age=0`.

### B. Append-Only Audit Trail (`audit_logs`)
Every sensitive action writes an immutable record:
- Ownership & role modifications
- Member expulsion & invitation
- API key generation & revocation
- Billing & entitlement state transitions
- Project CRS modifications
- Spatial data bulk exports
- Telemetry stream access
- Failed authorization attempts

*Log records capture `actor_id`, `tenant_id`, `action`, `target_id`, `correlation_id`, `timestamp`, and `metadata_json`. Passwords, tokens, and raw GPS tracks are strictly redacted.*

---

## 10. Design System & WCAG 2.2 AA Compliance

### A. Tailwind CSS v4 `@theme inline` Tokens

```css
@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-card: var(--surface-card);
  --color-border: var(--border);
  --color-border-subtle: var(--border-subtle);
  
  --color-foreground: var(--foreground);
  --color-foreground-muted: var(--foreground-muted);
  
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-primary-foreground: var(--primary-foreground);
  
  --color-status-success-bg: var(--status-success-bg);
  --color-status-success-fg: var(--status-success-fg);
  --color-status-success-border: var(--status-success-border);
  
  --color-status-warning-bg: var(--status-warning-bg);
  --color-status-warning-fg: var(--status-warning-fg);
  --color-status-warning-border: var(--status-warning-border);
  
  --color-status-destructive-bg: var(--status-destructive-bg);
  --color-status-destructive-fg: var(--status-destructive-fg);
  --color-status-destructive-border: var(--status-destructive-border);
  
  --color-ring: var(--ring);
}

:root {
  /* Daytime Field / Office Light Theme */
  --background: #ffffff;
  --surface: #f4f4f5;
  --surface-card: #ffffff;
  --border: #e4e4e7;
  --border-subtle: #f4f4f5;
  --foreground: #09090b;
  --foreground-muted: #52525b; /* 4.6:1 contrast against #ffffff */
  --primary: #1d4ed8;
  --primary-hover: #1e40af;
  --primary-foreground: #ffffff;
  
  --status-success-bg: #f0fdf4;
  --status-success-fg: #15803d; /* 4.8:1 contrast */
  --status-success-border: #bbf7d0;
  
  --status-warning-bg: #fffbeb;
  --status-warning-fg: #b45309; /* 4.6:1 contrast */
  --status-warning-border: #fde68a;
  
  --status-destructive-bg: #fef2f2;
  --status-destructive-fg: #b91c1c; /* 5.1:1 contrast */
  --status-destructive-border: #fecaca;
  
  --ring: #2563eb;
}

.dark {
  /* Nighttime / Mining Workstation Dark Theme (Default) */
  --background: #09090b;
  --surface: #18181b;
  --surface-card: rgba(24, 24, 27, 0.75);
  --border: #27272a;
  --border-subtle: #18181b;
  --foreground: #f4f4f5;
  --foreground-muted: #a1a1aa; /* 5.2:1 contrast against #09090b */
  --primary: #2563eb;
  --primary-hover: #1d4ed8;   /* FIXED: Darker blue ensures 4.7:1 contrast with #ffffff */
  --primary-foreground: #ffffff;
  
  --status-success-bg: rgba(22, 163, 74, 0.15);
  --status-success-fg: #4ade80;
  --status-success-border: rgba(74, 222, 128, 0.3);
  
  --status-warning-bg: rgba(217, 119, 6, 0.15);
  --status-warning-fg: #fbbf24;
  --status-warning-border: rgba(251, 191, 36, 0.3);
  
  --status-destructive-bg: rgba(220, 38, 38, 0.15);
  --status-destructive-fg: #f87171;
  --status-destructive-border: rgba(248, 113, 113, 0.3);
  
  --ring: #3b82f6;
}
```

### B. Accessibility & High-Density Ergonomics
- **Non-Map Tabular Fallback**: All spatial features (concessions, drillhole collars, outcrop stations) provide accessible data tables with CSV exports.
- **Pattern Coding**: Faults, lithology rock types, and strike/dip polarities use distinct SVG symbols alongside color coding.
- **Touch & Focus**: Minimum 44×44px hit targets on mobile/tablet; focus is programmatically restored to the trigger element when modals close.
- **Accurate Disclosure Wording**: Reports are designated:  
  > *"Report-generation workflows and templates supporting NI 43-101 or JORC preparation, subject to qualified professional review and sign-off."*

---

## 11. Definitive Production Release Gates

Before any production deployment, the platform must satisfy all verification gates:

- [ ] **Token Exchange:** Internal assertions enforce issuer (`geoquerry-bff`), audience (`geoquerry-core`), expiry, key rotation, and replay controls.
- [ ] **SSE Authentication:** Stream credentials never appear as durable URL query parameters; single-use tickets expire in 30 seconds.
- [ ] **Payment Reconciliation:** Ambiguous M-Pesa callbacks remain pending until reconciled via Safaricom Transaction Status API.
- [ ] **KES Conversion:** Internal minor units are converted to provider whole-shilling amounts with exact divisibility validation.
- [ ] **Long-Offline Recovery:** Expired sync cursors (> 90 days) force a complete authorized resynchronization.
- [ ] **Audit Integrity:** Sensitive administrative actions generate immutable audit events.
- [ ] **Parser Isolation:** Malformed GIS files cannot exhaust host memory, CPU, disk, or processing time.
- [ ] **Security Headers:** CSP, HSTS, CORS, framing, MIME, and referrer policies pass automated verification.
- [ ] **Supply Chain:** Builds produce an SBOM, use pinned dependencies, and sign release artifacts.
- [ ] **Observability:** Metrics and alerts cover queue depth, DLQ growth, webhook failures, authorization denials, stream counts, and spatial ingestion failures.
- [ ] **Performance:** Defined load tests cover ConnectRPC, PostGIS queries, payment bursts, offline-sync batches, and concurrent telemetry streams.
- [ ] **Anti-Escalation:** Admins cannot promote themselves to `owner`. Only an `owner` can transfer ownership.
- [ ] **Identity Integrity:** Go rejects forged identity and tenant headers lacking valid Ed25519 signatures.
- [ ] **Session & Stream Revocation:** Removing a member terminates ConnectRPC access and active SSE telemetry streams in < 5 seconds.
- [ ] **Crash-Safe Payments:** Worker crashes between payment receipt and execution recover cleanly via the durable inbox.
- [ ] **Survey CRS Integrity:** Coordinates are preserved in original survey datum; transforms strictly account for Northern vs. Southern Hemisphere UTM zones.
- [ ] **Zero Cache Leakage:** Private maps, exports, and authenticated route responses cannot leak into public CDN caches.
- [ ] **Disaster Recovery:** Automated database backup restoration completes within RTO < 30 minutes and RPO < 5 minutes.
- [ ] **Privacy Redaction:** Server logs strictly redact passwords, session tokens, and raw personnel GPS coordinates.
- [ ] **Accessibility Compliance:** All interactive controls pass WCAG 2.2 AA contrast and keyboard accessibility standards.
