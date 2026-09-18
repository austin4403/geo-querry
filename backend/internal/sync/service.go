// Package sync implements the GeoquerrySyncService RPCs: the server half of
// the offline-first sync protocol.
//
// THE SYNC MODEL IN ONE PARAGRAPH
// Field devices capture data into local SQLite while offline. When
// connectivity appears they (1) PUSH every locally-changed entity via
// PushSyncQueue — the server upserts each one under Last-Write-Wins — then
// (2) PULL everything that changed anywhere else via PullProjectData,
// using the server timestamp from the previous pull as the delta cursor.
// The contract therefore needs exactly two unary RPCs; no changelog table,
// no per-device queues.
//
// CLOCK SKEW HONESTY (known limitation, deliberate v1 scope)
// LWW compares device-minted updated_at stamps, so a device with a fast
// clock beats its teammates even when its edit is older in the real world.
// For field geology data this is acceptable (rare same-entity concurrent
// edits). When it isn't, upgrade to a hybrid logical clock (HLC) — the
// store.go upsert shape stays identical, only the timestamp minting moves.
package sync

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

// pullOverlapMs is subtracted from the client's delta cursor before
// querying, intentionally RE-SENDING a ~2 minute window of rows.
//
// Why duplicate data on purpose? A row can be committed a few milliseconds
// AFTER the client's previous pull computed its server_timestamp while
// carrying an updated_at from BEFORE it (device stamps the value, the
// network delays the commit). A strictly-greater cursor would miss such
// rows forever. Re-sending is cheap (payload only) and idempotent (clients
// overwrite by id + equal updated_at), missing is silent data loss. For an
// exploration platform in the bush, the trade is obvious.
const pullOverlapMs = 2 * 60 * 1000

// Service implements the two DATA-sync RPCs of GeoquerrySyncService.
//
// It deliberately implements ONLY PushSyncQueue and PullProjectData (no
// embedding of the generated Unimplemented base): the streaming RPC lives
// in internal/telemetry, and main.go composes the two into the single
// handler type connect expects. Embedding Unimplemented here would make
// that composition ambiguous (both types would provide all three methods).
type Service struct {
	store *Store
}

// NewService wires the service to the shared pgx pool.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{store: NewStore(pool)}
}

// ---------------------------------------------------------------------------
// PushSyncQueue
// ---------------------------------------------------------------------------

// PushSyncQueue accepts a batch of offline edits and upserts each entity
// independently under Last-Write-Wins, reporting a per-entity verdict.
//
// Ordering inside the batch matters: stations FIRST (parents), then the
// station-scoped children (measurements/samples/vegetation), then
// boreholes. Parents before children keeps the foreign keys satisfiable
// within a single push — a first-time sync of a whole traverse just works.
func (s *Service) PushSyncQueue(
	ctx context.Context,
	req *connect.Request[v1.PushSyncQueueRequest],
) (*connect.Response[v1.PushSyncQueueResponse], error) {
	// req.Msg is a struct field on connect.Request (not a method in
	// connect-go v1.18+): the decoded, typed request payload.
	msg := req.Msg

	// The project id scopes the whole batch; a malformed one fails the
	// request outright (CodeInvalidArgument) rather than per-entity.
	projectID, err := requireUUID(msg.GetProjectId(), "project_id")
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	resp := &v1.PushSyncQueueResponse{
		// One server timestamp for the whole batch: the client stores it and
		// sends it as since_timestamp on its next pull.
		ServerTimestamp: NowMillis(),
	}

	// --- 1) Parents: stations -------------------------------------------
	for _, st := range msg.GetStations() {
		out := s.pushStation(ctx, projectID, st)
		resp.StationResults = append(resp.StationResults, out)
	}

	// --- 2) Children: measurements, samples, vegetation ------------------
	for _, m := range msg.GetMeasurements() {
		out := s.pushMeasurement(ctx, m)
		resp.MeasurementsResults = append(resp.MeasurementsResults, out)
	}
	for _, r := range msg.GetSamples() {
		out := s.pushSample(ctx, r)
		resp.SamplesResults = append(resp.SamplesResults, out)
	}
	for _, veg := range msg.GetVegetation() {
		out := s.pushVegetation(ctx, veg)
		resp.VegetationResults = append(resp.VegetationResults, out)
	}

	// --- 3) Boreholes (parent + interval log together) --------------------
	for _, b := range msg.GetBoreholes() {
		out := s.pushBorehole(ctx, projectID, b)
		resp.BoreholesResults = append(resp.BoreholesResults, out)
	}

	// success means "the batch was processed and nothing was REJECTED".
	// Stale conflicts are NOT failures — losing an LWW race is normal —
	// but rejections (bad ids, missing parents) deserve the client's
	// attention and a retry after a pull.
	resp.Success = true
	for _, group := range [][]*v1.EntitySyncResult{
		resp.GetStationResults(), resp.GetMeasurementsResults(),
		resp.GetSamplesResults(), resp.GetVegetationResults(),
		resp.GetBoreholesResults(),
	} {
		for _, r := range group {
			if r.GetStatus() == v1.SyncStatus_SYNC_STATUS_REJECTED {
				resp.Success = false
			}
		}
	}

	return connect.NewResponse(resp), nil
}

