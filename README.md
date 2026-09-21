# 🗺️ GeoQuerry

> **The Offline-First, Cross-Platform Geological Intelligence & Field Exploration Platform**  
> Targets: **Web GIS Workstation**, **Mobile (iOS & Android Flutter)**, and **Desktop Studio (Linux, macOS, Windows)**  
> Architecture: **Zero-Cost Foundation** (Neon Serverless PostGIS & Auth, Cloudflare R2, Local Native Systemd Engine)  
> Remotes: GitLab (`git@gitlab.com:austin4403/geo-querry.git`) & GitHub (`https://github.com/austin4403/geo-querry.git`)  

---

## 📚 Documentation & Project Specs

- **[Master System Design & Architecture](GEOQUERRY_SYSTEM_DESIGN.md)**: Comprehensive technical specification covering hardware sensor fusion math, offline vector tile caching, dual-currency billing (M-Pesa & Paystack), and local workstation topology.
- **[Project Plan, Implementation Audit & Roadmap](PROJECT_PLAN.md)**: Detailed monorepo directory layout, current implementation status, file inventory, and execution roadmap.

---

## 🏗️ Repository Architecture

```
geo-querry/
├── proto/        # Universal Protocol Buffer contracts (geology, sync, telemetry, auth)
├── backend/      # Compiled Go engine daemon (ConnectRPC, PostGIS, River queue, telemetry)
├── web/          # Next.js Web GIS Workstation (MapLibre GL, Neon Auth, Carto Dark / Day Mode)
├── mobile/       # Flutter field app (120 FPS compass sensor fusion, Drift SQLite, MapLibre)
└── desktop/      # Tauri 2.0 + Rust workstation GIS studio (Shapefiles, Stereonets, 3D logs)
```

---

## 🚀 Current Milestone & Status

We have implemented the core foundation across the database, backend engine, and web workstation:

1. ✅ **Protobuf Contracts**: `proto/geoquerry/v1/*.proto` compiled into Go + ConnectRPC stubs (`pkg/proto/geoquerryv1`).
2. ✅ **PostGIS Spatial Schema**: PostGIS migrations `000001` through `000006` applied to Neon cloud database (projects, concessions, stations, structural measurements, rock samples, vegetation, boreholes, audit trails, and River queue).
3. ✅ **Automated Identity Sync**: Live PostgreSQL trigger `on_neon_auth_user_sync` automatically synchronizing `neon_auth."user"` identities into `public.users` and provisioning tenant access in `public.organization_memberships` (Turkana Gold Ltd).
4. ✅ **Go Backend Engine**: Managed as a native Linux systemd user service (`geoquerry-backend.service`) running on `:8080`. Implements ConnectRPC `GeoquerrySyncService` with Last-Write-Wins conflict resolution, River durable queue engine, live telemetry streaming hub, and Ed25519 token assertion verification.
5. ✅ **Web GIS Workstation**: Next.js 16 app running on `:3001` with MapLibre GL GIS canvas, Neon Auth (Google OAuth, email credentials, fast personas), and seamless toggle between Carto Dark Matter and High-Contrast Field Day Mode.
6. ⏳ **Next Steps**: Outcrop station and structural field capture forms, Flutter mobile field app setup, and Cloudflare R2 presigned photo uploads.

### Running Locally

```bash
# 1. Backend Engine (managed via systemd user service or direct binary run):
systemctl --user status geoquerry-backend.service
# Or run manually:
cd backend && go run ./cmd/server     # listens on :8080

# 2. Web GIS Workstation:
cd web && npm run dev                # listens on :3001

# 3. Health check:
curl http://localhost:8080/healthz
```

The Connect service answers at `/geoquerry.v1.GeoquerrySyncService/` and `/geoquerry.v1.AuthService/` across Connect, gRPC, and gRPC-Web protocols.
