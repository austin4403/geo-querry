// store.go is the SQL layer of the sync engine.
//
// The service layer (service.go) owns request validation and orchestration;
// this file owns every database statement. Keeping them separate means the
// LWW upsert trick below is written ONCE per table instead of being copied
// into handler code, and future table changes touch exactly one place.
//
// THE UPSERT PATTERN (the heart of PushSyncQueue):
//
//	INSERT INTO t (...) VALUES (...)
//	ON CONFLICT (id) DO UPDATE SET ...
//	WHERE t.updated_at < EXCLUDED.updated_at   -- LWW guard
//	RETURNING (t.xmax = 0) AS was_insert
//
// Reading it line by line:
//   - ON CONFLICT (id): client ids are device-minted UUIDs, so "does this
//     row exist?" is a single primary-key probe inside Postgres — no
//     SELECT-then-INSERT race, no extra round trip.
//   - WHERE t.updated_at < EXCLUDED.updated_at: the LWW guard from
//     conflict.go. If the stored row is NEWER OR EQUAL, the update is
//     silently skipped. Equal keeps the server copy — a fixed tie-break so
//     two devices can't ping-pong the same row forever.
//   - RETURNING (xmax = 0): Postgres reports xmax=0 for rows freshly
//     inserted by the current transaction, and a non-zero xid for rows it
//     updated. That one bit tells us whether the accepted write created a
//     new row (SYNCED) or replaced an older one (CONFLICT_OVERWROTE) without
//     a second query. (Edge case: aggressive vacuum freezing can reset xmax
//     to 0 on old rows; worst case we mislabel an overwrite as a fresh
//     insert — cosmetic, data is still correct.)
//   - No row returned at all: the LWW guard rejected the write — the server
//     already holds a newer version (CONFLICT_STALE).
package sync

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

// Store wraps the pgx pool with the sync engine's queries.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore builds a Store. The pool is shared with every other service —
// one pool per process, sized once in config.
func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// upshot is the verdict of one entity's upsert: the protocol status plus an
// optional message explaining non-SYNCED outcomes to the field user.
type upshot struct {
	status v1.SyncStatus
	msg    string
}

// ---------------------------------------------------------------------------
// PUSH: LWW upserts, one entity per statement
// ---------------------------------------------------------------------------

// UpsertStation writes one station, LWW-guarded.
// Lat/lon/elevation are folded into the PostGIS PointZ geometry at write
// time so every future spatial query (proximity, containment, map bbox)
// works without any backfill.
func (s *Store) UpsertStation(ctx context.Context, st *v1.Station) upshot {
	const q = `
		INSERT INTO stations (
			id, project_id, code, name, geom,
			gps_accuracy, outcrop_exposure, lithology, notes,
			updated_at, is_deleted
		) VALUES (
			$1::uuid, $2::uuid, $3, $4, ST_SetSRID(ST_MakePoint($5, $6, $7), 4326),
			$8, $9, $10, $11,
			$12, $13
		)
		ON CONFLICT (id) DO UPDATE SET
			project_id       = EXCLUDED.project_id,
			code             = EXCLUDED.code,
			name             = EXCLUDED.name,
			geom             = EXCLUDED.geom,
			gps_accuracy     = EXCLUDED.gps_accuracy,
			outcrop_exposure = EXCLUDED.outcrop_exposure,
			lithology        = EXCLUDED.lithology,
			notes            = EXCLUDED.notes,
			updated_at       = EXCLUDED.updated_at,
			is_deleted       = EXCLUDED.is_deleted
		WHERE stations.updated_at < EXCLUDED.updated_at
		RETURNING (stations.xmax = 0) AS was_insert
	`
	// ST_MakePoint(x, y, z): x=longitude, y=latitude, z=elevation in meters.
	applied, wasInsert, err := s.execLWW(ctx, q,
		st.GetId(), st.GetProjectId(), st.GetCode(), st.GetName(),
		st.GetLongitude(), st.GetLatitude(), st.GetElevation(),
		st.GetGpsAccuracy(), st.GetOutcropExposure(), st.GetLithology(), st.GetNotes(),
		st.GetUpdatedAt(), st.GetIsDeleted(),
	)
	return finishUpshot(applied, wasInsert, err)
}

