# 🌍 GeoQuerry — Master System Architecture & Engineering Specification

> **The Offline-First, Cross-Platform Geological Intelligence & Field Exploration Platform**  
> Targets: **Mobile (iOS & Android)**, **Desktop Studio (Linux, Windows, macOS)**, and **Web GIS Portal**  
> Infrastructure: **GitLab CI/CD**, **Neon PostGIS**, **Cloudflare R2**, **Cloudflare Pages**, and **Compiled Go API**

---

## 1. Executive Summary

**GeoQuerry** is a next-generation geospatial intelligence platform engineered for mineral exploration teams, field geologists, hydrogeologists, and mining concession managers. It is designed specifically to operate seamlessly in remote environments with zero cellular connectivity (e.g., the East African Rift, remote mining blocks, and exploration bush camps), while bridging instantly to a real-time, cloud-synchronized spatial collaboration suite.

### Key Capabilities
* **Offline Mobile Field Data Acquisition**: Hardware sensor fusion (accelerometer + magnetometer) computing strike, dip, trend, and plunge at **120 FPS** with real-time stability gating.
* **Heavyweight Desktop GIS Studio**: Native desktop workstation in **Rust** for offline 3D borehole log slicing, massive shapefile/GeoTIFF ingestion, and stereonet projections.
* **Collaborative Web GIS Portal**: Interactive MapLibre GL engine with the **Carto Dark Matter** theme, live team GPS tracking, and concession polygon geofencing.
* **Hybrid Dual-Currency Checkout**: Automated subscription billing supporting Kenyan **Safaricom M-Pesa STK Push** (KES) alongside global **Paystack / Stripe** (USD / Visa / Mastercard / Apple Pay).
* **100% Free Cloud Foundation ($0/mo)**: Engineered to leverage generous free tiers across Neon, Cloudflare, and Koyeb without operational lock-in.

---

## 2. System Architecture Topology

```
                                  ┌────────────────────────────────┐
                                  │    Neon PostgreSQL 16+         │
                                  │      (PostGIS Spatial)         │
                                  │    + Upstash Redis (Pub/Sub)   │
                                  └───────────────┬────────────────┘
                                                  │
                                  ┌───────────────▼────────────────┐
                                  │      Go Backend Microservice   │
                                  │      (Hosted on Koyeb / Free)  │
                                  │  - ConnectRPC / gRPC Server    │
                                  │  - PostGIS Spatial Queries     │
                                  │  - M-Pesa & Paystack Webhooks  │
                                  │  - Cloudflare R2 S3 Presigner  │
                                  └───────────────┬────────────────┘
                                                  │ (Protobuf Binary RPC / Connect)
            ┌─────────────────────────────────────┼─────────────────────────────────────┐
            │                                     │                                     │
┌───────────▼───────────┐             ┌───────────▼───────────┐             ┌───────────▼───────────┐
│     Desktop Studio    │             │      Web GIS Portal   │             │   Mobile Field App    │
│    Rust (Tauri 2.0)   │             │  Next.js + TypeScript │             │    Flutter (Dart)     │
│  (Linux / Win / Mac)  │             │ (Cloudflare Pages.dev)│             │    (iOS & Android)    │
│  - Heavy Shapefile/3D │             │  - Concession Portal  │             │  - Strike/Dip Sensors │
│  - Offline Tile Cache │             │  - M-Pesa/Card Billing│             │  - Offline Vector Map │
│  - MapLibre GL Engine │             │  - Live Team Tracker  │             │  - Local SQLite Drift │
└───────────────────────┘             └───────────────────────┘             └───────────────────────┘
```

---

## 3. The 3 Client Platforms

### 📱 A. Mobile Field App: Flutter (Dart)
*Replaces legacy Android-only Kotlin/Room implementation to deliver unified iOS & Android field readiness.*

* **Hardware Sensor Fusion (Structural Compass)**:
  - Consumes device accelerometer and magnetometer streams via `sensors_plus`.
  - Calculates Pitch, Roll, and Azimuth $\rightarrow$ computes structural **Dip, Dip Direction, and Strike** with real-time sensor noise filtering and stability gating.
* **Offline Vector Mapping**:
  - `maplibre_gl` (Flutter) rendering offline vector tiles (`.mbtiles` packages) cached directly in local storage.
  - Displays concession boundaries, previous traverse waypoints, and geological contacts without internet connection.
* **Local Persistence (Offline-First)**:
  - **Drift (Type-Safe SQLite)**: Stores Projects, Stations, Structural Measurements, Rock Samples, Borehole intervals, and GPS Tracks locally.
  - **Deterministic Sync Engine**: Background queue utilizing Last-Write-Wins (LWW) resolution and state flags (`is_dirty`, `synced_at`).
* **Low-Bandwidth Transmission**:
  - Encodes sync batches in **Protocol Buffers** instead of verbose JSON, reducing sync payload size by **70–80%** over weak 2G/EDGE or satellite connections.

---

### 💻 B. Desktop Studio: Rust + Tauri 2.0
*Workstation GIS suite for exploration managers and lead geologists.*

