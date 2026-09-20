# ADR-0002: Authentication and Identity Exchange

## Status
Accepted

## Context
GeoQuerry serves heterogeneous clients:
1. Web browsers accessing Next.js Portal / BFF.
2. Native field clients (Flutter on iOS/Android, Tauri on Desktop) operating in connected or offline modes.
3. Internal trusted services and background workers.

To avoid conflicting authentication patterns (e.g. forward raw JWT vs. forge custom headers), a unified, verifiable, and tenant-safe identity architecture is required.

## Decision

### 1. Browser Authentication Flow (Web BFF)
- **Session Termination at Edge**: Next.js BFF terminates the browser session using an encrypted, `HttpOnly`, `SameSite=Lax` (or `Strict` for mutations), `Secure` cookie.
- **Internal Assertion Issuance**: When the Next.js BFF invokes the Go authoritative backend, it signs a short-lived internal token using **Ed25519** asymmetric cryptography.
- **Assertion Envelope**:
  - Algorithm: `Ed25519`
  - Claims:
    - `iss`: `geoquerry-web-bff`
    - `aud`: `geoquerry-core-backend`
    - `sub`: Authenticated User ID (UUIDv4)
    - `exp`: Epoch timestamp (strictly `<= 300 seconds` / 5 minutes from issuance)
    - `nbf`: Epoch timestamp (issuance time `- 5 seconds` clock drift tolerance)
    - `iat`: Epoch timestamp
    - `jti`: Cryptographically random UUIDv4 (for replay detection)
    - `kid`: Key identifier for Ed25519 key rotation
    - `auth_time`: Timestamp of original primary authentication
    - `amr`: Authentication Method Reference (`["pwd", "mfa"]`, etc.)
    - `sudo_exp`: Timestamp until which elevated sudo mode remains valid (or 0 if inactive)
- **Strict Invariant on Roles and Memberships**:
  - The internal assertion **must NOT** contain tenant organizations, projects, roles, or permission scopes.
  - The Go backend verifies the signature and cryptographic claims, and subsequently queries its authoritative database to evaluate current tenant membership, project access, and RBAC permissions in real time.
  - Stale membership revocation occurs instantaneously upon Go database lookup, eliminating revocation latency.

### 2. Native Client Authentication Flow
- Mobile (Flutter) and Desktop (Tauri) present an OAuth2/OIDC Bearer Access Token directly to the Go authoritative backend over standard TLS.
- Go validates the cryptographic signature of the token, enforces audience/issuer rules, and resolves organization membership dynamically per transaction.

### 3. Service-to-Service and Worker Authentication
- Background workers (e.g., GIS ingestion sandboxes) and internal operational jobs authenticate via dedicated Workload Identity or mutual TLS (mTLS) with pinned client certificates and tenant-scoped task identifiers.
- Background jobs never reuse interactive user assertion tokens.

### 4. Real-Time Telemetry and SSE Authentication
- Long-lived Server-Sent Events (SSE) and WebSocket connections **must NOT** include bearer tokens in URL query strings (which leak into access logs, browser history, and proxy traces).
- SSE connections authenticate via short-lived, single-use stream tickets (`StreamTicket`) issued over an authenticated POST endpoint, valid for 30 seconds, or via `SameSite=Strict` session cookies on the BFF domain. Every reconnect requires re-authorization.

## Consequences
- The Go backend remains the single authoritative authorization boundary.
- Next.js never acts as an unverified proxy or second business backend.
- Compromised or forged assertions are blocked by cryptographic verification.
- User revocation, role changes, and organization removal take effect immediately on the next backend request.
