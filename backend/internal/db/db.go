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
// (which is why files are named 000001_init.sql, 000002_xxx.sql, ...).
//
// Tracking lives in the schema_migrations table: each filename is recorded
// inside the SAME transaction that applies its SQL, so a migration either
// fully lands or fully rolls back — a half-applied file can never be marked
// as done. This is the minimal reliable migration runner; if the project
// later needs down-migrations or checksum verification, upgrade to
// golang-migrate or press+goose without changing call sites.
//
// NOTE: two instances booting concurrently (e.g. a rolling deploy) can both
// pass the "already applied?" check. The transaction does not prevent them
// from racing; if that ever becomes a real problem, take a Postgres advisory
// lock (pg_advisory_lock) at the top of this function.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	// The bookkeeping table is created outside the loop with IF NOT EXISTS:
	// on the very first boot it must exist before we can query it.
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT PRIMARY KEY,   -- migration filename, e.g. "000001_init.sql"
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("db: create schema_migrations: %w", err)
	}

	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("db: read migrations dir: %w", err)
	}
	// Lexical sort == numeric order as long as filenames zero-pad their
	// sequence number (000010 sorts after 000009 — "10" would not).
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		// The apply+record logic lives in its own function so that the
		// deferred tx.Rollback below is scoped to one iteration. A defer
		// inside the loop body itself would pile up one rollback per file
		// and only run them all when Migrate returns — harmless-ish here,
		// but a real leak pattern once migrations grow.
		if err := applyOne(ctx, pool, entry.Name()); err != nil {
			return err
		}
	}

	return nil
}

// applyOne applies a single migration file if it has not been applied yet.
// It is idempotent: already-recorded files are skipped without touching the
// database.
func applyOne(ctx context.Context, pool *pgxpool.Pool, name string) error {
	var applied bool
	if err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`,
		name,
	).Scan(&applied); err != nil {
		return fmt.Errorf("db: check %s: %w", name, err)
	}
	if applied {
		return nil // already landed in a previous boot — skip
	}

	sqlBytes, err := migrations.ReadFile("migrations/" + name)
	if err != nil {
		return fmt.Errorf("db: read %s: %w", name, err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("db: begin %s: %w", name, err)
	}
	// Rollback is deferred as a SAFETY NET only: after a successful Commit
	// it becomes a documented no-op (pgx returns ErrTxClosed, which we
	// ignore by not checking the return value here).
	defer func() { _ = tx.Rollback(ctx) }()

	// Multi-statement SQL executes fine through pgx's simple-protocol-ish
	// Exec path; no need to split on semicolons ourselves.
	if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
		return fmt.Errorf("db: apply %s: %w", name, err)
	}

	// Record the version INSIDE the same transaction as the DDL above.
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
