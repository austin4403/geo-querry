"use client";

import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface MapLibreCanvasProps {
  initialCenter?: [number, number]; // [longitude, latitude]
  initialZoom?: number;
  initialPitch?: number;
  initialBearing?: number;
  onMapReady?: (map: maplibregl.Map) => void;
  className?: string;
  children?: React.ReactNode;
}

// Carto Dark Matter raster basemap fallback / style specification
const CARTO_DARK_MATTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "carto-dark-layer",
      type: "raster",
      source: "carto-dark",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export const MapLibreCanvas: React.FC<MapLibreCanvasProps> = ({
  initialCenter = [35.895, 3.125], // Default centered on Kenya exploration corridors (Turkana)
  initialZoom = 11,
  initialPitch = 30,
  initialBearing = 0,
  onMapReady,
  className = "w-full h-full min-h-[420px] rounded-lg overflow-hidden border border-zinc-800 bg-[#09090b]",
  children,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: CARTO_DARK_MATTER_STYLE,
      center: initialCenter,
      zoom: initialZoom,
      pitch: initialPitch,
      bearing: initialBearing,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      mapInstanceRef.current = map;
      setMapLoaded(true);
      if (onMapReady) {
        onMapReady(map);
      }
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      setMapLoaded(false);
    };
  }, [initialCenter, initialZoom, initialPitch, initialBearing, onMapReady]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className={className} />
      {mapLoaded && children}
    </div>
  );
};
