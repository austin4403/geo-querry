package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WithTenantTx executes a database transaction with Row Level Security (RLS)
// scoped strictly to the provided organization ID using SET LOCAL.
//
// SET LOCAL guarantees that the configuration setting 'app.current_organization_id'
// exists only for the lifetime of this transaction, preventing pooled connection
// leakage in Neon/PgBouncer connection pooling architectures.
func WithTenantTx(ctx context.Context, pool *pgxpool.Pool, orgID string, fn func(tx pgx.Tx) error) error {
	if pool == nil {
		return fmt.Errorf("db: connection pool is nil")
	}
	if orgID == "" {
		return fmt.Errorf("db: organization id is required for tenant transaction")
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("db: begin tenant tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Set tenant context for RLS policies
	if _, err := tx.Exec(ctx, "SET LOCAL app.current_organization_id = $1", orgID); err != nil {
		return fmt.Errorf("db: set tenant context: %w", err)
	}

	if err := fn(tx); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("db: commit tenant tx: %w", err)
	}

	return nil
}