// UpsertMeasurement writes one structural measurement (strike/dip/etc.),
// LWW-guarded. The FK to stations is enforced by Postgres; if the parent
// station was never pushed we get a 23503 error, which classifyError turns
// into a REJECTED result the client can act on (push the station first).
func (s *Store) UpsertMeasurement(ctx context.Context, m *v1.StructuralMeasurement) upshot {
	const q = `
		INSERT INTO structural_measurements (
			id, station_id, measurement_type, strike, dip,
			dip_direction, auto_captured, trend, plunge, notes,
			updated_at, is_deleted
		) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT (id) DO UPDATE SET
			station_id       = EXCLUDED.station_id,
			measurement_type = EXCLUDED.measurement_type,
			strike           = EXCLUDED.strike,
			dip              = EXCLUDED.dip,
			dip_direction    = EXCLUDED.dip_direction,
			auto_captured    = EXCLUDED.auto_captured,
			trend            = EXCLUDED.trend,
			plunge           = EXCLUDED.plunge,
			notes            = EXCLUDED.notes,
			updated_at       = EXCLUDED.updated_at,
			is_deleted       = EXCLUDED.is_deleted
		WHERE structural_measurements.updated_at < EXCLUDED.updated_at
		RETURNING (structural_measurements.xmax = 0) AS was_insert
	`
	applied, wasInsert, err := s.execLWW(ctx, q,
		m.GetId(), m.GetStationId(), m.GetMeasurementType(), m.GetStrike(), m.GetDip(),
		m.GetDipDirection(), m.GetAutocaptured(), m.GetTrend(), m.GetPlunge(), m.GetNotes(),
		m.GetUpdatedAt(), m.GetIsDeleted(),
	)
	return finishUpshot(applied, wasInsert, err)
}

// UpsertSample writes one rock sample, LWW-guarded. photo_r2_keys travels
// as a Postgres text[] array; pgx encodes []string directly.
func (s *Store) UpsertSample(ctx context.Context, r *v1.RockSample) upshot {
	const q = `
		INSERT INTO rock_samples (
			id, station_id, sample_tag, lithology_class, mineralization_notes,
			photo_r2_keys, assays_status, updated_at, is_deleted
		) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (id) DO UPDATE SET
			station_id           = EXCLUDED.station_id,
			sample_tag           = EXCLUDED.sample_tag,
			lithology_class      = EXCLUDED.lithology_class,
			mineralization_notes = EXCLUDED.mineralization_notes,
			photo_r2_keys        = EXCLUDED.photo_r2_keys,
			assays_status        = EXCLUDED.assays_status,
			updated_at           = EXCLUDED.updated_at,
			is_deleted           = EXCLUDED.is_deleted
		WHERE rock_samples.updated_at < EXCLUDED.updated_at
		RETURNING (rock_samples.xmax = 0) AS was_insert
	`
	applied, wasInsert, err := s.execLWW(ctx, q,
		r.GetId(), r.GetStationId(), r.GetSampleTag(), r.GetLithologyClass(),
		r.GetMineralizationNotes(), strSliceOrEmpty(r.GetPhotoR2Keys()), r.GetAssaysStatus(),
		r.GetUpdatedAt(), r.GetIsDeleted(),
	)
	return finishUpshot(applied, wasInsert, err)
}

