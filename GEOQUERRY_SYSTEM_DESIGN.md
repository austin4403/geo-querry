# 🌍 GeoQuerry — Master System Architecture & Engineering Specification

> **The Offline-First, Cross-Platform Geological Intelligence & Field Exploration Platform**  
> Targets: **Mobile (iOS & Android)**, **Desktop Studio (Linux, Windows, macOS)**, and **Web GIS Workstation**  
> Infrastructure: **GitLab CI/CD**, **Neon PostGIS & Auth**, **Cloudflare R2**, and **Compiled Native Go Engine Daemon**  

---

## 1. Executive Summary

**GeoQuerry** is a next-generation geospatial intelligence platform engineered for mineral exploration teams, field geologists, hydrogeologists, and mining concession managers. It is designed specifically to operate seamlessly in remote environments with zero cellular connectivity (e.g., the East African Rift, remote mining blocks, and exploration bush camps), while bridging instantly to a real-time spatial collaboration suite.

### Key Capabilities
* **Offline Mobile Field Data Acquisition**: Hardware sensor fusion (accelerometer + magnetometer) computing strike, dip, trend, and plunge at **120 FPS** with real-time stability gating.
* **Heavyweight Desktop GIS Studio**: Native desktop workstation in **Rust** for offline 3D borehole log slicing, massive shapefile/GeoTIFF ingestion, and stereonet projections.
* **Collaborative Web GIS Workstation**: Interactive MapLibre GL engine with **Carto Dark Matter** and **Field Day Mode** themes, live team GPS tracking, and concession polygon geofencing.
* **Hybrid Dual-Currency Checkout**: Automated subscription billing supporting Kenyan **Safaricom M-Pesa STK Push** (KES) alongside global **Paystack / Stripe** (USD / Visa / Mastercard / Apple Pay).
* **Zero-Cost Local & Serverless Foundation ($0/mo)**: Engineered to leverage Neon PostGIS & Auth, Cloudflare R2, and a local high-performance Go systemd daemon without relying on third-party cloud compute PaaS.

---

## 2. System Architecture Topology

```
                                  ┌────────────────────────────────┐
                                  │    Neon PostgreSQL 16+         │
                                  │      (PostGIS Spatial)         │
                                  │    + Neon Auth (OAuth/Users)   │
                                  │    + Realtime Sync Triggers    │
                                  └───────────────┬────────────────┘
                                                  │
                                  ┌───────────────▼────────────────┐
                                  │      Go Backend Engine Daemon  │
                                  │      (Local Systemd User Svc)  │
                                  │  - ConnectRPC / gRPC Server    │
                                  │  - PostGIS Spatial Queries     │
                                  │  - River Durable Queue Engine  │
                                  │  - Ed25519 Token Assertion     │
                                  │  - Cloudflare R2 S3 Presigner  │
                                  └───────────────┬────────────────┘
                                                  │ (Protobuf Binary RPC / Connect on :8080)
            ┌─────────────────────────────────────┼─────────────────────────────────────┐
            │                                     │                                     │
┌───────────▼───────────┐             ┌───────────▼───────────┐             ┌───────────▼───────────┐
│     Desktop Studio    │             │   Web GIS Workstation │             │   Mobile Field App    │
│    Rust (Tauri 2.0)   │             │  Next.js 16 + TS      │             │    Flutter (Dart)     │
│  (Linux / Win / Mac)  │             │ (Port :3001 / Edge)   │             │    (iOS & Android)    │
│  - Heavy Shapefile/3D │             │  - Concession Portal  │             │  - Strike/Dip Sensors │
│  - Offline Tile Cache │             │  - Neon Auth & Sudo   │             │  - Offline Vector Map │
│  - MapLibre GL Engine │             │  - Live Team Tracker  │             │  - Local SQLite Drift │
└───────────────────────┘             └───────────────────────┘             └───────────────────────┘
```

---

## 3. The 3 Client Platforms

