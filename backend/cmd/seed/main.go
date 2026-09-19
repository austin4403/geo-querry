// Command seed is a small development utility that creates starter rows in
// the GeoQuerry database so the sync API can be exercised end to end.
//
// WHY THIS EXISTS
// The v1 contract has no CreateProject RPC yet (it arrives with the web
// portal). Until then there is no API path to create the root `projects`
// row that every other entity references — and pushing a station without a
// project would fail the foreign key. This tool inserts the project (and
// optionally a demo concession) directly, the way the office portal
// eventually will.
//
// USAGE (from backend/):
//
//	go run ./cmd/seed                              # fixed demo UUID, name "Kitui Test"
//	go run ./cmd/seed -name "Rift Valley"          # fixed demo UUID, custom name
//	go run ./cmd/seed -id <uuid> -name "X"         # explicit id
//
// It is idempotent: re-running with the same id updates the name instead of
// failing, so it is safe to keep in a dev loop.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5"
)

// demoProjectID is a stable, arbitrary UUID so every test script in the
// repo can hard-code the same project and the seed stays reproducible.
const demoProjectID = "0b6f6c2e-1234-4abc-9def-000000000001"

func main() {
	id := flag.String("id", demoProjectID, "project UUID to upsert")
	name := flag.String("name", "Kitui Test", "project display name")
	flag.Parse()

	ctx := context.Background()

	// No hardcoded fallback DSN: a literal connection string with a
	// password in source is a scanner finding (gosec G101) AND a leak risk
	// if the default ever changes to something real. Require the env var.
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Fatal("seed: DATABASE_URL is not set (e.g. postgres://postgres:dev@localhost:5432/geoquerry?sslmode=disable for local docker)")
	}

	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		log.Fatalf("seed: connect: %v", err)
	}
	defer conn.Close(ctx)

	// Upsert so the tool is idempotent across re-runs.
	if _, err := conn.Exec(ctx, `
		INSERT INTO projects (id, name) VALUES ($1, $2)
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
	`, *id, *name); err != nil {
		log.Fatalf("seed: insert project: %v", err)
	}

	// Demo concession: gives PullProjectData something spatial to return
	// before any field data exists (handy for wiring the web portal map).
	if _, err := conn.Exec(ctx, `
		INSERT INTO concessions (
			id, project_id, code, name, license_type, geom,
			status, valid_until, updated_at
		) VALUES (
			'11111111-2222-4333-8444-555555555555', $1, 'ML-2026-01', 'Kitui South Block',
			'prospecting',
			ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[37.9,-1.2],[38.2,-1.2],[38.2,-1.5],[37.9,-1.5],[37.9,-1.2]]]]}'),
			'active', NOW() + INTERVAL '2 years',
			(extract(epoch from now()) * 1000)::BIGINT
		)
		ON CONFLICT (id) DO NOTHING
	`, *id); err != nil {
		log.Fatalf("seed: insert concession: %v", err)
	}

	fmt.Println("seeded project", *id, "-", *name)
}
