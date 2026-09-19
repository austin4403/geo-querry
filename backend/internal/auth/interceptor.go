// Package auth provides the v1 API-key gate for the Connect RPC surface.
//
// THREAT MODEL
// The backend is intended to be publicly reachable (Koyeb) so field devices
// and the web portal can reach it from anywhere. Without ANY gate, anyone
// who discovers the URL can push fake geological data, pull a whole
// project's spatial database, or connect to live team telemetry — including
// field geologists' real-time locations, which in some regions is a
// personal-safety issue. A shared API key is the deliberate v1 compromise:
// simple for offline-first clients (one static header, no token refresh
// dance over 2G), far better than nothing, and explicitly NOT the end
// state. Per-user auth with project-scoped permissions is tracked as a
// security milestone in SECURITY.md.
//
// The gate is DISABLED when GEOQUERRY_API_KEYS is unset (local dev) and
// CANNOT be left disabled by accident in production if the env var is set
// at deploy time.
package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"net/http"

	"connectrpc.com/connect"
)

// APIKeyHeader is the HTTP header clients present the key in. It is listed
// in the CORS allow-headers of cmd/server/main.go — if you rename it here,
// rename it there too or browser clients will fail preflight.
const APIKeyHeader = "X-Geoquerry-Api-Key"

// interceptor rejects any RPC whose caller cannot present a valid key.
type interceptor struct {
	// keys are stored PRE-HASHED so comparisons are constant-time over a
	// fixed-length digest — see verify for why that matters.
	hashedKeys [][sha256.Size]byte
}

// NewAPIKeyInterceptor builds a connect interceptor from the raw key list
// (typically from the GEOQUERRY_API_KEYS env var). An empty list returns
// nil: callers treat nil as "gate disabled", keeping dev friction at zero.
func NewAPIKeyInterceptor(keys []string) connect.Interceptor {
	if len(keys) == 0 {
		return nil
	}
	ic := &interceptor{}
	for _, k := range keys {
		// Hash at construction so the raw keys never sit in a second copy
		// on the heap, and so verify() compares equal-length buffers.
		h := sha256.Sum256([]byte(k))
		ic.hashedKeys = append(ic.hashedKeys, h)
	}
	return ic
}

// WrapUnary guards every unary RPC (PushSyncQueue, PullProjectData).
func (i *interceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if err := i.verify(req.Header()); err != nil {
			return nil, err
		}
		return next(ctx, req)
	}
}

// WrapStreamingHandler guards every streaming HANDLER (the server side of
// StreamLiveTelemetry) — this is the one that leaks geologist locations,
// so it must be gated exactly like the data RPCs.
func (i *interceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, stream connect.StreamingHandlerConn) error {
		// RequestHeader carries the client's HTTP headers (unary's
		// req.Header() equivalent on the streaming side).
		if err := i.verify(stream.RequestHeader()); err != nil {
			return err
		}
		return next(ctx, stream)
	}
}

// WrapStreamingClient is a no-op: this interceptor only ever runs server
// side. (connect requires the method to exist on the interface.)
func (i *interceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

// verify checks the key against every configured key.
func (i *interceptor) verify(header http.Header) error {
	presented := header.Get(APIKeyHeader)
	if presented == "" {
		return connect.NewError(connect.CodeUnauthenticated,
			errors.New("missing "+APIKeyHeader+" header"))
	}

	// Constant-time comparison, properly done:
	// subtle.ConstantTimeCompare is only constant-time for EQUAL-LENGTH
	// inputs, so an attacker could time-responses to learn the key's
	// LENGTH against each configured key. Hashing both sides first makes
	// every comparison exactly sha256.Size bytes — timing leaks nothing.
	h := sha256.Sum256([]byte(presented))
	for _, want := range i.hashedKeys {
		if subtle.ConstantTimeCompare(h[:], want[:]) == 1 {
			return nil
		}
	}
	return connect.NewError(connect.CodeUnauthenticated,
		errors.New("invalid API key"))
}