// UpsertVegetation writes one vegetation observation, LWW-guarded.
func (s *Store) UpsertVegetation(ctx context.Context, veg *v1.Vegetation) upshot {
	const q = `
		INSERT INTO vegetation (
			id, station_id, description, photo_r2_keys, updated_at, is_deleted
		) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6)
		ON CONFLICT (id) DO UPDATE SET
			station_id    = EXCLUDED.station_id,
			description   = EXCLUDED.description,
			photo_r2_keys = EXCLUDED.photo_r2_keys,
			updated_at    = EXCLUDED.updated_at,
			is_deleted    = EXCLUDED.is_deleted
		WHERE vegetation.updated_at < EXCLUDED.updated_at
		RETURNING (vegetation.xmax = 0) AS was_insert
	`
	applied, wasInsert, err := s.execLWW(ctx, q,
		veg.GetId(), veg.GetStationId(), veg.GetDescription(),
		strSliceOrEmpty(veg.GetPhotoR2Keys()),
		veg.GetUpdatedAt(), veg.GetIsDeleted(),
	)
	return finishUpshot(applied, wasInsert, err)
}

// UpsertBorehole writes one borehole AND wholesale-replaces its lithology
// intervals in a single transaction.
//
// Intervals have no independent lifecycle on the wire — the mobile app edits
// them as part of the borehole — so "delete all intervals, insert the fresh
// set" is both simpler and exactly matches what the user edited. One
// transaction guarantees the borehole never appears with half its log.
func (s *Store) UpsertBorehole(ctx context.Context, b *v1.Borehole) upshot {
	const q = `
		INSERT INTO boreholes (
			id, project_id, borehole_code, name, geom,
			total_depth_meters, water_strike_depth, yield_liters_per_hour,
			updated_at, is_deleted
		) VALUES (
			$1::uuid, $2::uuid, $3, $4, ST_SetSRID(ST_MakePoint($5, $6, $7), 4326),
			$8, $9, $10, $11, $12
		)
		ON CONFLICT (id) DO UPDATE SET
			project_id            = EXCLUDED.project_id,
			borehole_code         = EXCLUDED.borehole_code,
			name                  = EXCLUDED.name,
			geom                  = EXCLUDED.geom,
			total_depth_meters    = EXCLUDED.total_depth_meters,
			water_strike_depth    = EXCLUDED.water_strike_depth,
			yield_liters_per_hour = EXCLUDED.yield_liters_per_hour,
			updated_at            = EXCLUDED.updated_at,
			is_deleted            = EXCLUDED.is_deleted
		WHERE boreholes.updated_at < EXCLUDED.updated_at
		RETURNING (boreholes.xmax = 0) AS was_insert
	`

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return finishUpshot(false, false, err)
	}
	// No-op after commit; same safety-net pattern as db.Migrate.
	defer func() { _ = tx.Rollback(ctx) }()

	var wasInsert bool
	err = tx.QueryRow(ctx, q,
		b.GetId(), b.GetProjectId(), b.GetBoreholeCode(), b.GetName(),
		b.GetLongitude(), b.GetLatitude(), b.GetCollarElevation(),
		b.GetTotalDepthMeters(), b.GetWaterStrikeDepth(), b.GetYieldLitersPerHour(),
		b.GetUpdatedAt(), b.GetIsDeleted(),
	).Scan(&wasInsert)

	switch {
	case errors.Is(err, pgx.ErrNoRows):
		// LWW guard rejected the borehole: server copy is newer. Roll back
		// (nothing written) and report stale — intervals untouched on purpose.
		return upshot{status: v1.SyncStatus_SYNC_STATUS_CONFLICT_STALE}
	case err != nil:
		return finishUpshot(false, false, err)
	}

	// Borehole accepted -> replace its interval set. Deleting even when the
	// incoming list is EMPTY is intentional: it means the user cleared the log.
	if _, err := tx.Exec(ctx,
		`DELETE FROM borehole_intervals WHERE borehole_id = $1::uuid`, b.GetId(),
	); err != nil {
		return finishUpshot(false, false, err)
	}

	// pgx.Batch pipelines every interval INSERT into one network round trip —
	// a 200-interval hole is one write, not two hundred.
	if n := len(b.GetIntervals()); n > 0 {
		batch := &pgx.Batch{}
		for _, iv := range b.GetIntervals() {
			batch.Queue(
				`INSERT INTO borehole_intervals
					(id, borehole_id, depth_from, depth_to, lithology, description, recovery_percentage)
				 VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7)`,
				iv.GetId(), b.GetId(), iv.GetDepthFrom(), iv.GetDepthTo(),
				iv.GetLithology(), iv.GetDescription(), iv.GetRecoveryPercentage(),
			)
		}
		if err := tx.SendBatch(ctx, batch).Close(); err != nil {
			return finishUpshot(false, false, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return finishUpshot(false, false, err)
	}
	return upshot{status: ResolveUpshot(true, wasInsert)}
}

// execLWW runs one LWW upsert and interprets the RETURNING outcome into a
// triple the caller can branch on without re-deriving anything:
//
//	applied   - a row was written at all (insert or victorious update)
//	wasInsert - the row is brand new (vs. overwriting older server data)
//	err       - infrastructure/SQL failure, nil for both stale and success
//
// "Stale" (the LWW guard rejected the write) is (false, false, nil) — NOT an
// error. It is a normal, healthy outcome of two devices editing the same
// entity: one of them simply loses.
func (s *Store) execLWW(ctx context.Context, sql string, args ...any) (applied, wasInsert bool, err error) {
	err = s.pool.QueryRow(ctx, sql, args...).Scan(&wasInsert)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, false, nil // stale: server copy is newer
	}
	if err != nil {
		return false, false, err
	}
	return true, wasInsert, nil
}

