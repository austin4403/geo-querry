# 🔐 GeoQuerry Backend — Security Audit & Threat Model

> **Scope**: `backend/` Go engine daemon (sync engine, telemetry hub, ConnectRPC surface, identity verification)  
> **Date**: September 2026 · **Auditor**: automated toolchain + manual review  
> **Verdict**: ✅ **0 known reachable CVEs, 0 gosec findings, 0 staticcheck findings** on hand-written code. Identity verification via Ed25519 assertions, audit trails, and Neon Auth triggers are implemented.  

---

## 1. Toolchain & Results

| Tool | What it checks | Result |
| :--- | :--- | :--- |
| `govulncheck` (official Go vuln DB) | Known CVEs **reachable from our call graph** | ✅ **0 reachable** |
| `gosec` (securego) | 40+ CWE classes: hardcoded creds, overflow, log injection, weak crypto… | ✅ **0 open findings** — 5 surgical suppressions with inline rationale |
| `staticcheck` | Correctness, deprecated APIs, perf traps | ✅ **0 findings** |
| `go vet` + `gofmt` | Standard Go diagnostics | ✅ clean |
| Unit tests (`go test -race ./...`) | LWW logic, auth gate, hub behavior, config + **data-race detection** | ✅ 4 packages, all green |

### Suppression Policy
`#nosec` is used surgically — only where the risk is already mitigated and gosec's dataflow cannot see it — and every suppression carries an inline justification.
- `internal/config/config.go` ×2: `G115` (int→int32 overflow) — values verified via `envIntInRange` within `[0..64]`.
- `internal/auth/interceptor.go`: `G101` — header name `X-Geoquerry-Api-Key` constant, not credentials.
- `internal/config/config.go`: `G706` — rendered via `%q` escaping.
- `cmd/server/main.go`: `G706` — path sanitized via `sanitizeLogField` + `%q`.

\* `backend/pkg/proto/**` (generated protobuf codegen) is excluded from gosec: it reports 14 `G103` (unsafe pointer use) findings that originate in **google.golang.org/protobuf's code generator**, standard across every protobuf Go project.

---

## 2. Attack Surface & Architecture Map

```
Clients (Browser Workstation / Mobile Flutter)
       │
       ▼
Next.js BFF (:3001) / Local Host
       │  (Ed25519-signed internal assertion tokens / ConnectRPC)
       ▼
Go Engine Daemon (:8080 / systemd user service)
       ├─ /livez, /readyz, /healthz      (unauthenticated health probes)
       ├─ /geoquerry.v1.AuthService/...  (ExchangeAssertion, VerifySudo, GetSessionContext)
       ├─ /geoquerry.v1.GeoquerrySync... (PushSyncQueue, PullProjectData)
       └─ /geoquerry.v1.GeoquerrySync... (StreamLiveTelemetry)
            │
            ▼
Neon PostgreSQL 16+ (PostGIS, TLS required, pooler connection)
       ├─ neon_auth."user" ──(Trigger: on_neon_auth_user_sync)──▶ public.users
       ├─ public.organization_memberships
       ├─ public.audit_logs
       └─ river durable background queue
```

---

## 3. Controls in Place (Verified)

### 3.1 Transport & Network Isolation
- Go backend runs as an isolated systemd user service (`geoquerry-backend.service`) bound to `127.0.0.1:8080`.
- All database traffic to Neon enforces TLS (`sslmode=require&channel_binding=require`).
- `ReadHeaderTimeout` (10s) + `IdleTimeout` (120s) are set; deliberately no global `Read/WriteTimeout` to allow persistent telemetry streams.

### 3.2 Authentication & Identity Management
- **Ed25519 Token Assertions**: The Next.js BFF generates cryptographically signed internal assertions verifying the Neon Auth session. The Go engine's `internal/auth/verifier.go` validates signatures and claims before fulfilling RPC requests.
- **Automated Database Synchronization**: The `on_neon_auth_user_sync` PostgreSQL trigger immediately verifies and provisions identities into `public.users` and assigns default membership in `public.organization_memberships`.
- **Sudo Elevation Gate**: High-risk spatial actions require 15-minute sudo elevation validated via `VerifySudo`.
- **API Key Fallback**: Local developer requests support `X-Geoquerry-Api-Key` with SHA-256 hashed constant-time comparisons.

### 3.3 Input Validation & SQL Injection Defense
- **Zero String-Built SQL**: Every query utilizes constant prepared statements with `$n` parameters via `pgx/v5`.
- Client-supplied IDs pass `uuid.Parse` validation before touching the database.
- Geodesic coordinate inputs are validated against NaN/Inf and bounded ranges `[-90..90]`, `[-180..180]` before PostGIS ingestion.
- Unary RPC bodies are capped by `withBodyLimit` (default 4 MB).

### 3.4 Sync Engine Integrity & LWW Protection
- Writes are guarded inside PostgreSQL using `ON CONFLICT ... WHERE updated_at < EXCLUDED.updated_at`.
- Borehole intervals are updated atomically within the same database transaction as the parent collar record.
- Audit trail triggers automatically record row mutations into `public.audit_logs`.

---

## 4. Data Protection Matrix

| Data | At Rest | In Transit | Protection Mechanism |
| :--- | :--- | :--- | :--- |
| Concession & Field Data | Neon Postgres | TLS (`sslmode=require`) | AES-256 encrypted storage, PostGIS spatial indexing |
| Identity & Credentials | Neon Auth (`neon_auth`) | TLS | Scrypt password hashing, OAuth token encryption |
| Live Telemetry | RAM only (TTL ≤ 4 min) | Local ConnectRPC / TLS | Ephemeral in-memory ring buffer, non-persistent |
| Audit Logs | Neon Postgres | TLS | Immutable append-only audit trail |

---

## 5. Deployment & Service Configuration (Systemd)

The Go backend engine is managed locally as a native systemd user service:

```ini
# ~/.config/systemd/user/geoquerry-backend.service
[Unit]
Description=GeoQuerry PostGIS Core Engine Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/austin/Projects/geo-querry/backend
ExecStart=/home/austin/Projects/geo-querry/backend/bin/server
Restart=always
RestartSec=3
Environment="PORT=8080"
EnvironmentFile=/home/austin/Projects/geo-querry/backend/.env

[Install]
WantedBy=default.target
```

### Management Commands
```bash
# Check status:
systemctl --user status geoquerry-backend.service

# Restart service:
systemctl --user restart geoquerry-backend.service

# View live logs:
journalctl --user -u geoquerry-backend.service -f
```

---

## 6. Continuous Verification

The project CI pipeline (`.gitlab-ci.yml`) automatically runs:
- `go vet ./...`
- `go test -v -race ./...`
- `govulncheck ./...` (fails on reachable CVEs)
- Next.js ESLint and TypeScript checks
