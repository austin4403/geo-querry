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
# go.mod declares go 1.26.0 (toolchain go1.26.8) — keep this image in sync.
FROM golang:1.26-alpine AS builder

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
    -o /out/geoquerry-api \
    ./cmd/server

# Also compile the seed binary if an operator needs to populate dummy data
# via `docker run --entrypoint /seed <image>`.
RUN CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" \
    -o /out/seed \
    ./cmd/seed

# Also compile the bench tool for telemetry soak-testing.
RUN CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" \
    -o /out/bench-telemetry \
    ./cmd/bench-telemetry

# --- Stage 2: scratch runtime ------------------------------------------------
FROM scratch

# ca-certificates from the builder stage: needed for HTTPS outgoing calls
# (Stripe, M-Pesa Daraja, R2 presigning).
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Koyeb Eco Nano exposes port 8080 by convention (PORT env var).
EXPOSE 8080

# The compiled binary is entirely self-contained.
COPY --from=builder /out/geoquerry-api /geoquerry-api
COPY --from=builder /out/seed /seed
COPY --from=builder /out/bench-telemetry /bench-telemetry

# Run unprivileged. Koyeb containers run in isolated microVMs (Firecracker),
# but principle of least privilege applies. User 65534 = nobody in Linux.
USER 65534:65534

ENTRYPOINT ["/geoquerry-api"]
