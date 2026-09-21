"use client";

import React, { useEffect } from "react";
import * as maplibregl from "maplibre-gl";

export interface GeologistLocation {
  id: string;
  name: string;
  role: string;
  lat: number;
  lng: number;
  elevation: number;
  heading: number;
  battery: number;
  lastSeen: string;
  isActive: boolean;
  sosAlert: boolean;
}

interface TelemetryMarkerLayerProps {
  map: maplibregl.Map | null;
  geologists: GeologistLocation[];
  onSelectGeologist?: (geologist: GeologistLocation) => void;
}

export const TelemetryMarkerLayer: React.FC<TelemetryMarkerLayerProps> = ({
  map,
  geologists,
  onSelectGeologist,
}) => {
  useEffect(() => {
    if (!map) return;

    const markers: maplibregl.Marker[] = [];

    geologists.forEach((g) => {
      const el = document.createElement("div");
      el.className = "cursor-pointer group flex flex-col items-center justify-center";
      el.title = `${g.name} (${g.role}) - Battery ${g.battery}%`;

      const isEmergency = g.sosAlert;
      const statusColor = isEmergency
        ? "bg-rose-500 text-rose-200 border-rose-400 animate-pulse"
        : g.isActive
        ? "bg-emerald-500 text-emerald-200 border-emerald-400"
        : "bg-zinc-600 text-zinc-300 border-zinc-500";

      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          ${
            isEmergency
              ? '<div class="absolute w-8 h-8 rounded-full bg-rose-500/40 animate-ping"></div>'
              : ""
          }
          <!-- Heading direction indicator arrow -->
          <div style="transform: rotate(${g.heading}deg);" class="w-6 h-6 rounded-full ${statusColor} border flex items-center justify-center shadow-lg transition-transform duration-300">
            <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L4 20L12 16L20 20L12 2Z" />
            </svg>
          </div>
        </div>
        <div class="mt-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-950/90 border border-zinc-800 text-[10px] font-mono shadow-md whitespace-nowrap">
          <span class="${isEmergency ? "text-rose-400 font-bold" : "text-zinc-200"}">${g.name.split(" ")[0]}</span>
          <span class="text-zinc-500">|</span>
          <span class="${g.battery < 20 ? "text-rose-400" : "text-emerald-400"}">${g.battery}%</span>
        </div>
      `;

      el.addEventListener("click", () => {
        if (onSelectGeologist) {
          onSelectGeologist(g);
        }

        new maplibregl.Popup({ offset: 18, closeButton: false })
          .setLngLat([g.lng, g.lat])
          .setHTML(
            `<div class="p-2.5 bg-zinc-900 text-zinc-100 text-xs font-sans rounded border ${
              isEmergency ? "border-rose-500/80 shadow-rose-950/50" : "border-zinc-700"
            }">
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="font-bold text-white">${g.name}</span>
                <span class="px-1.5 py-0.5 text-[10px] font-mono rounded ${
                  isEmergency ? "bg-rose-900 text-rose-200" : "bg-emerald-950 text-emerald-300"
                }">${isEmergency ? "SOS DISTRESS" : "NORMAL"}</span>
              </div>
              <p class="text-zinc-400 text-[11px] mb-1.5">${g.role}</p>
              <div class="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[10px] text-zinc-300">
                <span>Elevation: ${g.elevation.toFixed(1)}m</span>
                <span>Heading: ${g.heading}°</span>
                <span>Battery: ${g.battery}%</span>
                <span>Last ping: ${g.lastSeen}</span>
              </div>
            </div>`
          )
          .addTo(map);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([g.lng, g.lat])
        .addTo(map);

      markers.push(marker);
    });

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [map, geologists, onSelectGeologist]);

  return null;
};
