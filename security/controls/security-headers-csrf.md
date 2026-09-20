# Security Control: HTTP Security Headers, CSRF, and Origin Validation

## 1. Content Security Policy (CSP) & Web Headers
The Next.js BFF and Cloudflare edge terminate the following strict HTTP security headers:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{RANDOM}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.r2.cloudflarestorage.com; connect-src 'self' https://*.geoquerry.com wss://*.geoquerry.com; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(self)
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
```

## 2. Cross-Site Request Forgery (CSRF) Defense
- **SameSite Cookies**:
  - Session cookies configured with `SameSite=Lax` for GET routes and `SameSite=Strict` for mutation requests.
- **Strict Origin & Fetch Metadata Validation**:
  - The Next.js BFF middleware inspects `Origin` and `Sec-Fetch-Site` headers for all state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`).
  - If `Sec-Fetch-Site` is `cross-site`, the request is blocked immediately with `403 Forbidden`.
  - For non-browser or programmatic API consumers, a custom header `X-Requested-With: GeoQuerry` or valid Bearer authentication is mandated.
- **Double-Submit CSRF Cookie / Synchronizer Token**:
  - Mutation forms carry an encrypted CSRF synchronizer token validated prior to processing.
