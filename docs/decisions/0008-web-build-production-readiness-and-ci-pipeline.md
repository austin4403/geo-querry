# ADR 0008: Web Build Production Readiness and CI/CD Quality Gates

## Status
Accepted

## Context
Following the Wave 2 verification assessment by the Lead Engineer, the repository required immediate structural remediation to substantiate production readiness:
1. Continuous Integration previously lacked any validation, testing, linting, or compilation gates for `web/`. The pipeline could pass even if the web build broke.
2. The web application required strict Content Security Policies (CSP), HTTP Strict Transport Security (HSTS), cross-origin mutation defenses (CSRF), and private cache isolation.
3. Cryptographic signing key confinement required build-time enforcement to prevent leakage into client-side bundles or source maps.
4. Security scanner versions in CI needed pinned digests/tags to prevent supply-chain drift and build breaks.

## Decision

### 1. Mandatory `web_quality` CI/CD Pipeline Gate
A dedicated job is introduced into the `.gitlab-ci.yml` `test` stage running on `node:22-alpine` with dependencies cached via `web/package-lock.json`:
- `npm ci --cache .npm --prefer-offline` (deterministic, frozen dependency installation)
- `npm run lint` (`eslint . --max-warnings=0`)
- `npm run typecheck` (`tsc --noEmit`)
- `npm run test` (`vitest run` testing assertions, security headers, CSRF, and BFF invariants)
- `npm run build` (`next build` generating optimized production static & dynamic server bundles)

### 2. Runtime Security & CSP Headers
Configured in `web/middleware.ts` for all application routes:
- **Clickjacking Protection**: `frame-ancestors 'none'`, `X-Frame-Options: DENY`.
- **MIME Sniffing**: `X-Content-Type-Options: nosniff`.
- **HSTS**: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **CSP**: Restricts scripts and styles to self; whitelists GIS OpenStreetMap/OpenTopoMap tile sources; disables unsafe objects.
- **CSRF Mitigation**: State-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) validate origin host matching.
- **Authenticated Cache Isolation**: `Cache-Control: private, no-store, max-age=0, must-revalidate` for `/dashboard` and `/api`.

### 3. Server-Only Cryptographic Key Confinement
Modules issuing identity assertions (`web/lib/assertion.ts`) and handling session cookies (`web/lib/session.ts`) explicitly declare `import "server-only";`. Any attempt to import these utilities into client-side components (`"use client"`) triggers a compile-time build failure.

### 4. Pinned Toolchain & Scanners
- Node.js LTS: `node:22-alpine`
- Go toolchain: `golang:1.25-alpine` and `golang:1.25`
- Static Analysis: `gosec@v2.22.1` with clean scan (0 issues)
- Vulnerability Scanner: `govulncheck@v1.1.4`

## Consequences
- Every commit pushed to GitLab and GitHub undergoes comprehensive, dual-stack CI validation.
- Submissions cannot pass pipeline review unless both backend services and the frontend Next.js workstation pass all lint, typecheck, unit, and build checks.