// pushStation validates and upserts one station.
func (s *Service) pushStation(ctx context.Context, projectID string, st *v1.Station) *v1.EntitySyncResult {
	if err := validateStation(projectID, st); err != nil {
		return entityResult(st.GetId(), v1.SyncStatus_SYNC_STATUS_REJECTED, err.Error())
	}
	out := s.store.UpsertStation(ctx, st)
	return entityResult(st.GetId(), out.status, out.msg)
}

// pushMeasurement validates and upserts one structural measurement.
func (s *Service) pushMeasurement(ctx context.Context, m *v1.StructuralMeasurement) *v1.EntitySyncResult {
	_, err := requireUUID(m.GetId(), "id")
	if err == nil {
		_, err = requireUUID(m.GetStationId(), "station_id")
	}
	if err == nil && m.GetMeasurementType() == "" {
		err = errors.New("measurement_type is required (e.g. bedding, foliation, fault)")
	}
	if err != nil {
		return entityResult(m.GetId(), v1.SyncStatus_SYNC_STATUS_REJECTED, err.Error())
	}
	out := s.store.UpsertMeasurement(ctx, m)
	return entityResult(m.GetId(), out.status, out.msg)
}

// pushSample validates and upserts one rock sample.
func (s *Service) pushSample(ctx context.Context, r *v1.RockSample) *v1.EntitySyncResult {
	_, err := requireUUID(r.GetId(), "id")
	if err == nil {
		_, err = requireUUID(r.GetStationId(), "station_id")
	}
	if err == nil && r.GetSampleTag() == "" {
		err = errors.New("sample_tag is required (e.g. SMP-2026-001)")
	}
	if err != nil {
		return entityResult(r.GetId(), v1.SyncStatus_SYNC_STATUS_REJECTED, err.Error())
	}
	out := s.store.UpsertSample(ctx, r)
	return entityResult(r.GetId(), out.status, out.msg)
}

// pushVegetation validates and upserts one vegetation record.
func (s *Service) pushVegetation(ctx context.Context, veg *v1.Vegetation) *v1.EntitySyncResult {
	_, err := requireUUID(veg.GetId(), "id")
	if err == nil {
		_, err = requireUUID(veg.GetStationId(), "station_id")
	}
	if err != nil {
		return entityResult(veg.GetId(), v1.SyncStatus_SYNC_STATUS_REJECTED, err.Error())
	}
	out := s.store.UpsertVegetation(ctx, veg)
	return entityResult(veg.GetId(), out.status, out.msg)
}