* **Native Rust Processing Engine**:
  - Ingests and processes massive spatial files (GeoJSON, ESRI Shapefiles, GeoTIFFs, LAS drill logs) without browser memory exhaustion using [`geozero`](https://docs.rs/geozero), [`geo`](https://docs.rs/geo), and [`polars`](https://docs.rs/polars).
  - Generates structural stereonets, cross-sections, and 3D borehole log interpolations natively on CPU/GPU.
* **Tauri 2.0 Shell**:
  - Native window wrapper on Linux, Windows, and macOS with an installer size of **~15 MB** and **<50 MB RAM** idle.
  - Shares UI components with the Web application while delegating all computational geometry to native Rust.

---

### 🌐 C. Web GIS Portal: Next.js + TypeScript + Tailwind v4
*Hosted globally on Cloudflare Pages (`pages.dev`).*

* **Carto Dark Matter GIS Theme**:
  - Deep obsidian base (`#09090b` Zinc 950) with high-contrast emerald green (`#10b981`) telemetry beacons and electric blue (`#2563eb`) UI controls.
* **Interactive Concession Canvas**:
  - MapLibre GL JS rendering live interactive layers:
    - ⬡ **Polygons**: Concession licenses, mineral exploration claims, lithological units.
    - 〰 **Lines**: Structural fault traces, contact lines, drill traverses.
    - 📍 **Points**: Structural needles (showing strike & dip direction), sample pins, borehole collars.
* **Live Field Team Tracker**:
  - Connects to backend WebSocket/SSE stream to display real-time positions of geologists traversing the concessions.
* **Account & Concession Management**:
  - Project sharing, collaborator permissions (Owner, Editor, Viewer), and export generator (GeoJSON, GPX, CSV, Shapefile ZIP bundles).

---

## 4. Backend Cloud API: Go (Golang)

*Hosted on Koyeb (Free Eco Nano Tier, 512 MB RAM, Always-On).*

### Why Go is Chosen for the GeoQuerry Backend
1. **Rapid Development Velocity**: No borrow checker friction or complex async lifetimes when writing mundane payment webhooks and CRUD routes.
2. **Native Concurrency**: Lightweight goroutines (`go streamCoordinates(ws)`) handle hundreds of concurrent field streams using minimal RAM (~2 KB per goroutine).
3. **Database Performance**: Direct, zero-overhead connectivity to Neon PostGIS via [`pgx`](https://github.com/jackc/pgx).
4. **Minimal Binary Footprint**: Compiles to a self-contained ~15 MB Docker scratch container.

### Core Backend Modules
* **ConnectRPC / gRPC & REST Gateways**:
  - Serves strictly-typed endpoints defined via Protocol Buffers.
* **Safaricom M-Pesa Daraja Integration (KES)**:
  - Generates C2B / Lipa Na M-Pesa Online STK Push requests directly to users' phones.
  - Secure `/webhooks/mpesa` endpoint verifying Daraja cryptographic signatures.
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

## 6. Zero-Cost ($0.00/mo) Cloud Infrastructure Blueprint

| Component | Provider & Tier | Purpose |
| :--- | :--- | :--- |
| **Code Repository & CI/CD** | **GitLab Free** | Private monorepo, 400 CI/CD build minutes, and built-in Docker Container Registry. |
| **Spatial Database** | **Neon PostgreSQL** (Free) | Serverless PostgreSQL 16+ with native PostGIS extension enabled. |
| **Media & Object Storage** | **Cloudflare R2** (Free) | 10 GB free storage, $0 egress bandwidth for field sample photos. |
| **Web Portal Hosting** | **Cloudflare Pages** (Free) | Global edge CDN connected to GitLab repo with automatic builds. |
| **Backend API Service** | **Koyeb Eco Nano** (Free) | Always-on 512 MB Linux container running the compiled Go binary. |
| **Real-Time Telemetry Cache**| **Upstash Redis** (Free) | Serverless Redis (10,000 requests/day) for live field location pub/sub. |
| **Total Monthly Cost** | | **$0.00 / month** |

---

## 7. GitLab CI/CD Pipeline Blueprint

```yaml
# .gitlab-ci.yml for GeoQuerry Backend
stages:
  - test
  - build
  - deploy

variables:
  DOCKER_IMAGE: $CI_REGISTRY_IMAGE/api:$CI_COMMIT_SHORT_SHA

test_backend:
  stage: test
  image: golang:1.24-alpine
  script:
    - cd backend
    - go test -v ./...

build_docker:
  stage: build
  image: docker:24.0.5
  services:
    - docker:dind
  script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin $CI_REGISTRY
    - docker build -t $DOCKER_IMAGE -f backend/Dockerfile .
    - docker push $DOCKER_IMAGE
  only:
    - main

deploy_koyeb:
  stage: deploy
  image: curlimages/curl:latest
  script:
    - curl -X POST https://app.koyeb.com/v1/deployments -H "Authorization: Bearer $KOYEB_API_TOKEN"
  only:
    - main
```

---

## 8. Phased Implementation Roadmap

1. **Phase 1: Protobuf Schemas & Go Backend**
   - Initialize repository with `.proto` definitions.
   - Set up Go server with `connect-go`, Neon PostGIS connection, and R2 S3 presigner.
   - Implement M-Pesa STK push and Paystack webhook handlers.

2. **Phase 2: Flutter Mobile Field App**
   - Create Flutter application with dark GIS palette (`#09090b`).
   - Implement `sensors_plus` real-time Strike & Dip structural compass dial.
   - Integrate Drift local SQLite database and deterministic offline sync queue.

3. **Phase 3: Web GIS Portal (Next.js)**
   - Connect Next.js repository on GitLab to Cloudflare Pages.
   - Implement MapLibre GL Carto Dark Matter concession visualizer.
   - Integrate real-time WebSocket team location telemetry.

4. **Phase 4: Desktop Studio (Rust + Tauri 2.0)**
   - Wrap Next.js GIS views with Tauri 2.0 on Linux, Windows, and macOS.
   - Implement native Rust commands for heavy shapefile/CSV parsing and 3D borehole log projections.

---

## License

Copyright © 2026 GeoQuerry Project. Proprietary & Confidential.
