"use client";

import React, { useState } from "react";
import * as maplibregl from "maplibre-gl";
import { MapLibreCanvas } from "./MapLibreCanvas";
import { ConcessionPolygonLayer, ConcessionPolygonData } from "./ConcessionPolygonLayer";

interface ConcessionsMapWrapperProps {
  concessions: ConcessionPolygonData[];
  onSelectConcession?: (concession: ConcessionPolygonData) => void;
  className?: string;
}

export const ConcessionsMapWrapper: React.FC<ConcessionsMapWrapperProps> = ({
  concessions,
  onSelectConcession,
  className = "w-full h-[420px] rounded-lg overflow-hidden border border-zinc-800",
}) => {
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  return (
    <div className="relative w-full">
      <MapLibreCanvas
        initialCenter={[36.0, 1.5]}
        initialZoom={7}
        initialPitch={20}
        onMapReady={(m) => setMap(m)}
        className={className}
      >
        <ConcessionPolygonLayer
          map={map}
          concessions={concessions}
          onSelectConcession={onSelectConcession}
        />
      </MapLibreCanvas>
    </div>
  );
};
