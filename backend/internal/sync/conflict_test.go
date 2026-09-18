// conflict_test.go locks down the pure decision logic of the sync engine —
// no database required, so these run in milliseconds and are the first
// thing to execute in CI.
package sync

import (
	"errors"
	"math"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

// TestResolveUpshot pins the (applied, wasInsert) -> SyncStatus mapping.
// If this table changes, the mobile client's sync-state machine may need to
// change with it — treat failures here as contract breaks.
func TestResolveUpshot(t *testing.T) {
	cases := []struct {
		name      string
		applied   bool
		wasInsert bool
		want      v1.SyncStatus
	}{
		{"fresh insert", true, true, v1.SyncStatus_SYNC_STATUS_SYNCED},
		{"overwrite of older server data", true, false, v1.SyncStatus_SYNC_STATUS_CONFLICT_OVERWROTE},
		{"stale write rejected", false, false, v1.SyncStatus_SYNC_STATUS_CONFLICT_STALE},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ResolveUpshot(tc.applied, tc.wasInsert); got != tc.want {
				t.Fatalf("ResolveUpshot(%v, %v) = %v, want %v",
					tc.applied, tc.wasInsert, got, tc.want)
			}
		})
	}
}

// TestClassifyError verifies Postgres error codes map to statuses and
// messages a field geologist can actually act on.
func TestClassifyError(t *testing.T) {
	cases := []struct {
		name       string
		err        error
		wantStatus v1.SyncStatus
		wantSubstr string
	}{
		{
			name:       "duplicate natural key",
			err:        &pgconn.PgError{Code: "23505", Message: "duplicate key"},
			wantStatus: v1.SyncStatus_SYNC_STATUS_REJECTED,
			wantSubstr: "already exists",
		},
		{
			name:       "missing parent station",
			err:        &pgconn.PgError{Code: "23503", Message: "violates foreign key"},
			wantStatus: v1.SyncStatus_SYNC_STATUS_REJECTED,
			wantSubstr: "parent record",
		},
		{
			name:       "garbage uuid reached sql",
			err:        &pgconn.PgError{Code: "22P02", Message: "invalid input syntax"},
			wantStatus: v1.SyncStatus_SYNC_STATUS_REJECTED,
			wantSubstr: "malformed",
		},
		{
			name:       "connection level failure",
			err:        errors.New("conn closed"),
			wantStatus: v1.SyncStatus_SYNC_STATUS_REJECTED,
			wantSubstr: "storage error",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, msg := classifyError(tc.err)
			if status != tc.wantStatus {
				t.Fatalf("status = %v, want %v", status, tc.wantStatus)
			}
			if !strings.Contains(msg, tc.wantSubstr) {
				t.Fatalf("message %q does not contain %q", msg, tc.wantSubstr)
			}
		})
	}
}

// TestRequireUUID checks the id gate every pushed entity passes through.
func TestRequireUUID(t *testing.T) {
	if _, err := requireUUID("", "project_id"); err == nil {
		t.Error("empty id must be rejected")
	}
	if _, err := requireUUID("not-a-uuid", "project_id"); err == nil {
		t.Error("non-UUID id must be rejected")
	}
	if _, err := requireUUID("123e4567-e89b-12d3-a456-426614174000", "project_id"); err != nil {
		t.Errorf("valid UUID rejected: %v", err)
	}
}

// TestValidateLatLng guards the PostGIS index: one NaN point would poison
// every spatial query on the table.
func TestValidateLatLng(t *testing.T) {
	good := [][2]float64{{0, 0}, {-89.9, -179.9}, {90, 180}, {-1.482, 37.056}}
	for _, ll := range good {
		if err := validateLatLng(ll[0], ll[1]); err != nil {
			t.Errorf("validateLatLng(%v) failed: %v", ll, err)
		}
	}
	bad := [][2]float64{{90.1, 0}, {0, 180.5}, {math.NaN(), 0}, {0, math.Inf(1)}}
	for _, ll := range bad {
		if err := validateLatLng(ll[0], ll[1]); err == nil {
			t.Errorf("validateLatLng(%v) should have failed", ll)
		}
	}
}
