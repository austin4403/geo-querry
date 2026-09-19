# 🔐 GeoQuerry Backend — Security Audit & Threat Model

> **Scope**: `backend/` Go API service (sync engine, telemetry hub, HTTP surface, container)
> **Date**: September 2026 · **Auditor**: automated toolchain + manual review
> **Verdict**: ✅ **0 known reachable CVEs, 0 gosec findings, 0 staticcheck findings** on hand-written code. Known architectural gaps are listed explicitly in §6 — none are silent.

---

## 1. Toolchain & Results

| Tool | What it checks | Result |
| :--- | :--- | :--- |
| `govulncheck` (official Go vuln DB) | Known CVEs **reachable from our call graph** | ✅ **0 reachable** (was 3 — fixed, see §2) |
| `gosec` (securego) | 40+ CWE classes: hardcoded creds, overflow, log injection, weak crypto… | ✅ **0 findings** on hand-written code* |
| `staticcheck` | Correctness, deprecated APIs, perf traps | ✅ **0 findings** |
| `go vet` + `gofmt` | Standard Go diagnostics | ✅ clean |
| Unit tests (`go test ./...`) | LWW logic, auth gate, hub behavior, config | ✅ 4 packages, all green |

\* `backend/pkg/proto/**` (generated protobuf codegen) is excluded from gosec: it reports 14 `G103` (unsafe pointer use) findings that originate in **google.golang.org/protobuf's code generator**, are standard across every protobuf Go project, and are not maintainable from this repo. Tracked as an accepted risk in §6.8.

## 2. Vulnerabilities Found & Fixed During This Audit

| ID | Severity | Where | Issue | Fix |
| :--- | :--- | :--- | :--- | :--- |
| GO-2026-5970 | MEDIUM | `x/text v0.31.0` | reachable via sync/telemetry codecs | bumped to `v0.39.0` |
| GO-2026-5026 | MEDIUM | `x/net v0.47.0` | IDNA/Punycode handling reached via HTTP/2 transport | bumped to `v0.55.0` |
| GO-2026-4918 | HIGH | `x/net v0.47.0` | **infinite loop / DoS** in HTTP/2 on malformed `SETTINGS_MAX_FRAME_SIZE` — directly reachable by any client that opens a telemetry stream | bumped to `v0.55.0` |
| gosec G115 ×2 | HIGH | `internal/config` | `int → int32` connection-pool conversion could silently wrap on absurd env values | parse as int64 + hard-fail range validation `[1..64]` |
| gosec G706 | LOW | `cmd/server` | **log injection**: request path is attacker-controlled and was logged raw (newlines could forge log lines) | `sanitizeLogField` strips all control characters |
| gosec G101 ×2 | HIGH | `cmd/seed`, `internal/auth` | hardcoded-credential *patterns* | seed no longer carries a fallback DSN (requires `DATABASE_URL`); auth constant documented as a header name, not a secret (`#nosec G101` with rationale) |
| SA1019 | LOW | `cmd/server` | deprecated `golang.org/x/net/h2c` wrapper | replaced with Go-native `http.Server.Protocols` (`SetUnencryptedHTTP2`) — dependency removed |

## 3. Attack Surface Map

```
Internet ──▶ Koyeb edge (TLS termination) ──▶ Go binary (this repo)
                                                ├─ /livez, /readyz          (unauthenticated, no data)
                                                ├─ /geoquerry.v1.../PushSyncQueue      (API key)
                                                ├─ /geoquerry.v1.../PullProjectData    (API key)
                                                └─ /geoquerry.v1.../StreamLiveTelemetry(API key, bidi h2c)
                                                     └─▶ PostGIS (Neon, TLS, 4 conns max)
```

## 4. Controls in Place (verified)

### 4.1 Transport
- **TLS terminates at Koyeb's edge**; the Go binary speaks h2c/HTTP1 inside the platform network. Local runs are plaintext by design — never expose the raw binary directly to the internet without TLS in front.
- `ReadHeaderTimeout` (10s) + `IdleTimeout` (120s) are set; **deliberately no global `Read/WriteTimeout`** — those would kill long-lived telemetry streams (documented at the config site).

### 4.2 Authentication (v1: shared API keys)
- All three RPCs (unary **and** the streaming handler — the location-leaking one) sit behind `internal/auth`: `X-Geoquerry-Api-Key` header checked against `GEOQUERRY_API_KEYS`.
- Keys are **SHA-256 hashed at boot** and compared with `subtle.ConstantTimeCompare` over equal-length digests — no timing oracle for key length or prefix (covered by `TestKeyLengthVariationRejected`).
- Missing/invalid key → Connect `CodeUnauthenticated`.
- Gate is **off when the env var is unset** (local dev convenience). Deployment checklist (§7) makes setting it mandatory.

### 4.3 Input validation & injection
- **No string-built SQL anywhere.** Every statement is a constant with `$n` placeholders (pgx prepared statements) — SQL injection surface is structurally zero.
- All client-supplied IDs pass `uuid.Parse` before touching the DB (a malformed UUID would otherwise hit Postgres as `22P02` noise); lat/lon are range- and NaN/Inf-checked before entering PostGIS (one NaN point would poison every spatial query on the table).
- Request bodies on unary RPCs are capped by `withBodyLimit` (default 4 MB, env `MAX_BODY_BYTES`): `Content-Length` rejected pre-read **and** `http.MaxBytesReader` for lying/chunked clients. The telemetry stream is exempt by route (its body legitimately grows over hours) — see §6.4 for the residual risk.

