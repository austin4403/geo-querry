// Package config loads every environment variable the backend needs into a
// single, validated struct.
//
// WHY A CONFIG PACKAGE?
// Scattering os.Getenv calls across main.go, db.go and the service handlers
// makes it easy to (a) forget where a variable is read, (b) silently accept
// garbage values, and (c) make tests non-deterministic. Centralising the
// parsing here means the process fails FAST at boot with a clear message
// ("DATABASE_URL is not set") instead of dying later with a confusing
// connection error in the middle of a request.
//
// Every deployment target (Koyeb, Docker, local dev) injects settings as
// environment variables — 12-factor style — so this file is the single
// source of truth for the runtime contract.
package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all runtime settings for the API server.
//
// It is constructed exactly once in main() via Load() and then passed down
// (explicitly, not via globals) to the components that need it.
type Config struct {
	// Port is the TCP port the HTTP server listens on.
	// Koyeb injects $PORT automatically; locally we default to 8080.
	Port string

	// DatabaseURL is the libpq/Neon connection string, e.g.
	// postgres://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require
	// Required — the service is useless without PostGIS behind it.
	DatabaseURL string

	// DBMaxConns / DBMinConns bound the pgx connection pool.
	// Koyeb Eco Nano gives us 512 MB RAM; 4 Postgres connections is a safe
	// ceiling that also respects Neon's free-tier connection limit.
	DBMaxConns int32
	DBMinConns int32

	// AllowedOrigins lists the web origins permitted to call this API from
	// a browser (CORS). The web portal lives on Cloudflare Pages, so its
	// origin differs from the API origin — without CORS headers every
	// browser request would be blocked by the Same-Origin Policy.
	// Non-browser clients (Flutter app, Go tests) ignore CORS entirely.
	AllowedOrigins []string

	// TelemetryMemberTTL is how long a field device may stay silent before
	// the hub marks that geologist as inactive (greying them out on the
	// live map) and eventually forgets them entirely.
	TelemetryMemberTTL time.Duration

	// APIKeys enables the shared-key auth gate on all Connect RPCs when
	// non-empty (env: GEOQUERRY_API_KEYS, comma-separated). Empty = gate
	// disabled, which is ONLY acceptable for local development — see
	// SECURITY.md for the roadmap to per-user auth.
	APIKeys []string

	// MaxBodyBytes caps request body size on the UNARY sync RPCs (env:
	// MAX_BODY_BYTES). A hostile or buggy client pushing an enormous batch
	// must not be able to balloon the 512 MB Koyeb container's memory; a
	// full day of field work fits comfortably in a few MB of protobuf.
	// The telemetry STREAM is exempt — its body legitimately accumulates
	// for hours (see withBodyLimit in main.go).
	MaxBodyBytes int64

	// ShutdownTimeout is how long in-flight requests get to finish after
	// SIGTERM before we drop them. Koyeb sends SIGTERM before killing the
	// container; 10s is a safe window for a final sync batch to land.
	ShutdownTimeout time.Duration
}

// Load reads, validates and returns the Config.
// It returns an error instead of logging-and-exiting so that main() keeps
// sole responsibility for process lifecycle (and tests can call it freely).
func Load() (Config, error) {
	cfg := Config{
		Port:               envOr("PORT", "8080"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		TelemetryMemberTTL: envDurationOr("TELEMETRY_MEMBER_TTL", 60*time.Second),
		MaxBodyBytes:       envInt64Or("MAX_BODY_BYTES", 4*1024*1024),
		ShutdownTimeout:    envDurationOr("SHUTDOWN_TIMEOUT", 10*time.Second),
	}

	// Pool sizing parses as int64 and is RANGE-VALIDATED before the int32
	// conversion — a fat-fingered env var (DB_MAX_CONNS=99999999999) must
	// fail boot with a clear error, not silently wrap to a garbage count
	// (gosec G115). Neon's ceiling and ours: a free-tier-friendly 1..64.
	cfg.DBMaxConns = int32(envIntInRange("DB_MAX_CONNS", 4, 1, 64))
	cfg.DBMinConns = int32(envIntInRange("DB_MIN_CONNS", 1, 0, 64))

	// Auth keys: comma-separated so platform env UIs (Koyeb, GitLab CI
	// variables) don't need quoting tricks. Generate a strong one with:
	//   openssl rand -base64 32
	if raw := os.Getenv("GEOQUERRY_API_KEYS"); raw != "" {
		for _, k := range strings.Split(raw, ",") {
			if k = strings.TrimSpace(k); k != "" {
				cfg.APIKeys = append(cfg.APIKeys, k)
			}
		}
	}

	// CORS origins are passed as a comma-separated list because many
	// platforms (Koyeb, Fly, Heroku) only support string env vars:
	//   CORS_ALLOWED_ORIGINS=https://geoquerry.pages.dev,http://localhost:3000
	// An empty value or "*" means "allow any origin" — fine for development.
	if raw := os.Getenv("CORS_ALLOWED_ORIGINS"); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			if o = strings.TrimSpace(o); o != "" {
				cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
			}
		}
	}

	// --- Validation: fail fast on values we cannot possibly run with. ---

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("config: DATABASE_URL env var is not set (Neon Postgres connection string)")
	}
	if p, err := strconv.Atoi(cfg.Port); err != nil || p < 1 || p > 65535 {
		return Config{}, fmt.Errorf("config: PORT %q is not a valid TCP port", cfg.Port)
	}
	if cfg.DBMaxConns < cfg.DBMinConns {
		return Config{}, fmt.Errorf("config: DB_MAX_CONNS (%d) must be >= DB_MIN_CONNS (%d)", cfg.DBMaxConns, cfg.DBMinConns)
	}

	return cfg, nil
}

// envOr returns the env var's value, or fallback when unset/empty.
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envInt64Or parses an int64 env var, falling back when unset/malformed.
func envInt64Or(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return fallback
}

// envIntInRange parses an int env var and HARD-FAILS boot when the value
// is malformed or outside [min, max] — misconfiguration should stop the
// process, not degrade it silently.
func envIntInRange(key string, fallback, min, max int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < min || n > max {
		log.Fatalf("config: %s must be an integer in [%d, %d], got %q", key, min, max, v)
	}
	return n
}

// envDurationOr parses a duration env var (e.g. "90s", "2m"), falling back
// when unset or malformed.
func envDurationOr(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