// pushBorehole validates and upserts one borehole with its interval log.
func (s *Service) pushBorehole(ctx context.Context, projectID string, b *v1.Borehole) *v1.EntitySyncResult {
	if err := validateBorehole(projectID, b); err != nil {
		return entityResult(b.GetId(), v1.SyncStatus_SYNC_STATUS_REJECTED, err.Error())
	}
	out := s.store.UpsertBorehole(ctx, b)
	return entityResult(b.GetId(), out.status, out.msg)
}

// ---------------------------------------------------------------------------
// PullProjectData
// ---------------------------------------------------------------------------

// PullProjectData returns every entity of a project changed since the
// client's last pull, as a full snapshot delta.
//
// The response carries BOTH flat lists and (for stations/boreholes) nested
// children, and both matter:
//   - FLAT lists are the delta-correct form: a child can be changed while
//     its parent is not, so nesting alone would silently drop it.
//   - NESTED copies exist per the proto contract ("populated on pull,
//     ignored on push") for clients doing a first-time full sync that want
//     ready-assembled stations.
//
// The duplication costs bytes only on deltas; clients pick whichever form
// they need and ignore the other.
func (s *Service) PullProjectData(
	ctx context.Context,
	req *connect.Request[v1.PullProjectDataRequest],
) (*connect.Response[v1.PullProjectDataResponse], error) {
	msg := req.Msg

	projectID, err := requireUUID(msg.GetProjectId(), "project_id")
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	// Watermark FIRST, queries after: every row committed from here on has
	// a chance of being newer than this timestamp... or not (see the
	// pullOverlapMs essay above). The overlap absorbs the ambiguity.
	serverTs := NowMillis()
	since := msg.GetSinceTimestamp() - pullOverlapMs
	if since < 0 {
		since = 0 // first-ever pull: 0 means "give me everything"
	}

	stations, err := s.store.PullStations(ctx, projectID, since)
	if err != nil {
		return nil, internal("load stations", err)
	}
	measurements, err := s.store.PullMeasurements(ctx, projectID, since)
	if err != nil {
		return nil, internal("load measurements", err)
	}
	samples, err := s.store.PullSamples(ctx, projectID, since)
	if err != nil {
		return nil, internal("load samples", err)
	}
	vegetation, err := s.store.PullVegetation(ctx, projectID, since)
	if err != nil {
		return nil, internal("load vegetation", err)
	}
	boreholes, err := s.store.PullBoreholes(ctx, projectID, since)
	if err != nil {
		return nil, internal("load boreholes", err)
	}
	concessions, err := s.store.PullConcessions(ctx, projectID, since)
	if err != nil {
		return nil, internal("load concessions", err)
	}

	// Build the nested station view: index stations by id, then attach each
	// changed child to its parent when that parent is part of this delta.
	byID := make(map[string]*v1.Station, len(stations))
	for _, st := range stations {
		byID[st.GetId()] = st
	}
	for _, m := range measurements {
		if st, ok := byID[m.GetStationId()]; ok {
			st.Measurements = append(st.Measurements, m)
		}
	}
	for _, r := range samples {
		if st, ok := byID[r.GetStationId()]; ok {
			st.Samples = append(st.Samples, r)
		}
	}
	for _, veg := range vegetation {
		if st, ok := byID[veg.GetStationId()]; ok {
			st.Vegetation = append(st.Vegetation, veg)
		}
	}
	// Borehole intervals were already nested by PullBoreholes itself.

	resp := &v1.PullProjectDataResponse{
		ServerTimestamp: serverTs,
		Stations:        stations,
		Measurements:    measurements,
		Samples:         samples,
		Boreholes:       boreholes,
		Vegetation:      vegetation,
		Concessions:     concessions,
	}
	return connect.NewResponse(resp), nil
}

// ---------------------------------------------------------------------------
// Validation helpers (app-level, before any SQL runs)
// ---------------------------------------------------------------------------

