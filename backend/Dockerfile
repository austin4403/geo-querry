# =============================================================================
# GeoQuerry backend — multi-stage build for Koyeb (Eco Nano, 512 MB, $0/mo)
# =============================================================================
# Stage 1 (builder): full Go toolchain, compiles a static binary.
# Stage 2 (runtime): scratch = literally empty filesystem + our binary.
#
# WHY SCRATCH?
#   - Attack surface: no shell, no package manager, nothing to exploit.
#   - Size: ~15 MB image pulls in <1s on a cold Koyeb deploy.
#   - Migrations are go:embed-ed INTO the binary (see internal/db/db.go),
#     so the runtime needs no extra files.
#
# Build (from repo root):   docker build -f backend/Dockerfile -t geoquerry-api .
# Run locally:
#   docker run -p 8080:8080 -e DATABASE_URL=postgres://... geoquerry-api

# --- Stage 1: build ----------------------------------------------------------
# go.mod declares go 1.25 (pgx v5.11 requires it) — keep this image in sync.
FROM golang:1.25-alpine AS builder

# git is needed by Go modules resolving via VCS pseudo-versions; certs for
# module proxy TLS.
RUN apk add --no-cache git ca-certificates

WORKDIR /src

# Copy module manifests first and pre-download deps: Docker layer-caches
# them, so source-only changes skip the (slow) dependency download entirely.
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Now the source. .dockerignore at the repo root keeps web/mobile/desktop
# out of the context.
COPY backend/ .

# CGO_ENABLED=0 -> pure-Go binary, no glibc dependency, runs on scratch.
# -trimpath & -ldflags "-s -w" strip paths and debug tables for a smaller,
# less information-leaking image.
RUN CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" \
    -o /out/geoquerry-server ./cmd/server

# --- Stage 2: runtime --------------------------------------------------------
FROM scratch

# CA certificates are REQUIRED in production: Neon Postgres refuses
# non-TLS connections, and the future M-Pesa / Paystack / R2 integrations
# all call HTTPS endpoints. A scratch image without this copy fails every
# outbound TLS handshake with "x509: certificate signed by unknown
# authority" — a classic scratch-image footgun.
# (Timezone data needs no copy: the binary embeds it via time/tzdata.)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

COPY --from=builder /out/geoquerry-server /geoquerry-server

# Run as an unprivileged user. scratch has no /etc/passwd, so this is the
# raw numeric UID/GID (65532 = the "nobody" convention used by distroless).
# If the container is ever compromised, the attacker lands as UID 65532:
# no root, no group privileges, nothing to escalate within the container.
USER 65532:65532

# Koyeb injects PORT; we document the default for local docker runs.
ENV PORT=8080
EXPOSE 8080

# scratch has no init: the binary IS PID 1 and handles SIGTERM itself
# (see the graceful-shutdown logic in cmd/server/main.go).
ENTRYPOINT ["/geoquerry-server"]
