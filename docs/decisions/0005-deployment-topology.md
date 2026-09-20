# ADR-0005: Deployment Topology and Cloud Infrastructure

## Status
Accepted

## Context
GeoQuerry targets an efficient, resilient, and scalable deployment topology capable of operating on high-efficiency tiers while scaling to production workloads:
- Web BFF: Next.js edge/cloud deployment
- Authoritative Core: Go backend microservice
- Data Tier: Neon PostgreSQL with PostGIS extension
- Object Storage: Cloudflare R2 (S3-compatible API, zero egress fees)

## Decision

### 1. Web Portal & BFF Deployment
- **Hosting Target**: Cloudflare Pages / Workers using `@opennextjs/cloudflare` adapter.
- **Runtime Environment**: Cloudflare edge network, providing low latency worldwide.
- **Edge Security**: Strict Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), and CORS termination at the Cloudflare edge.

### 2. Authoritative Go Core Backend
- **Hosting Target**: Containerized runtime (Koyeb / Fly.io / Kubernetes) executing compiled multi-stage Go scratch binaries.
- **Image Hygiene**:
  - Image tags **must be pinned** to immutable Git commit SHAs or semantic release tags (e.g. `registry.gitlab.com/austin4403/geo-querry/backend:sha-abc1234`).
  - Use of `:latest` in production manifests is strictly prohibited.
  - Multi-stage Docker builds using minimal unprivileged scratch/distroless bases.
- **Process Boundaries**:
  - Internal administration endpoints (pprof, raw metrics) are bound exclusively to internal interfaces (`127.0.0.1` or private overlay networks) and never exposed publicly.

### 3. Neon Serverless PostgreSQL with PostGIS
- **Database Engine**: PostgreSQL 16+ with `postgis`, `postgis_raster`, and `uuid-ossp` extensions.
- **Connection Management & Pooling**:
  - Serverless pooling: Utilizing Neon connection pooling (`pooler` connection strings) alongside strict `pgxpool` configuration in Go:
    - `MaxConns`: 4 (tuned for low-memory instances, avoiding connection exhaustion).
    - `MinConns`: 1.
    - `MaxConnLifetime`: 30 minutes with 1-minute jitter.
    - `MaxConnIdleTime`: 5 minutes.
    - `HealthCheckPeriod`: 1 minute.
  - Startup coordination: Sequential schema migrations synchronized via PostgreSQL session-level advisory locks (`pg_advisory_lock(0x47454F5155455259)`).

### 4. Cloudflare R2 Storage & Lifecycle
- **Tenant-Scoped Object Keys**:
  - Objects are stored under strict tenant-prefixed keys:
    `tenants/{organization_id}/projects/{project_id}/quarantine/{upload_id}/{sanitized_filename}`
  - Raw user filenames are never used as R2 keys; sanitized names and checksums are stored as object metadata.
- **Quarantine Workflow**:
  - Uploads enter the `quarantine/` prefix via short-lived (15-minute) presigned PUT URLs.
  - Background GIS workers parse and validate spatial data in an isolated sandbox.
  - Only clean, validated datasets are promoted to `active/{dataset_id}/...`.
- **CORS Policy**:
  - Allowed Origins: Restricted to production web domain and verified localhost dev origins.
  - Allowed Methods: `PUT`, `GET`, `HEAD`.
  - Allowed Headers: `Content-Type`, `Content-MD5`, `x-amz-checksum-sha256`.

## Consequences
- Zero egress bandwidth charges for high-volume geological imagery, point clouds, and raster tiles via Cloudflare R2.
- Low-latency edge delivery for web assets while maintaining strict backend isolation.
- Resilient database connection recovery across serverless cold starts.