// requireUUID parses a protocol id field. Rejecting garbage here (instead of
// letting Postgres throw 22P02) yields precise, field-named error messages
// the mobile app can surface per entity.
func requireUUID(value, field string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("%s is required", field)
	}
	if _, err := uuid.Parse(value); err != nil {
		return "", fmt.Errorf("%s must be a UUID (got %q)", field, value)
	}
	return value, nil
}

// validateStation checks the invariants a station must hold before we let
// it near the spatial index.
func validateStation(batchProjectID string, st *v1.Station) error {
	if _, err := requireUUID(st.GetId(), "id"); err != nil {
		return err
	}
	// The batch declares its project; a station naming a DIFFERENT project
	// inside it is a client bug — writing it would corrupt project scoping.
	if st.GetProjectId() != batchProjectID {
		return fmt.Errorf("station project_id %q does not match batch project_id %q",
			st.GetProjectId(), batchProjectID)
	}
	if st.GetCode() == "" {
		return errors.New("station code is required (e.g. ST-04)")
	}
	return validateLatLng(st.GetLatitude(), st.GetLongitude())
}

// validateBorehole mirrors validateStation for boreholes and additionally
// sanity-checks the interval log (depths ordered, ids well-formed).
func validateBorehole(batchProjectID string, b *v1.Borehole) error {
	if _, err := requireUUID(b.GetId(), "id"); err != nil {
		return err
	}
	if b.GetProjectId() != batchProjectID {
		return fmt.Errorf("borehole project_id %q does not match batch project_id %q",
			b.GetProjectId(), batchProjectID)
	}
	if b.GetBoreholeCode() == "" {
		return errors.New("borehole_code is required (e.g. BH-08)")
	}
	if err := validateLatLng(b.GetLatitude(), b.GetLongitude()); err != nil {
		return err
	}
	for _, iv := range b.GetIntervals() {
		if _, err := requireUUID(iv.GetId(), "interval id"); err != nil {
			return err
		}
		if iv.GetDepthTo() < iv.GetDepthFrom() {
			return fmt.Errorf("interval %s: depth_to (%.1f) is above depth_from (%.1f)",
				iv.GetId(), iv.GetDepthTo(), iv.GetDepthFrom())
		}
	}
	return nil
}

// validateLatLng rejects NaN/Inf (JSON codecs can carry them; protobuf
// doubles can too) and out-of-range coordinates before they poison the
// PostGIS index — a single NaN point would break every spatial query.
func validateLatLng(lat, lon float64) error {
	if math.IsNaN(lat) || math.IsInf(lat, 0) || math.IsNaN(lon) || math.IsInf(lon, 0) {
		return errors.New("latitude/longitude must be a finite number")
	}
	if lat < -90 || lat > 90 {
		return fmt.Errorf("latitude %f is out of range [-90, 90]", lat)
	}
	if lon < -180 || lon > 180 {
		return fmt.Errorf("longitude %f is out of range [-180, 180]", lon)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Result / error plumbing
// ---------------------------------------------------------------------------

// entityResult builds the per-entity protocol verdict. An empty msg (the
// normal case for synced/stale) produces an empty error_message.
func entityResult(id string, status v1.SyncStatus, msg string) *v1.EntitySyncResult {
	res := &v1.EntitySyncResult{Id: id, Status: status}
	if msg != "" {
		res.ErrorMessage = msg
		// Server-side breadcrumb: field devices only see the short message,
		// ops sees the full context in the logs.
		log.Printf("sync: entity %s -> %s: %s", id, status, msg)
	}
	return res
}

// internal wraps an infrastructure failure as a connect Internal error —
// the whole pull failed, so there is nothing per-entity to report.
func internal(what string, err error) error {
	log.Printf("sync: pull: %s: %v", what, err)
	return connect.NewError(connect.CodeInternal,
		fmt.Errorf("could not %s; retry shortly", what))
}
