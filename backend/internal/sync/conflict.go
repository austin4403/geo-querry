// conflict.go implements the conflict-resolution half of the sync engine.
//
// WHY DOES THIS FILE EXIST?
// GeoQuerry is offline-first: several devices capture data in the bush with
// NO coordination, then all push to the server when they reach camp. Two
// devices editing the same station will therefore arrive with competing
// versions and the server must decide — deterministically and instantly —
// which version wins.
//
// THE POLICY: LAST-WRITE-WINS (LWW)
// Every row carries a logical clock: `updated_at` in unix milliseconds,
// stamped by the device that last edited it. The rule is one comparison:
//
//	incoming.updated_at > stored.updated_at  ->  incoming overwrites stored
//
// This is deliberately simple — it needs no vector clocks, no CRDT math and
// no per-field merging — which suits field data capture, where two devices
// editing the SAME measurement within the same millisecond is a non-event.
// The known weakness (a device with a skewed fast clock always wins) is
// documented in service.go; the fix when needed is a hybrid logical clock.
package sync

import (
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

// NowMillis returns the server's current time as unix milliseconds.
//
// All timestamps crossing the sync boundary (proto int64 fields, BIGINT
// updated_at columns) use this unit — seconds are too coarse for LWW when
// two devices sync within the same second.
func NowMillis() int64 {
	return time.Now().UnixMilli()
}

// ResolveUpshot classifies the outcome of one LWW-guarded upsert.
//
// The store layer executes a single "INSERT ... ON CONFLICT DO UPDATE ...
// RETURNING" statement per entity and reports two booleans back:
//
//   - applied:   the statement wrote a row (either a fresh INSERT or an
//     update that beat the stored row's clock). When false the
//     ON CONFLICT WHERE clause rejected the write, meaning the
//     server already holds a NEWER version of this entity.
//   - wasInsert: true when this was a brand-new row (no prior version
//     existed on the server at all).
//
// ResolveUpshot turns those low-level facts into the protocol-level
// SyncStatus the mobile app acts on:
//
//	SYNC_STATUS_SYNCED             row accepted, nothing pre-existed
//	SYNC_STATUS_CONFLICT_OVERWROTE row accepted, but it replaced an older
//	                               server version (device "won" a conflict;
//	                               the client may want to tell the user their
//	                               edit overrode a teammate's)
//	SYNC_STATUS_CONFLICT_STALE     row rejected: the server has a newer
//	                               version; the device should pull and
//	                               discard its local copy
func ResolveUpshot(applied, wasInsert bool) v1.SyncStatus {
	switch {
	case !applied:
		return v1.SyncStatus_SYNC_STATUS_CONFLICT_STALE
	case wasInsert:
		return v1.SyncStatus_SYNC_STATUS_SYNCED
	default:
		return v1.SyncStatus_SYNC_STATUS_CONFLICT_OVERWROTE
	}
}

// classifyError maps a database error from one entity's upsert to the
// per-entity SyncStatus it should report, plus a human-readable message for
// the field geologist's sync log.
//
// Per-entity errors must NOT abort the whole push batch: one bad sample out
// of fifty should not strand the other forty-nine offline for another day.
// Only infrastructure failures (pool exhausted, Neon down) bubble up as a
// whole-request error.
func classifyError(err error) (v1.SyncStatus, string) {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		// Not a Postgres error at all — connection-level trouble. Treat as
		// rejection with a generic message; the client retries next sync.
		return v1.SyncStatus_SYNC_STATUS_REJECTED, "storage error: " + err.Error()
	}

	switch pgErr.Code {
	case "23505": // unique_violation
		// The natural-key guards (e.g. stations UNIQUE (project_id, code))
		// fire when two DIFFERENT ids claim the same business code. We
		// can't merge those automatically — flag for manual fix-up.
		return v1.SyncStatus_SYNC_STATUS_REJECTED,
			"a record with this code already exists under a different id (rename one of them)"
	case "23503": // foreign_key_violation
		// A child (measurement/sample/vegetation) referenced a station the
		// server has never seen — the parent was never pushed. The client
		// should re-push the station first; it will on the next round.
		return v1.SyncStatus_SYNC_STATUS_REJECTED,
			"parent record not found on server (push its parent first)"
	case "22P02": // invalid_text_representation (e.g. malformed UUID reaching SQL)
		return v1.SyncStatus_SYNC_STATUS_REJECTED, "malformed identifier"
	default:
		return v1.SyncStatus_SYNC_STATUS_REJECTED, "database error: " + pgErr.Message
	}
}