// finishUpshot converts a raw upsert result into the per-entity verdict.
func finishUpshot(applied, wasInsert bool, err error) upshot {
	if err != nil {
		status, msg := classifyError(err)
		return upshot{status: status, msg: msg}
	}
	return upshot{status: ResolveUpshot(applied, wasInsert)}
}

// ---------------------------------------------------------------------------
// PULL: delta selects ("everything of project X changed at or since T")
// ---------------------------------------------------------------------------

// PullStations returns stations of one project changed at/after sinceMs.
// ST_X/ST_Y/ST_Z unpack the geometry back into the proto's flat doubles;
// ordering by updated_at gives clients a stable, replay-friendly stream.
func (s *Store) PullStations(ctx context.Context, projectID string, sinceMs int64) ([]*v1.Station, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, code, name,
		       ST_Y(geom), ST_X(geom), ST_Z(geom),
		       gps_accuracy, outcrop_exposure, lithology, notes,
		       updated_at, is_deleted
		FROM stations
		WHERE project_id = $1::uuid AND updated_at >= $2
		ORDER BY updated_at
	`, projectID, sinceMs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*v1.Station
	for rows.Next() {
		st := &v1.Station{}
		// Nullable columns scan into pointers so NULL arrives as the proto
		// zero value ("" / 0.0) instead of a scan error.
		var name, exposure, lithology, notes *string
		var accuracy *float64
		if err := rows.Scan(
			&st.Id, &st.ProjectId, &st.Code, &name,
			&st.Latitude, &st.Longitude, &st.Elevation,
			&accuracy, &exposure, &lithology, &notes,
			&st.UpdatedAt, &st.IsDeleted,
		); err != nil {
			return nil, err
		}
		deref(&st.Name, name)
		deref(&st.GpsAccuracy, accuracy)
		deref(&st.OutcropExposure, exposure)
		deref(&st.Lithology, lithology)
		deref(&st.Notes, notes)
		out = append(out, st)
	}
	return out, rows.Err()
}

// PullMeasurements returns structural measurements whose station belongs to
// the project, changed at/after sinceMs.
func (s *Store) PullMeasurements(ctx context.Context, projectID string, sinceMs int64) ([]*v1.StructuralMeasurement, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT m.id, m.station_id, m.measurement_type, m.strike, m.dip,
		       m.dip_direction, m.auto_captured, m.trend, m.plunge, m.notes,
		       m.updated_at, m.is_deleted
		FROM structural_measurements m
		JOIN stations s ON s.id = m.station_id
		WHERE s.project_id = $1::uuid AND m.updated_at >= $2
		ORDER BY m.updated_at
	`, projectID, sinceMs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*v1.StructuralMeasurement
	for rows.Next() {
		m := &v1.StructuralMeasurement{}
		var dipDir, trend, plunge *float64
		var notes *string
		if err := rows.Scan(
			&m.Id, &m.StationId, &m.MeasurementType, &m.Strike, &m.Dip,
			&dipDir, &m.Autocaptured, &trend, &plunge, &notes,
			&m.UpdatedAt, &m.IsDeleted,
		); err != nil {
			return nil, err
		}
		deref(&m.DipDirection, dipDir)
		deref(&m.Trend, trend)
		deref(&m.Plunge, plunge)
		deref(&m.Notes, notes)
		out = append(out, m)
	}
	return out, rows.Err()
}

