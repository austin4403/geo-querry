# ADR-0001: Repository Layout and Boundary Ownership

## Status
Accepted

## Context
GeoQuerry is an offline-first, cross-platform geological intelligence and exploration platform spanning:
- Web GIS Portal and BFF (Next.js)
- Authoritative Core Backend (Go, PostGIS, ConnectRPC)
- Sandboxed GIS Ingestion Workers
- Shared Contracts and Design System Primitives
- Cross-platform Native Clients (Flutter mobile, Tauri desktop)

Without strict repository ownership boundaries, rapid multi-agent and cross-team development risks creating overlapping abstractions, duplicated authorization and billing logic, and fragmented schema definitions.

## Decision
1. **Monorepo Directory Ownership**:
   - `apps/web/` (mapped to `web/` during transition): Owns the Next.js BFF, edge session termination, client layouts, and portal presentation. No direct database access; no business authority.
   - `services/core/` (mapped to `backend/` during transition): Authoritative Go backend microservice. Exclusively owns business rules, tenant authorization, database mutation, and payment verification.
   - `workers/gis/`: Sandboxed GIS processing worker for untrusted file parsers (Shapefiles, GeoTIFFs, CWLS LAS, LAS/LAZ). Isolated from authoritative business APIs.
   - `packages/contracts/`: Canonical Protobuf/Connect definitions shared across web, mobile, desktop, and core services.
   - `packages/design-system/`: Reusable Tailwind v4 and React UI components.
   - `database/`: Database schema, migrations, RLS policies, composite foreign key definitions, and test fixtures.
   - `infrastructure/`: Cloudflare Pages, Koyeb/container orchestration, Neon connection pooling, and monitoring manifests.
   - `security/`: Threat models, cryptographic assertion specifications, security controls, and audit models.
   - `docs/`: System architecture decision records (ADRs), runbooks, and checklists.

2. **Core Boundary Invariants**:
   - **No Cross-Boundary Rule Invention**: No subagent or implementation track may invent cross-service contracts, authorization rules, database schemas, or payment behaviors without an approved ADR.
   - **Go as Single Authoritative Source**: Next.js BFF is never an authoritative business layer. All authorization decisions, state transitions, and billing mutations execute within Go services.
   - **Exclusive Package Ownership**: Changes to shared packages (e.g. `packages/contracts/` or `database/migrations/`) require formal review against compatibility guidelines.

## Consequences
- Single point of truth for data models and protocols.
- Clean separation between presentation, BFF, authoritative domain services, and isolated parsing workers.
- Clear auditability across git history and pull requests.