### 4.4 Sync engine integrity
- Writes are LWW-guarded **inside Postgres** (`ON CONFLICT … WHERE updated_at < EXCLUDED`) — no read-modify-write race exists to exploit.
- Per-entity errors are classified and reported; a hostile/buggy batch cannot abort the whole push mid-transaction (each entity is its own statement/tx).
- Borehole intervals are replaced in the same transaction as their parent — no partial-log states.

### 4.5 Telemetry hub
- Ephemeral by design: **no persistence** of live locations; TTL (60s default) + 4×TTL forgetting bounds the window any location datum exists in RAM.
- Slow/broken subscribers can never block the publisher (non-blocking send with drop); a wedged client can't stall the whole team's stream.
- The receive goroutine is context-aware — no goroutine leak per dropped connection (resource-exhaustion vector closed; covered by unit tests).

### 4.6 Container & supply chain
- `scratch` runtime image: **no shell, no package manager, no libc** — minimal RCE surface if exfiltrated.
- Runs as **UID 65532 (non-root)** — container compromise lands on an unprivileged user.
- CA bundle baked in (required for Neon TLS + future payment APIs).
- `go.mod`/`go.sum` pinned; `govulncheck` runs in CI (§8) so future CVEs fail the build instead of shipping silently.

## 5. Data Protection Notes

| Data | At rest | In transit | Notes |
| :--- | :--- | :--- | :--- |
| Field geo data | Neon (encrypted at rest) | TLS to Neon (`sslmode=require` on prod DSN) | |
| Live telemetry | **RAM only, TTL ≤ 4 min** | same TLS as above | never written to disk |
| Photos (future R2) | R2 | presigned URL direct-to-R2 | keys only in DB |
| API keys | env var → SHA-256 in RAM | header over TLS | rotate via §7 |

## 6. Known Gaps & Accepted Risks (roadmap)

| # | Gap | Risk | Planned mitigation |
| :--- | :--- | :--- | :--- |
| 6.1 | **Shared API key, no per-user identity** | a leaked key = full project read/write; no attribution of who wrote what | Phase 2: per-user JWT (project-scoped claims) issued by a `/auth` RPC; key becomes bootstrap-only |
| 6.2 | **No authorization levels** | any key holder can pull ALL project data (owner/editor/viewer distinction from the design doc is not enforced yet) | same JWT work: `project_members` table + claims check per project |
| 6.3 | **No rate limiting** | scripted hammering of push/pull could exhaust the 4 DB connections / CPU | per-IP + per-key token bucket at the middleware layer; Koyeb edge limits help |
| 6.4 | **Telemetry stream exempt from body cap** | one connection can push breadcrumbs unboundedly for hours | per-stream message-rate limit (e.g. 10 pts/s) in the stream handler |
| 6.5 | **API-key gate off by default** | a deploy that forgets `GEOQUERRY_API_KEYS` ships open | CI/deploy template injects the var; a startup warning log exists — a hard fail in "production mode" is the next step |
| 6.6 | **Client timestamps trusted for LWW** | a device with a skewed clock can win conflicts it shouldn't | hybrid logical clock (HLC); upsert shape already compatible |
| 6.7 | **CORS `*` when `CORS_ALLOWED_ORIGINS` unset** | any website could call the API from a browser *if a key leaks to it* | set the var in prod; browser preflight never carries the key header anyway |
| 6.8 | **Generated protobuf uses `unsafe`** (14 gosec G103) | none demonstrated — upstream codegen pattern | accepted; regenerate with newer protoc-gen-go when it drops `unsafe` |
| 6.9 | **No audit log** | writes are attributable only after 6.1 | `audit_log` table when identity lands |
| 6.10 | **M-Pesa/Paystack/R2 not yet implemented** | callback-signature verification is THE critical control when they land | webhook signature checks are specified in the design doc and MUST precede any production billing launch |

## 7. Deployment Hardening Checklist (Koyeb)

```bash
# 1. Generate a strong API key (per environment!)
openssl rand -base64 32

# 2. Set on the Koyeb service (all required):
DATABASE_URL=postgres://...neon.tech/neondb?sslmode=require   # note sslmode=require
GEOQUERRY_API_KEYS=<the key above>                            # enables the auth gate
CORS_ALLOWED_ORIGINS=https://<your-portal>.pages.dev          # lock CORS to your portal
PORT=8080

# 3. Optional tuning (sane defaults shown):
MAX_BODY_BYTES=4194304   DB_MAX_CONNS=4   TELEMETRY_MEMBER_TTL=60s
```

- Store `GEOQUERRY_API_KEYS` in GitLab CI variables (masked+protected) and Koyeb secrets — never in the repo.
- Rotate by adding the new key to the comma list, redeploying clients, then removing the old key (both are valid during the overlap).
- `/readyz` returns 503 when Postgres is unreachable → wire it as Koyeb's readiness probe so a wedged DB drains traffic.

## 8. Continuous Verification (in `.gitlab-ci.yml`)

The pipeline runs `go vet`, `go test`, `govulncheck` (fails on reachable CVEs), `gosec` (fails on new findings in hand-written code), and builds the container — the same gates used in this audit, so regressions are caught at merge time, not in production.

---

*Report generated as part of the Phase-1 backend implementation review. Re-run the three scanners after any dependency bump (`go run golang.org/x/vuln/cmd/govulncheck@latest ./...` etc.).*