// PullSamples returns rock samples of the project changed at/after sinceMs.
func (s *Store) PullSamples(ctx context.Context, projectID string, sinceMs int64) ([]*v1.RockSample, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r.station_id, r.sample_tag, r.lithology_class,
		       r.mineralization_notes, r.photo_r2_keys, r.assays_status,
		       r.updated_at, r.is_deleted
		FROM rock_samples r
		JOIN stations s ON s.id = r.station_id
		WHERE s.project_id = $1::uuid AND r.updated_at >= $2
		ORDER BY r.updated_at
	`, projectID, sinceMs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*v1.RockSample
	for rows.Next() {
		r := &v1.RockSample{}
		var lithClass, minNotes *string
		if err := rows.Scan(
			&r.Id, &r.StationId, &r.SampleTag, &lithClass,
			&minNotes, &r.PhotoR2Keys, &r.AssaysStatus,
			&r.UpdatedAt, &r.IsDeleted,
		); err != nil {
			return nil, err
		}
		deref(&r.LithologyClass, lithClass)
		deref(&r.MineralizationNotes, minNotes)
		out = append(out, r)
	}
	return out, rows.Err()
}

// PullVegetation returns vegetation records of the project changed at/after
// sinceMs.
func (s *Store) PullVegetation(ctx context.Context, projectID string, sinceMs int64) ([]*v1.Vegetation, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT v.id, v.station_id, v.description, v.photo_r2_keys,
		       v.updated_at, v.is_deleted
		FROM vegetation v
		JOIN stations s ON s.id = v.station_id
		WHERE s.project_id = $1::uuid AND v.updated_at >= $2
		ORDER BY v.updated_at
	`, projectID, sinceMs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*v1.Vegetation
	for rows.Next() {
		v := &v1.Vegetation{}
		var desc *string
		if err := rows.Scan(
			&v.Id, &v.StationId, &desc, &v.PhotoR2Keys,
			&v.UpdatedAt, &v.IsDeleted,
		); err != nil {
			return nil, err
		}
		deref(&v.Description, desc)
		out = append(out, v)
	}
	return out, rows.Err()
}

