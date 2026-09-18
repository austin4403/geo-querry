# 🗺️ GeoQuerry

> **The Offline-First, Cross-Platform Geological Intelligence & Field Exploration Platform**  
> Targets: **Mobile (iOS & Android)**, **Desktop Studio (Linux, macOS, Windows)**, and **Web GIS Portal**  
> Cloud Infrastructure: **$0.00/mo Foundation** (Neon PostGIS, Cloudflare R2, Cloudflare Pages, Koyeb, GitLab CI/CD)

---

## 📚 Documentation & Project Specs

- **[Master System Design & Architecture](GEOQUERRY_SYSTEM_DESIGN.md)**: Comprehensive technical specification covering hardware sensor fusion math, offline vector tile caching, dual-currency billing (M-Pesa & Paystack), and zero-cost cloud topology.
- **[Project Plan, Files Progress & Tech Stack Plan](PROJECT_PLAN.md)**: Detailed monorepo directory layout, current implementation status, file inventory, and execution roadmap.

---

## 🏗️ Repository Architecture

```
geo-querry/
├── proto/        # Universal Protocol Buffer contracts (geology, sync, telemetry)
├── backend/      # Compiled Go API microservice (ConnectRPC, PostGIS, R2, M-Pesa)
├── mobile/       # Flutter field app (120 FPS compass sensor fusion, Drift SQLite, MapLibre)
├── web/          # Next.js Web GIS Portal (Carto Dark Matter, live telemetry, billing)
└── desktop/      # Tauri 2.0 + Rust workstation GIS studio (Shapefiles, Stereonets, 3D logs)
```

---

## 🚀 Current Milestone

We are in **Phase 1: Foundation & Backend**:

1. ✅ Protobuf definitions (`proto/geoquerry/v1/*.proto`) with generated Go + ConnectRPC code.
2. ✅ PostGIS spatial schema (`backend/internal/db/migrations/000001_init.sql`), auto-applied at boot from SQL embedded in the binary.
3. ✅ Go backend core: `GeoquerrySyncService` fully implemented — `PushSyncQueue` (offline batch upserts with Last-Write-Wins conflict resolution), `PullProjectData` (delta sync with clock-skew overlap), and `StreamLiveTelemetry` (live team tracking hub with TTL expiry).
4. ✅ Ops: CORS for the web portal, request logging, `/livez` + `/readyz` health checks, graceful shutdown, multi-stage scratch Dockerfile.
5. ⏳ Next: R2 presigned photo uploads, M-Pesa STK push, Paystack webhooks, GitLab CI/CD + Koyeb deployment, then the Flutter and Next.js clients.

### Run it locally

```bash
# 1. A Postgres with PostGIS (e.g. Neon free tier), then:
export DATABASE_URL='postgres://user:pass@ep-xxx.neon.tech/neondb?sslmode=require'

# 2. Start the API (migrations apply automatically on boot):
cd backend && go run ./cmd/server     # listens on :8080

# 3. Smoke: curl http://localhost:8080/livez
```

The Connect service answers at `/geoquerry.v1.GeoquerrySyncService/` in Connect, gRPC and gRPC-Web protocols (binary proto and JSON codecs) — point any Connect client at it.
