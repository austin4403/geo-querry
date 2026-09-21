"use client";

import React, { useEffect } from "react";
import * as maplibregl from "maplibre-gl";

export interface StructuralMeasurementPoint {
  id: string;
  stationCode: string;
  strike: number; // 0..360 degrees
  dip: number;    // 0..90 degrees
  lithology: string;
  formation: string;
  coordinates: [number, number]; // [lng, lat]
}

interface StructuralLayersProps {
  map: maplibregl.Map | null;
  measurements: StructuralMeasurementPoint[];
  onSelectStation?: (measurement: StructuralMeasurementPoint) => void;
}

export const StructuralLayers: React.FC<StructuralLayersProps> = ({
  map,
  measurements,
  onSelectStation,
}) => {
  useEffect(() => {
    if (!map) return;

    const markers: maplibregl.Marker[] = [];

    measurements.forEach((m) => {
      // Create strike & dip symbol container
      const el = document.createElement("div");
      el.className = "cursor-pointer group flex flex-col items-center justify-center";
      el.title = `${m.stationCode}: Strike ${m.strike}°, Dip ${m.dip}° (${m.formation})`;

      // Strike & Dip SVG symbol:
      // Long line oriented along Strike
      // Short perpendicular tick pointing down-dip
      // Dip degree text
      el.innerHTML = `
        <div style="transform: rotate(${m.strike}deg); width: 32px; height: 32px;" class="relative flex items-center justify-center transition-transform hover:scale-125">
          <!-- Strike bar -->
          <div class="absolute w-7 h-[2.5px] bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
          <!-- Dip tick (perpendicular, pointing down-dip) -->
          <div class="absolute w-[2px] h-3 bg-emerald-300 top-1/2 left-1/2 -translate-x-1/2 rounded-full"></div>
          <!-- Center station core -->
          <div class="w-1.5 h-1.5 bg-white rounded-full z-10"></div>
        </div>
        <span class="text-[10px] font-mono font-bold text-emerald-300 bg-zinc-950/80 px-1 py-0.5 rounded border border-emerald-500/30 -mt-1 shadow-sm">
          ${m.dip}°
        </span>
      `;

      el.addEventListener("click", () => {
        if (onSelectStation) {
          onSelectStation(m);
        }

        new maplibregl.Popup({ offset: 15, closeButton: false })
          .setLngLat(m.coordinates)
          .setHTML(
            `<div class="p-2 bg-zinc-900 text-zinc-100 text-xs font-sans rounded border border-zinc-700">
              <p class="font-bold text-emerald-400">${m.stationCode}</p>
              <p class="text-zinc-300">Strike / Dip: <span class="font-mono font-semibold">${m.strike}° / ${m.dip}°</span></p>
              <p class="text-zinc-400">Formation: ${m.formation}</p>
              <p class="text-zinc-400">Lithology: ${m.lithology}</p>
            </div>`
          )
          .addTo(map);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(m.coordinates)
        .addTo(map);

      markers.push(marker);
    });

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [map, measurements, onSelectStation]);

  return null;
};