// PullBoreholes returns boreholes of the project changed at/after sinceMs,
// each with its full current set of lithology intervals nested inside.
func (s *Store) PullBoreholes(ctx context.Context, projectID string, sinceMs int64) ([]*v1.Borehole, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT b.id, b.project_id, b.borehole_code, b.name,
		       ST_Y(b.geom), ST_X(b.geom), ST_Z(b.geom),
		       b.total_depth_meters, b.water_strike_depth, b.yield_liters_per_hour,
		       b.updated_at, b.is_deleted
		FROM boreholes b
		WHERE b.project_id = $1::uuid AND b.updated_at >= $2
		ORDER BY b.updated_at
	`, projectID, sinceMs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*v1.Borehole
	for rows.Next() {
		b := &v1.Borehole{}
		var name *string
		var depth, waterStrike, yieldLph *float64
		if err := rows.Scan(
			&b.Id, &b.ProjectId, &b.BoreholeCode, &name,
			&b.Latitude, &b.Longitude, &b.CollarElevation,
			&depth, &waterStrike, &yieldLph,
			&b.UpdatedAt, &b.IsDeleted,
		); err != nil {
			return nil, err
		}
		deref(&b.Name, name)
		deref(&b.TotalDepthMeters, depth)
		deref(&b.WaterStrikeDepth, waterStrike)
		deref(&b.YieldLitersPerHour, yieldLph)
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil // nothing changed -> skip the interval query entirely
	}

	// Second query: intervals belonging to exactly the changed boreholes.
	// Shaped as a JOIN (not "= ANY($1)" with an id array) deliberately: an
	// array parameter would arrive typed text[] and Postgres has no
	// uuid = text operator. The join sidesteps the typing question entirely
	// and reads "intervals of boreholes this project changed since T".
	ivRows, err := s.pool.Query(ctx, `
		SELECT i.id, i.borehole_id, i.depth_from, i.depth_to,
		       i.lithology, i.description, i.recovery_percentage
		FROM borehole_intervals i
		JOIN boreholes b ON b.id = i.borehole_id
		WHERE b.project_id = $1::uuid AND b.updated_at >= $2
		ORDER BY i.depth_from
	`, projectID, sinceMs)
	if err != nil {
		return nil, err
	}
	defer ivRows.Close()

	// Map borehole_id -> slice index so each interval attaches with one
	// map lookup instead of an O(n²) linear scan.
	byIndex := make(map[string]int, len(out))
	for i, b := range out {
		byIndex[b.GetId()] = i
	}
	for ivRows.Next() {
		iv := &v1.BoreholeInterval{}
		var lith, desc *string
		var recovery *float64
		var bhID string
		if err := ivRows.Scan(&iv.Id, &bhID, &iv.DepthFrom, &iv.DepthTo, &lith, &desc, &recovery); err != nil {
			return nil, err
		}
		deref(&iv.Lithology, lith)
		deref(&iv.Description, desc)
		deref(&iv.RecoveryPercentage, recovery)
		if i, ok := byIndex[bhID]; ok {
			out[i].Intervals = append(out[i].Intervals, iv)
		}
	}
	return out, ivRows.Err()
}

// PullConcessions returns concession polygons of the project changed at/after
// sinceMs. Geometry serialises to GeoJSON text for the web portal's MapLibre
// layer; valid_until converts from TIMESTAMPTZ to unix ms for the proto.
func (s *Store) PullConcessions(ctx context.Context, projectID string, sinceMs int64) ([]*v1.ConcessionPolygon, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, code, name, license_type,
		       COALESCE(ST_AsGeoJSON(geom), ''),
		       status,
		       COALESCE((EXTRACT(EPOCH FROM valid_until) * 1000)::BIGINT, 0),
		       updated_at
		FROM concessions
		WHERE project_id = $1::uuid AND updated_at >= $2
		ORDER BY updated_at
	`, projectID, sinceMs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*v1.ConcessionPolygon
	for rows.Next() {
		c := &v1.ConcessionPolygon{}
		if err := rows.Scan(
			&c.Id, &c.ProjectId, &c.Code, &c.Name, &c.LicenseType,
			&c.GeojsonGeometry, &c.Status, &c.ValidUntil, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Small helpers shared by push and pull paths
// ---------------------------------------------------------------------------

// strSliceOrEmpty normalises a nil []string (proto unset) to an empty slice
// so text[] columns receive '{}' instead of NULL.
func strSliceOrEmpty(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}

// deref copies a scanned nullable value into its proto field — the bridge
// between "nullable SQL column" and "proto3 has no nulls".
func deref[T any](dst *T, src *T) {
	if src != nil {
		*dst = *src
	}
}