### 📱 A. Mobile Field App: Flutter (Dart)
*Replaces legacy Android-only Kotlin/Room implementation to deliver unified iOS & Android field readiness.*

* **Hardware Sensor Fusion (Structural Compass)**:
  - Consumes device accelerometer and magnetometer streams via `sensors_plus`.
  - Calculates strike, dip, trend, and plunge at 120 FPS with tilt compensation.
* **Offline Vector Mapping**:
  - MapLibre GL rendering `.mbtiles` packages containing regional vector contours, satellite basemaps, and geological boundary layers.
* **Local Persistence**:
  - Drift (type-safe SQLite) tracking dirty entities and Last-Write-Wins (LWW) conflict stamps.

### 🌐 B. Web GIS Workstation: Next.js + TypeScript
*Exploration management, concession monitoring, and multi-tenant telemetry.*

* **Interactive Concession Canvas**:
  - MapLibre GL JS rendering live interactive layers:
    - ⬡ **Polygons**: Concession licenses, mineral exploration claims, lithological units.
    - 〰 **Lines**: Structural fault traces, contact lines, drill traverses.
    - 📍 **Points**: Structural needles (showing strike & dip direction), sample pins, borehole collars.
* **Live Field Team Tracker**:
  - Connects to backend ConnectRPC stream to display real-time positions of geologists traversing the concessions.
* **Account & Concession Management**:
  - Neon Auth with Google OAuth, credentials, fast test personas, and 15-minute sudo elevation.

### 🖥️ C. Desktop GIS Studio: Rust (Tauri 2.0)
*Heavy computational GIS workstation for offline office analysis.*

* **Native Geoprocessing**:
  - Zero-copy shapefile and GeoTIFF parser using `geozero`.
  - Tabular drillhole log analysis via `polars`.
  - 3D borehole log stratigraphy interpolation and Schmidt/Wulff stereonet projections.

---

## 4. Backend Engine: Go (Golang)

*Managed as a native Linux systemd daemon (`geoquerry-backend.service`) running on `:8080`.*

