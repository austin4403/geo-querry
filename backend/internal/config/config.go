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
		DBMaxConns:         int32(envIntOr("DB_MAX_CONNS", 4)),
		DBMinConns:         int32(envIntOr("DB_MIN_CONNS", 1)),
		TelemetryMemberTTL: envDurationOr("TELEMETRY_MEMBER_TTL", 60*time.Second),
		ShutdownTimeout:    envDurationOr("SHUTDOWN_TIMEOUT", 10*time.Second),
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

// envIntOr parses an integer env var, falling back when unset or malformed.
func envIntOr(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
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
