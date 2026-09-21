"use client";

import React, { useState } from "react";
import * as maplibregl from "maplibre-gl";
import { MapLibreCanvas } from "./MapLibreCanvas";
import { StructuralLayers, StructuralMeasurementPoint } from "./StructuralLayers";

interface StationsMapWrapperProps {
  measurements: StructuralMeasurementPoint[];
  onSelectStation?: (m: StructuralMeasurementPoint) => void;
  className?: string;
}

export const StationsMapWrapper: React.FC<StationsMapWrapperProps> = ({
  measurements,
  onSelectStation,
  className = "w-full h-[420px] rounded-lg overflow-hidden border border-zinc-800",
}) => {
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  return (
    <div className="relative w-full">
      <MapLibreCanvas
        initialCenter={[35.897, 3.128]}
        initialZoom={14}
        initialPitch={30}
        onMapReady={(m) => setMap(m)}
        className={className}
      >
        <StructuralLayers
          map={map}
          measurements={measurements}
          onSelectStation={onSelectStation}
        />
      </MapLibreCanvas>
    </div>
  );
};