### Why Go is Chosen for the GeoQuerry Backend
1. **Rapid Development Velocity**: Clean concurrency model without borrow checker friction or complex async lifetimes.
2. **Native Concurrency**: Lightweight goroutines handle hundreds of concurrent field streams using minimal RAM (~2 KB per goroutine).
3. **Database Performance**: Direct, zero-overhead connectivity to Neon PostGIS via [`pgx/v5`](https://github.com/jackc/pgx).
4. **Durable Background Jobs**: River queue engine for background spatial indexing and async audit trail recording.
5. **Zero Cloud Compute Overhead**: Runs directly on the workstation or on-premise hardware with instant restarts and zero PaaS fees.

### Core Backend Modules
* **ConnectRPC / gRPC & REST Gateways**:
  - Serves strictly-typed endpoints defined via Protocol Buffers.
* **Identity & Assertion Verification**:
  - Validates Ed25519-signed internal assertion tokens generated by the Next.js BFF.
* **Safaricom M-Pesa Daraja Integration (KES)**:
  - Generates C2B / Lipa Na M-Pesa Online STK Push requests directly to users' phones.
* **Paystack / Stripe Integration (USD & Global Cards)**:
  - Secure checkout sessions and webhook receiver upgrading user tiers automatically.
* **Cloudflare R2 S3 Presigner**:
  - Issues short-lived presigned URLs for direct client-to-R2 image uploads with EXIF metadata sanitization.

---

## 5. Universal Data Schema: Protocol Buffers

```protobuf
syntax = "proto3";
package geoquerry.v1;

service GeoQuerrySyncService {
  rpc PushSyncQueue (SyncPushRequest) returns (SyncPushResponse);
  rpc PullProjectData (SyncPullRequest) returns (SyncPullResponse);
  rpc StreamLiveTelemetry (stream TelemetryPoint) returns (stream TeamStatus);
}

message Station {
  int64 id = 1;
  int64 project_id = 2;
  string code = 3;                       // e.g. "ST-04"
  string name = 4;                       // e.g. "Kanyoko River Outcrop"
  double latitude = 5;
  double longitude = 6;
  double elevation = 7;
  double gps_accuracy = 8;
  string outcrop_exposure = 9;           // "in-situ", "float", "subcrop"
  string lithology = 10;
  repeated StructuralMeasurement measurements = 11;
  repeated RockSample samples = 12;
  int64 updated_at = 13;
}

message StructuralMeasurement {
  int64 id = 1;
  string measurement_type = 2;           // "bedding", "foliation", "fault"
  double strike = 3;                     // 0 - 360 degrees
  double dip = 4;                        // 0 - 90 degrees
  string dip_direction = 5;              // "NNE", "SSW", etc.
  bool auto_captured = 6;
}

message RockSample {
  int64 id = 1;
  string sample_tag = 2;                 // e.g. "SMP-2026-001"
  string lithology_class = 3;
  string mineralization_notes = 4;
  repeated string photo_r2_keys = 5;
}

message Borehole {
  int64 id = 1;
  int64 project_id = 2;
  string borehole_code = 3;              // e.g. "BH-08"
  double latitude = 4;
  double longitude = 5;
  double collar_elevation = 6;
  double total_depth_meters = 7;
  double water_strike_depth = 8;
  double yield_liters_per_hour = 9;
}
```

---

## 6. Zero-Cost ($0.00/mo) Infrastructure Blueprint

| Component | Provider & Tier | Purpose |
| :--- | :--- | :--- |
| **Code Repositories & CI/CD** | **GitLab & GitHub Free** | Private dual-remote repositories, CI/CD automated test & lint runners. |
| **Spatial Database & Auth** | **Neon PostgreSQL** (Free) | Serverless PostgreSQL 16+ with native PostGIS and Neon Auth enabled. |
| **Backend Engine** | **Local / On-Premise Systemd Daemon** | High-performance Go ConnectRPC binary on `:8080` (zero compute cost). |
| **Web GIS Workstation** | **Next.js Workstation Engine** (`:3001`) | Collaborative spatial mapping and administrative console. |
| **Media & Object Storage** | **Cloudflare R2** (Free) | 10 GB free storage, $0 egress bandwidth for field sample photos. |
| **Total Monthly Cost** | | **$0.00 / month** |

---

## 7. GitLab CI/CD Pipeline Blueprint

```yaml
# .gitlab-ci.yml for GeoQuerry Backend
stages:
  - test
  - security

test_backend:
  stage: test
  image: golang:1.25-alpine
  script:
    - cd backend
    - go test -v -race ./...

security_audit:
  stage: security
  image: golang:1.25-alpine
  script:
    - go install golang.org/x/vuln/cmd/govulncheck@latest
    - cd backend
    - govulncheck ./...
```

---

## 8. Phased Implementation Roadmap

1. **Phase 1: Protobuf Schemas & Go Backend Engine (Operational)**
   - Protobuf definitions with ConnectRPC code generation.
   - Go engine daemon with pgxpool, PostGIS migrations, River durable queue, and Neon Auth sync triggers.
   - Systemd user service daemon running on `:8080`.

2. **Phase 2: Web GIS Workstation (Operational)**
   - Next.js 16 app with MapLibre GL, Carto Dark Matter / Field Day modes, and theme toggle.
   - Neon Auth integration with Google OAuth, email credentials, fast personas, and Ed25519 token assertions.

3. **Phase 3: Flutter Mobile Field App (Next)**
   - Flutter application with high-contrast field GIS palette.
   - `sensors_plus` real-time Strike & Dip structural compass dial.
   - Drift local SQLite database and Protobuf binary sync client.

4. **Phase 4: Desktop GIS Studio (Rust + Tauri 2.0)**
   - Tauri 2.0 application shell.
   - Native Rust geoprocessing, stereonets, and drillhole log stratigraphy slicing.
