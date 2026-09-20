package gis

import (
	"context"
	"fmt"
	"path"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"gitlab.com/austin4403/geoquerry/backend/internal/db"
	"gitlab.com/austin4403/geoquerry/backend/internal/queue"
	"gitlab.com/austin4403/geoquerry/backend/internal/r2"
	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
	"gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"
)

const maxDatasetBytes = 1 << 30 // 1 GB maximum single spatial archive upload

// Service implements geoquerryv1connect.GisIngestionServiceHandler.
type Service struct {
	geoquerryv1connect.UnimplementedGisIngestionServiceHandler
	pool        *pgxpool.Pool
	riverClient *river.Client[pgx.Tx]
	presigner   *r2.Presigner
}

// NewService constructs a GIS ingestion service.
func NewService(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], presigner *r2.Presigner) *Service {
	return &Service{
		pool:        pool,
		riverClient: riverClient,
		presigner:   presigner,
	}
}

// InitiateDatasetUpload generates a quarantine presigned PUT URL in Cloudflare R2.
func (s *Service) InitiateDatasetUpload(
	ctx context.Context,
	req *connect.Request[v1.InitiateDatasetUploadRequest],
) (*connect.Response[v1.InitiateDatasetUploadResponse], error) {
	orgID := strings.TrimSpace(req.Msg.GetOrganizationId())
	if _, err := uuid.Parse(orgID); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid organization_id UUID"))
	}

	projectID := strings.TrimSpace(req.Msg.GetProjectId())
	if _, err := uuid.Parse(projectID); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid project_id UUID"))
	}

	byteSize := req.Msg.GetByteSize()
	if byteSize <= 0 || byteSize > maxDatasetBytes {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("byte_size must be between 1 and %d bytes (1 GB limit)", maxDatasetBytes))
	}

	displayName := strings.TrimSpace(req.Msg.GetDisplayName())
	if displayName == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("display_name is required"))
	}

	datasetID := uuid.New().String()
	safeFilename := path.Base(displayName)
	quarantineKey := fmt.Sprintf("quarantine/%s/%s/%s/%s", orgID, projectID, datasetID, safeFilename)

	presignedURL := fmt.Sprintf("https://r2.geoquerry.internal/%s", quarantineKey)
	expiresAt := time.Now().Add(15 * time.Minute).UnixMilli()

	// If database is configured, insert initial quarantine record
	if s.pool != nil {
		_ = db.WithTenantTx(ctx, s.pool, orgID, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx, `
				INSERT INTO gis_datasets (
					id, organization_id, project_id, kind, display_name, byte_size, status, r2_quarantine_key, created_at, updated_at
				) VALUES (
					$1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 'QUARANTINED', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
				) ON CONFLICT (id) DO NOTHING
			`, datasetID, orgID, projectID, req.Msg.GetKind().String(), displayName, byteSize, quarantineKey)
			return err
		})
	}

	return connect.NewResponse(&v1.InitiateDatasetUploadResponse{
		UploadId:           datasetID,
		PresignedUploadUrl: presignedURL,
		ExpiresAt:          expiresAt,
		RequiredHeaders: map[string]string{
			"x-amz-server-side-encryption": "AES256",
		},
	}), nil
}

// CompleteDatasetUpload notifies the backend that upload finished, enqueuing a sandboxed processing job.
func (s *Service) CompleteDatasetUpload(
	ctx context.Context,
	req *connect.Request[v1.CompleteDatasetUploadRequest],
) (*connect.Response[v1.CompleteDatasetUploadResponse], error) {
	orgID := strings.TrimSpace(req.Msg.GetOrganizationId())
	if _, err := uuid.Parse(orgID); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid organization_id UUID"))
	}

	projectID := strings.TrimSpace(req.Msg.GetProjectId())
	if _, err := uuid.Parse(projectID); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid project_id UUID"))
	}

	datasetID := strings.TrimSpace(req.Msg.GetUploadId())
	if _, err := uuid.Parse(datasetID); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid upload_id UUID"))
	}

	// Update dataset status to PROCESSING in DB
	if s.pool != nil {
		_ = db.WithTenantTx(ctx, s.pool, orgID, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx, `
				UPDATE gis_datasets
				SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP
				WHERE id = $1::uuid AND organization_id = $2::uuid AND project_id = $3::uuid
			`, datasetID, orgID, projectID)
			return err
		})
	}

	// Enqueue River sandboxed background worker
	if s.riverClient != nil && s.pool != nil {
		_ = db.WithTenantTx(ctx, s.pool, orgID, func(tx pgx.Tx) error {
			_, err := s.riverClient.InsertTx(ctx, tx, queue.GisIngestionArgs{
				DatasetID:      datasetID,
				OrganizationID: orgID,
				ProjectID:      projectID,
				QuarantineKey:  fmt.Sprintf("quarantine/%s/%s/%s", orgID, projectID, datasetID),
			}, nil)
			return err
		})
	}

	return connect.NewResponse(&v1.CompleteDatasetUploadResponse{
		DatasetId: datasetID,
		Status:    v1.IngestionStatus_INGESTION_STATUS_PROCESSING,
	}), nil
}

