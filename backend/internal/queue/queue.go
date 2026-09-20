package queue

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
)

// PaymentReconciliationArgs defines payload for polling unverified M-Pesa / Stripe transactions.
type PaymentReconciliationArgs struct {
	PaymentAttemptID string `json:"payment_attempt_id"`
	Provider         string `json:"provider"`
}

func (PaymentReconciliationArgs) Kind() string { return "payment_reconciliation" }

// PaymentReconciliationWorker processes reconciliation tasks.
type PaymentReconciliationWorker struct {
	river.WorkerDefaults[PaymentReconciliationArgs]
	pool *pgxpool.Pool
}

func (w *PaymentReconciliationWorker) Work(ctx context.Context, job *river.Job[PaymentReconciliationArgs]) error {
	log.Printf("queue: processing reconciliation for attempt %s (provider %s)",
		job.Args.PaymentAttemptID, job.Args.Provider)
	// In Wave 2, connects to Safaricom Transaction Status API / Stripe SDK
	return nil
}

// GisIngestionArgs defines payload for quarantined spatial uploads.
type GisIngestionArgs struct {
	DatasetID      string `json:"dataset_id"`
	OrganizationID string `json:"organization_id"`
	ProjectID      string `json:"project_id"`
	QuarantineKey  string `json:"quarantine_key"`
}

func (GisIngestionArgs) Kind() string { return "gis_ingestion" }

// GisIngestionWorker handles sandboxed parsing of Shapefile/GeoTIFF/LAS files.
type GisIngestionWorker struct {
	river.WorkerDefaults[GisIngestionArgs]
	pool *pgxpool.Pool
}

func (w *GisIngestionWorker) Work(ctx context.Context, job *river.Job[GisIngestionArgs]) error {
	log.Printf("queue: processing GIS ingestion for dataset %s (tenant %s)",
		job.Args.DatasetID, job.Args.OrganizationID)
	// In Wave 2, extracts archive, verifies CRS, transforms to EPSG:4326 PostGIS
	return nil
}

// QueueEngine encapsulates the River client and workers lifecycle.
type QueueEngine struct {
	Client *river.Client[pgx.Tx]
	pool   *pgxpool.Pool
}

// NewQueueEngine initializes a River durable job queue client.
func NewQueueEngine(ctx context.Context, pool *pgxpool.Pool) (*river.Client[pgx.Tx], error) {
	if pool == nil {
		return nil, fmt.Errorf("queue: database pool is nil")
	}

	workers := river.NewWorkers()
	river.AddWorker(workers, &PaymentReconciliationWorker{pool: pool})
	river.AddWorker(workers, &GisIngestionWorker{pool: pool})

	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 10},
		},
		Workers: workers,
	})
	if err != nil {
		return nil, fmt.Errorf("queue: init river client: %w", err)
	}

	return client, nil
}
