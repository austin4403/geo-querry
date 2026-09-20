// service.go implements the CreatePhotoUpload RPC on top of the r2
// Presigner. It is mounted onto the same composed GeoquerrySyncService
// handler as sync and telemetry (see cmd/server/main.go), which means the
// API-key interceptor gates it for free.
package r2

import (
	"context"
	"errors"
	"log"

	"connectrpc.com/connect"
	"github.com/google/uuid"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

// UploadService implements ONLY CreatePhotoUpload. Named "UploadService"
// (not "Service") because cmd/server embeds it alongside *sync.Service and
// *telemetry.Handler in one composed handler — two embedded fields both
// called "Service" would not compile.
type UploadService struct {
	presigner *Presigner
}

// NewService wires the RPC to a presigner. Pass nil when R2 is not
// configured: the handler is nil-receiver-safe and answers a clean
// CodeUnimplemented, so callers never see a 500 for a feature that is
// simply switched off.
func NewService(p *Presigner) *UploadService {
	return &UploadService{presigner: p}
}

// CreatePhotoUpload validates identity fields (UUIDs), delegates to the
// presigner, and maps validation failures to connect codes so clients get
// actionable errors instead of a generic 500.
func (s *UploadService) CreatePhotoUpload(
	ctx context.Context,
	req *connect.Request[v1.CreatePhotoUploadRequest],
) (*connect.Response[v1.CreatePhotoUploadResponse], error) {
	if s == nil || s.presigner == nil {
		return nil, connect.NewError(connect.CodeUnimplemented,
			errors.New("photo uploads are not configured on this deployment (set R2_* env vars)"))
	}
	msg := req.Msg

	projectID, err := requireUUID(msg.GetProjectId(), "project_id")
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	stationID := msg.GetStationId() // optional, but must be a UUID when set
	if stationID != "" {
		if _, err := requireUUID(stationID, "station_id"); err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
	}

	url, key, expiresAt, err := s.presigner.CreateUploadURL(
		ctx, projectID, stationID,
		msg.GetFileName(), msg.GetContentType(), msg.GetContentLengthBytes(),
	)
	if err != nil {
		// Every presigner error is a client-input problem (bad type, bad
		// size) — CodeInternal would mislead clients into retrying.
		log.Printf("r2: rejected upload: %v", err)
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	return connect.NewResponse(&v1.CreatePhotoUploadResponse{
		UploadUrl: url,
		R2Key:     key,
		ExpiresAt: expiresAt.UnixMilli(),
	}), nil
}

// requireUUID mirrors sync.requireUUID; duplicated (not shared) to keep the
// package dependency graph flat — internal packages don't import each
// other sideways for one 10-line helper.
func requireUUID(value, field string) (string, error) {
	if value == "" {
		return "", errors.New(field + " is required")
	}
	if _, err := uuid.Parse(value); err != nil {
		return "", errors.New(field + " must be a UUID")
	}
	return value, nil
}
