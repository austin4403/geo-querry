// service.go implements the StreamLiveTelemetry RPC on top of the Hub.
//
// THE STREAMING SHAPE
// The mobile client opens ONE bidirectional stream per field session and
// keeps sending StreamLiveTelemetryRequest points (one per GPS fix, every
// few seconds); the server answers with full team snapshots whenever ANY
// member of the project moves. Why snapshots instead of per-member events?
// A snapshot is idempotent state — a client that misses ten updates isn't
// corrupted by the eleventh, it just sees the latest truth. That robustness
// matters on 2G links where drops are the norm.
//
// WHY THE RECEIVE LOOP NEEDS ITS OWN GOROUTINE
// A bidi stream handler must SIMULTANEOUSLY wait for incoming points (to
// publish) and outgoing snapshots (to send). stream.Receive() blocks, so
// the two waits are multiplexed with select over a receive-goroutine's
// channel and the hub's subscription channel.
package telemetry

import (
	"context"
	"errors"
	"io"

	"connectrpc.com/connect"
	"github.com/google/uuid"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

// Handler implements ONLY the StreamLiveTelemetry RPC (see the mirror
// comment on sync.Service for why it must not embed Unimplemented...).
type Handler struct {
	hub *Hub
}

// NewHandler wires the handler to a (shared) hub.
func NewHandler(hub *Hub) *Handler {
	return &Handler{hub: hub}
}

// recvEnvelope carries one Receive() outcome into the select loop. An error
// (including io.EOF, the normal clean close) terminates the stream.
type recvEnvelope struct {
	point *v1.StreamLiveTelemetryRequest
	err   error
}

// StreamLiveTelemetry pumps one connected device:
// read points -> hub.Publish -> snapshots -> stream.Send, until either side
// closes or the request context is cancelled (client disconnect, server
// shutdown).
func (h *Handler) StreamLiveTelemetry(
	ctx context.Context,
	stream *connect.BidiStream[v1.StreamLiveTelemetryRequest, v1.StreamLiveTelemetryResponse],
) error {
	// The first point tells us WHICH project this device belongs to — we
	// can't subscribe before knowing it. A client that connects and leaves
	// without ever sending anything just ends here, cleanly.
	first, err := stream.Receive()
	if err != nil {
		return err // io.EOF means "opened then closed": success, not failure
	}
	if err := validatePoint(first); err != nil {
		return connect.NewError(connect.CodeInvalidArgument, err)
	}

	updates, cancel := h.hub.Subscribe(first.GetProjectId())
	defer cancel() // ALWAYS release the hub channel or it leaks

	// Publish the very first point too — the geologist should appear on the
	// office map immediately, not only after their second GPS fix.
	h.hub.Publish(first)

	// Dedicated receiver goroutine: multiplexes "device sent a point" with
	// "hub has a snapshot for us" in the select below.
	recvCh := make(chan recvEnvelope)
	go func() {
		defer close(recvCh)
		for {
			p, err := stream.Receive()
			env := recvEnvelope{point: p, err: err}
			// The send itself must be ctx-aware: if the client vanishes
			// (stream errors out) AND the handler loop has already
			// returned, a plain `recvCh <- env` would block forever — one
			// leaked goroutine per dropped connection, forever.
			select {
			case recvCh <- env:
			case <-ctx.Done():
				return
			}
			if err != nil {
				return
			}
		}
	}()

	for {
		select {
		case env, ok := <-recvCh:
			if !ok {
				return nil // receiver finished (shouldn't happen; defensive)
			}
			switch {
			case errors.Is(env.err, io.EOF):
				// Device closed its send side: normal end of field session.
				return nil
			case env.err != nil:
				return env.err // network error mid-stream
			}
			// Light validation per point: a bad point is skipped (logged
			// inside validatePoint flow) rather than killing a live session.
			if err := validatePoint(env.point); err != nil {
				continue
			}
			h.hub.Publish(env.point)

		case snap := <-updates:
			// Send blocks only on TCP backpressure; if the client is truly
			// wedged the connection dies and Receive/Send errors out.
			if err := stream.Send(snap); err != nil {
				return err
			}

		case <-ctx.Done():
			// Server shutdown or client disconnect. Returning ctx.Err()
			// would surface as a cancel to the client, which is exactly
			// right for a dropped connection.
			return ctx.Err()
		}
	}
}

// validatePoint checks one breadcrumb. Only identity fields are strict —
// coordinates are trusted as-is (a slightly-off GPS fix is still useful
// telemetry, and GPS hardware reports garbage lon=0/lat=0 during cold
// starts, which must not kill a stream).
func validatePoint(p *v1.StreamLiveTelemetryRequest) error {
	if p.GetUserId() == "" {
		return errors.New("user_id is required")
	}
	if _, err := uuid.Parse(p.GetProjectId()); err != nil {
		return errors.New("project_id must be a UUID")
	}
	return nil
}
