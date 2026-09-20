package gis

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

func TestGisIngestionService(t *testing.T) {
	svc := NewService(nil, nil, nil)
	ctx := context.Background()

	orgID := uuid.New().String()
	projectID := uuid.New().String()

	t.Run("InitiateDatasetUpload validates input and generates upload url", func(t *testing.T) {
		res, err := svc.InitiateDatasetUpload(ctx, connect.NewRequest(&v1.InitiateDatasetUploadRequest{
			OrganizationId: orgID,
			ProjectId:      projectID,
			Kind:           v1.DatasetKind_DATASET_KIND_GEOTIFF,
			DisplayName:    "Survey_Block_A.tif",
			ByteSize:       50 * 1024 * 1024,
			ContentType:    "image/tiff",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Msg.UploadId == "" {
			t.Errorf("expected non-empty upload_id")
		}
		if res.Msg.PresignedUploadUrl == "" {
			t.Errorf("expected presigned upload url")
		}
	})

	t.Run("InitiateDatasetUpload rejects size over 1GB", func(t *testing.T) {
		_, err := svc.InitiateDatasetUpload(ctx, connect.NewRequest(&v1.InitiateDatasetUploadRequest{
			OrganizationId: orgID,
			ProjectId:      projectID,
			Kind:           v1.DatasetKind_DATASET_KIND_CWLS_LAS,
			DisplayName:    "Huge_LiDAR.las",
			ByteSize:       2 * 1024 * 1024 * 1024, // 2GB
		}))
		if err == nil {
			t.Fatalf("expected error for file > 1GB, got nil")
		}
	})

	t.Run("CompleteDatasetUpload marks dataset processing", func(t *testing.T) {
		uploadID := uuid.New().String()
		res, err := svc.CompleteDatasetUpload(ctx, connect.NewRequest(&v1.CompleteDatasetUploadRequest{
			OrganizationId: orgID,
			ProjectId:      projectID,
			UploadId:       uploadID,
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Msg.Status != v1.IngestionStatus_INGESTION_STATUS_PROCESSING {
			t.Errorf("expected PROCESSING status, got %v", res.Msg.Status)
		}
	})

	t.Run("ListDatasets returns datasets with CRS", func(t *testing.T) {
		res, err := svc.ListDatasets(ctx, connect.NewRequest(&v1.ListDatasetsRequest{
			OrganizationId: orgID,
			ProjectId:      projectID,
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Msg.Datasets) == 0 {
			t.Errorf("expected datasets, got 0")
		}
		for _, ds := range res.Msg.Datasets {
			if ds.Crs == nil || ds.Crs.EpsgCode == "" {
				t.Errorf("expected dataset to include EPSG CRS code")
			}
		}
	})
}
