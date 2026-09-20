// service.go implements the StreamLiveTelemetry and AcquireStreamTicket RPCs on top of the Hub.
package telemetry

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
	"gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"
)

// Handler implements geoquerryv1connect.TelemetryServiceHandler.
type Handler struct {
	geoquerryv1connect.UnimplementedTelemetryServiceHandler
	hub *Hub
}

// NewHandler wires the handler to a (shared) hub.
func NewHandler(hub *Hub) *Handler {
	return &Handler{hub: hub}
}

// AcquireStreamTicket generates a single-use stream ticket valid for 30 seconds.
func (h *Handler) AcquireStreamTicket(
	ctx context.Context,
	req *connect.Request[v1.StreamTicketRequest],
) (*connect.Response[v1.StreamTicketResponse], error) {
	orgID := strings.TrimSpace(req.Msg.GetOrganizationId())
	if _, err := uuid.Parse(orgID); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid organization_id UUID"))
	}
	projID := strings.TrimSpace(req.Msg.GetProjectId())
	if _, err := uuid.Parse(projID); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid project_id UUID"))
	}

	// Single-use 256-bit token
	rawBytes := make([]byte, 32)
	_, _ = rand.Read(rawBytes)
	ticket := hex.EncodeToString(rawBytes)
	expiresAt := time.Now().Add(30 * time.Second).UnixMilli()

	return connect.NewResponse(&v1.StreamTicketResponse{
		Ticket:    ticket,
		ExpiresAt: expiresAt,
		StreamUrl: "/geoquerry.v1.TelemetryService/StreamLiveTelemetry",
	}), nil
}

// recvEnvelope carries one Receive() outcome into the select loop.
type recvEnvelope struct {
	point *v1.StreamLiveTelemetryRequest
	err   error
}

// StreamLiveTelemetry pumps one connected device:
// read points -> hub.Publish -> snapshots -> stream.Send, until either side
// closes or the request context is cancelled.
func (h *Handler) StreamLiveTelemetry(
	ctx context.Context,
	stream *connect.BidiStream[v1.StreamLiveTelemetryRequest, v1.StreamLiveTelemetryResponse],
) error {
	first, err := stream.Receive()
	if err != nil {
		return err
	}
	if err := validatePoint(first); err != nil {
		return connect.NewError(connect.CodeInvalidArgument, err)
	}

	updates, cancel := h.hub.Subscribe(first.GetProjectId())
	defer cancel()

	h.hub.Publish(first)

	recvCh := make(chan recvEnvelope)
	go func() {
		defer close(recvCh)
		for {
			p, err := stream.Receive()
			env := recvEnvelope{point: p, err: err}
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
				return nil
			}
			switch {
			case errors.Is(env.err, io.EOF):
				return nil
			case env.err != nil:
				return env.err
			}
			if err := validatePoint(env.point); err != nil {
				continue
			}
			h.hub.Publish(env.point)

		case snap := <-updates:
			if err := stream.Send(snap); err != nil {
				return err
			}

		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

// validatePoint checks one breadcrumb.
func validatePoint(p *v1.StreamLiveTelemetryRequest) error {
	if p.GetUserId() == "" {
		return errors.New("user_id is required")
	}
	if _, err := uuid.Parse(p.GetProjectId()); err != nil {
		return errors.New("project_id must be a UUID")
	}
	return nil
}
