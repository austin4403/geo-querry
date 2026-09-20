# Security Control: Browser Session Lifecycle, Refresh, and Revocation

## 1. Browser Session Specification
- **Session Token Storage**: Encrypted cookie `__Host-geoquerry_session`.
- **Cookie Security Attributes**:
  - `HttpOnly`: Inaccessible to JavaScript (mitigating XSS extraction).
  - `Secure`: Transmitted exclusively over TLS.
  - `SameSite=Lax`: For top-level navigation; upgraded to `SameSite=Strict` for mutation requests.
  - `Path=/`: Root scope.
  - `Partitioned`: Chip cookies for cross-origin boundary isolation where supported.
- **Session Expiration**:
  - Idle Timeout: 2 hours of inactivity.
  - Absolute Lifetime: 14 days maximum.

## 2. Revocation & Immediate Deny Policy
1. **Database Session Revocation Table**:
   - Session identifiers are tracked in PostgreSQL `user_sessions`.
   - When a user logs out, clicks "Sign out all devices", or an admin suspends a user, the session record status transitions to `REVOKED`.
2. **Next.js BFF Cache**:
   - Next.js verifies session validity against database/cache before minting internal assertions.
3. **Internal Assertion Expiry**:
   - Short-lived internal Ed25519 assertions expire within **300 seconds (5 minutes)**.
   - Even in the event of an edge caching delay, the maximum theoretical window of assertion validity is 300 seconds.
   - Go backend performs real-time database membership checks on every request, immediately rejecting requests from revoked users.
