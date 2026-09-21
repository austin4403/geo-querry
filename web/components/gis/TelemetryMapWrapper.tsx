"use client";

import React, { useState } from "react";
import * as maplibregl from "maplibre-gl";
import { MapLibreCanvas } from "./MapLibreCanvas";
import { TelemetryMarkerLayer, GeologistLocation } from "./TelemetryMarkerLayer";

interface TelemetryMapWrapperProps {
  geologists: GeologistLocation[];
  className?: string;
}

export const TelemetryMapWrapper: React.FC<TelemetryMapWrapperProps> = ({
  geologists,
  className = "w-full h-[420px] rounded-lg overflow-hidden border border-zinc-800",
}) => {
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  return (
    <div className="relative w-full">
      <MapLibreCanvas
        initialCenter={[35.895, 3.125]}
        initialZoom={13}
        initialPitch={35}
        onMapReady={(m) => setMap(m)}
        className={className}
      >
        <TelemetryMarkerLayer map={map} geologists={geologists} />
      </MapLibreCanvas>
    </div>
  );
};
