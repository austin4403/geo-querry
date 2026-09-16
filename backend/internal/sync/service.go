package sync

import (
	geoquerryv1connect "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"
)

type Service struct {
	geoquerryv1connect.UnimplementedGeoquerrySyncServiceHandler
}

var _ geoquerryv1connect.GeoquerrySyncServiceHandler = (*Service)(nil)
