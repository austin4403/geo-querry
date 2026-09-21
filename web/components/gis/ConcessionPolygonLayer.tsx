"use client";

import React, { useEffect } from "react";
import * as maplibregl from "maplibre-gl";

export interface ConcessionPolygonData {
  id: string;
  code: string;
  name: string;
  licenseType: string;
  status: "ACTIVE" | "RENEWAL_DUE" | "PENDING";
  areaHa: number;
  coordinates: [number, number][]; // [longitude, latitude]
}

interface ConcessionPolygonLayerProps {
  map: maplibregl.Map | null;
  concessions: ConcessionPolygonData[];
  onSelectConcession?: (concession: ConcessionPolygonData) => void;
}

export const ConcessionPolygonLayer: React.FC<ConcessionPolygonLayerProps> = ({
  map,
  concessions,
  onSelectConcession,
}) => {
  useEffect(() => {
    if (!map) return;

    const sourceId = "concessions-geojson-source";
    const fillLayerId = "concessions-fill-layer";
    const lineLayerId = "concessions-line-layer";

    const features = concessions.map((c) => ({
      type: "Feature" as const,
      id: c.id,
      properties: {
        id: c.id,
        code: c.code,
        name: c.name,
        licenseType: c.licenseType,
        status: c.status,
        areaHa: c.areaHa,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [c.coordinates],
      },
    }));

    const geojsonData = {
      type: "FeatureCollection" as const,
      features,
    };

    if (map.getSource(sourceId)) {
      // Update data if source already exists
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
      source.setData(geojsonData);
    } else {
      map.addSource(sourceId, {
        type: "geojson",
        data: geojsonData,
      });

      // Semi-transparent polygon fill layer
      map.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": [
            "match",
            ["get", "status"],
            "ACTIVE",
            "#10b981", // Emerald
            "RENEWAL_DUE",
            "#f59e0b", // Amber
            "PENDING",
            "#3b82f6", // Cobalt
            "#6b7280", // Gray default
          ],
          "fill-opacity": 0.18,
        },
      });

      // Crisp boundary vector line layer
      map.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": [
            "match",
            ["get", "status"],
            "ACTIVE",
            "#10b981",
            "RENEWAL_DUE",
            "#f59e0b",
            "PENDING",
            "#3b82f6",
            "#6b7280",
          ],
          "line-width": 2,
          "line-dasharray": [2, 1],
        },
      });

      map.on("click", fillLayerId, (e) => {
        if (e.features && e.features[0]) {
          const feat = e.features[0];
          const found = concessions.find((c) => c.id === feat.properties?.id);
          if (found && onSelectConcession) {
            onSelectConcession(found);
          }
        }
      });

      map.on("mouseenter", fillLayerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", fillLayerId, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    return () => {
      if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, concessions, onSelectConcession]);

  return null;
};
