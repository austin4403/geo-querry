// Package db owns the connection pool to the Neon PostGIS database and
// applies the SQL migrations found in ./migrations at startup.
//
// WHY A DEDICATED PACKAGE?
// Every service (sync, telemetry, future billing) shares ONE pool; giving
// that lifecycle a single owner guarantees we never open two pools by
// accident (a classic RAM-killer on a 512 MB Koyeb Nano) and never forget
// to run migrations before the first request arrives.
package db

import (
	"context"
	"embed"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"gitlab.com/austin4403/geoquerry/backend/internal/config"
)

// migrationLockID is an application-specific PostgreSQL advisory-lock key.
//
// PostgreSQL advisory locks are identified by a signed 64-bit integer. The
// exact value is not important; it only needs to remain stable and avoid
// colliding with other advisory locks used by this application.
//
// This lock serializes schema migrations when multiple application instances
// start concurrently during a rolling deployment or scale-from-zero event.
const migrationLockID int64 = 0x47454F5155455259 // ASCII-ish: "GEOQUERY"

// migrations embeds every ./migrations/*.sql file INTO the compiled binary.
//
// This is deliberate: the Docker image is a bare ~15 MB scratch container
// with no shell, no package manager and no extra files. Embedding means the
// binary can bootstrap an empty database all by itself — no migration
// sidecar container, no "did you copy the SQL into the image?" class of bug.
//
//go:embed migrations/*.sql
var migrations embed.FS

// Connect builds and verifies a pgx connection pool from cfg.DatabaseURL.
//
// Pool sizing notes (tuned for the free tiers this project runs on):
//   - MaxConns=4: Neon free tier allows few connections and Koyeb Nano has
//     512 MB RAM; each Postgres connection costs server-side memory too.
//   - MaxConnLifetime + Jitter: Neon's serverless compute occasionally
//     reaps idle connections; rotating them proactively avoids the dreaded
//     "server closed the connection unexpectedly" errors.
//   - HealthCheckPeriod: pgx pings idles in the background so a dead
//     connection is discovered BEFORE a request borrows it.
func Connect(ctx context.Context, cfg config.Config) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("db: parse DATABASE_URL: %w", err)
	}

	poolCfg.MaxConns = cfg.DBMaxConns
	poolCfg.MinConns = cfg.DBMinConns
	poolCfg.MaxConnLifetime = 30 * time.Minute
	// Jitter spreads reconnects over a minute so all 4 connections don't
	// die (and reconnect) at the exact same moment under load.
	poolCfg.MaxConnLifetimeJitter = time.Minute
	poolCfg.MaxConnIdleTime = 5 * time.Minute
	poolCfg.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("db: create pool: %w", err)
	}

	// Fail fast: a config typo or a Neon outage should abort boot with a
	// clear message, not surface as 500s on the first sync request.
	pingCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db: ping database: %w", err)
	}

	return pool, nil
}

// Migrate applies every not-yet-applied migration in lexical filename order
// (which is why files are named 000001_xxx.sql, 000002_xxx.sql, ...).
//
// CONCURRENT STARTUP SAFETY:
// Rolling deployments and scale-to-zero compute can start several instances
// concurrently. Without coordination, multiple instances could both observe
// that a migration is missing and attempt to apply it.
//
// We prevent that race with a PostgreSQL session-level advisory lock.
// The lock and unlock MUST run through the same physical database connection.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	lockConn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("db: acquire migration lock connection: %w", err)
	}
	defer lockConn.Release()

	// pg_advisory_lock waits until any other migrating instance releases the lock.
	if _, err := lockConn.Exec(ctx, `SELECT pg_advisory_lock($1)`, migrationLockID); err != nil {
		return fmt.Errorf("db: acquire migration advisory lock: %w", err)
	}

	defer func() {
		unlockCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, unlockErr := lockConn.Exec(unlockCtx, `SELECT pg_advisory_unlock($1)`, migrationLockID); unlockErr != nil {
			log.Printf("db: release migration advisory lock: %v", unlockErr)
		}
	}()

	// The bookkeeping table is created after acquiring the lock.
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("db: create schema_migrations: %w", err)
	}

	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("db: read migrations dir: %w", err)
	}

	// Lexical sort == numeric order as long as filenames zero-pad their sequence number.
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") || strings.HasSuffix(entry.Name(), ".down.sql") {
			continue
		}
		if err := applyOne(ctx, pool, entry.Name()); err != nil {
			return err
		}
	}

	return nil
}

// applyOne applies a single migration file if it has not been applied yet.
func applyOne(ctx context.Context, pool *pgxpool.Pool, name string) error {
	var applied bool
	if err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`,
		name,
	).Scan(&applied); err != nil {
		return fmt.Errorf("db: check %s: %w", name, err)
	}
	if applied {
		return nil
	}

	sqlBytes, err := migrations.ReadFile("migrations/" + name)
	if err != nil {
		return fmt.Errorf("db: read %s: %w", name, err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("db: begin %s: %w", name, err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
		return fmt.Errorf("db: apply %s: %w", name, err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO schema_migrations (version) VALUES ($1)`,
		name,
	); err != nil {
		return fmt.Errorf("db: record %s: %w", name, err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("db: commit %s: %w", name, err)
	}

	log.Printf("db: applied migration %s", name)
	return nil
}
