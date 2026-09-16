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

1. Protobuf definitions (`proto/geoquerry/v1/*.proto`) created.
2. PostGIS spatial database migrations (`backend/internal/db/migrations/000001_init.sql`) created.
3. Next steps: Go backend code generation, database connection pool, sync engine, and Koyeb deployment pipeline.