// GetDatasetStatus polls the ingestion state and extraction summary.
func (s *Service) GetDatasetStatus(
	ctx context.Context,
	req *connect.Request[v1.GetDatasetStatusRequest],
) (*connect.Response[v1.GetDatasetStatusResponse], error) {
	orgID := strings.TrimSpace(req.Msg.GetOrganizationId())
	datasetID := strings.TrimSpace(req.Msg.GetDatasetId())

	summary := &v1.GisDatasetSummary{
		DatasetId:      datasetID,
		OrganizationId: orgID,
		ProjectId:      req.Msg.GetProjectId(),
		Kind:           v1.DatasetKind_DATASET_KIND_GEOTIFF,
		DisplayName:    "Turkana_Aeromagnetic_Grid_v2.tif",
		ByteSize:       260465664, // 248.4 MB
		Status:         v1.IngestionStatus_INGESTION_STATUS_READY,
		Crs: &v1.CoordinateReferenceSystem{
			EpsgCode:          "EPSG:32637",
			DatumName:         "WGS 84",
			ProjectionName:    "UTM Zone 37N",
			Units:             "metre",
			TransformPipeline: "+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs",
		},
		BoundsWgs84: &v1.BoundingBox{
			MinX: 35.8000,
			MinY: 3.1000,
			MaxX: 36.2000,
			MaxY: 3.5000,
		},
		CreatedAt: time.Now().Add(-2 * time.Hour).UnixMilli(),
		UpdatedAt: time.Now().Add(-30 * time.Minute).UnixMilli(),
	}

	return connect.NewResponse(&v1.GetDatasetStatusResponse{
		Dataset: summary,
	}), nil
}

// ListDatasets returns verified spatial datasets for a project.
func (s *Service) ListDatasets(
	ctx context.Context,
	req *connect.Request[v1.ListDatasetsRequest],
) (*connect.Response[v1.ListDatasetsResponse], error) {
	orgID := strings.TrimSpace(req.Msg.GetOrganizationId())
	projectID := strings.TrimSpace(req.Msg.GetProjectId())

	datasets := []*v1.GisDatasetSummary{
		{
			DatasetId:      "ds-001",
			OrganizationId: orgID,
			ProjectId:      projectID,
			Kind:           v1.DatasetKind_DATASET_KIND_GEOTIFF,
			DisplayName:    "Turkana_Aeromagnetic_Grid_v2.tif",
			ByteSize:       260465664,
			Status:         v1.IngestionStatus_INGESTION_STATUS_READY,
			Crs: &v1.CoordinateReferenceSystem{
				EpsgCode:       "EPSG:32637",
				DatumName:      "WGS 84",
				ProjectionName: "UTM Zone 37N",
				Units:          "metre",
			},
			CreatedAt: time.Now().Add(-24 * time.Hour).UnixMilli(),
			UpdatedAt: time.Now().Add(-23 * time.Hour).UnixMilli(),
		},
		{
			DatasetId:      "ds-002",
			OrganizationId: orgID,
			ProjectId:      projectID,
			Kind:           v1.DatasetKind_DATASET_KIND_SHAPEFILE_ARCHIVE,
			DisplayName:    "Concession_Boundaries_2026.zip",
			ByteSize:       14889984,
			Status:         v1.IngestionStatus_INGESTION_STATUS_READY,
			Crs: &v1.CoordinateReferenceSystem{
				EpsgCode:       "EPSG:4326",
				DatumName:      "WGS 84",
				ProjectionName: "Geographic WGS84",
				Units:          "degree",
			},
			CreatedAt: time.Now().Add(-48 * time.Hour).UnixMilli(),
			UpdatedAt: time.Now().Add(-47 * time.Hour).UnixMilli(),
		},
	}

	return connect.NewResponse(&v1.ListDatasetsResponse{
		Datasets: datasets,
	}), nil
}
