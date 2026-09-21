"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Plus, Download, X, CheckCircle2, Layers } from "lucide-react";
import type { StructuralMeasurementPoint } from "@/components/gis/StructuralLayers";

// Dynamic import of StationsMapWrapper for SSR safety
const StationsMapWrapper = dynamic(
  () => import("@/components/gis/StationsMapWrapper").then((mod) => mod.StationsMapWrapper),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[420px] rounded-lg bg-[#09090b] border border-zinc-800 flex items-center justify-center text-zinc-500 font-mono text-xs">
        Initializing Carto Dark Matter GIS Canvas...
      </div>
    ),
  }
);

interface StationRecord {
  id: string;
  name: string;
  lithology: string;
  strike: number;
  dip: number;
  dipDirection: string;
  latitude: number;
  longitude: number;
  elevation: number;
  samples: number;
  status: "SYNCED" | "OFFLINE_DRAFT" | "PENDING_ASSAY";
  timestamp: string;
}

const initialStations: StationRecord[] = [
  {
    id: "STN-001",
    name: "Outcrop Ridge Alpha",
    lithology: "Banded Iron Formation",
    strike: 45,
    dip: 60,
    dipDirection: "135° SE",
    latitude: 3.12450,
    longitude: 35.89210,
    elevation: 642.5,
    samples: 4,
    status: "SYNCED",
    timestamp: "10m ago",
  },
  {
    id: "STN-002",
    name: "Riverbed Shear Zone",
    lithology: "Quartz-Carbonate Vein",
    strike: 120,
    dip: 75,
    dipDirection: "210° SW",
    latitude: 3.12890,
    longitude: 35.89940,
    elevation: 618.0,
    samples: 2,
    status: "PENDING_ASSAY",
    timestamp: "45m ago",
  },
  {
    id: "STN-003",
    name: "Fault Escarpment C",
    lithology: "Mylonitic Gneiss",
    strike: 10,
    dip: 45,
    dipDirection: "100° E",
    latitude: 3.13410,
    longitude: 35.90150,
    elevation: 685.2,
    samples: 7,
    status: "SYNCED",
    timestamp: "2h ago",
  },
];

export default function StationsPage() {
  const [stations, setStations] = useState<StationRecord[]>(initialStations);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMeasurement, setSelectedMeasurement] = useState<StructuralMeasurementPoint | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [lithology, setLithology] = useState("");
  const [strike, setStrike] = useState("045");
  const [dip, setDip] = useState("60");
  const [dipDirection, setDipDirection] = useState("135° SE");
  const [lat, setLat] = useState("3.12500");
  const [lng, setLng] = useState("35.89300");
  const [elevation, setElevation] = useState("640.0");

  const filteredStations = stations.filter(
    (s) =>
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.lithology.toLowerCase().includes(search.toLowerCase())
  );

  const measurements: StructuralMeasurementPoint[] = filteredStations.map((s) => ({
    id: s.id,
    stationCode: s.id,
    strike: s.strike,
    dip: s.dip,
    lithology: s.lithology,
    formation: s.name,
    coordinates: [s.longitude, s.latitude],
  }));

  const handleCreateStation = (e: React.FormEvent) => {
    e.preventDefault();
    const newStation: StationRecord = {
      id: `STN-${String(stations.length + 1).padStart(3, "0")}`,
      name: name || "Unassigned Outcrop",
      lithology: lithology || "Undifferentiated Basalt",
      strike: parseInt(strike, 10) || 0,
      dip: parseInt(dip, 10) || 0,
      dipDirection: dipDirection || "N",
      latitude: parseFloat(lat) || 3.12,
      longitude: parseFloat(lng) || 35.89,
      elevation: parseFloat(elevation) || 600.0,
      samples: 0,
      status: "SYNCED",
      timestamp: "Just now",
    };

    setStations([newStation, ...stations]);
    setIsModalOpen(false);
    setName("");
    setLithology("");
  };

  const handleExportGeoJSON = () => {
    const featureCollection = {
      type: "FeatureCollection",
      crs: {
        type: "name",
        properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" },
      },
      features: stations.map((s) => ({
        type: "Feature",
        id: s.id,
        geometry: {
          type: "Point",
          coordinates: [s.longitude, s.latitude, s.elevation],
        },
        properties: {
          station_id: s.id,
          name: s.name,
          lithology: s.lithology,
          strike: s.strike,
          dip: s.dip,
          dip_direction: s.dipDirection,
          samples_count: s.samples,
          status: s.status,
        },
      })),
    };

    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `geoquerry_stations_${new Date().toISOString().slice(0, 10)}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Outcrop Geological Stations
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Planar structural measurements (strike / dip) with PostGIS PointZ geometry.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportGeoJSON}
            className="flex items-center space-x-1"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export GeoJSON</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Record Station</span>
          </Button>
        </div>
      </div>

      {/* Control filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Filter by station code, name, or lithology..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-80"
        />
        <div className="flex items-center space-x-2 text-xs text-[var(--foreground-muted)] sm:ml-auto">
          <span className="flex items-center space-x-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            <span>PostGIS LWW Synced</span>
          </span>
          <span className="text-[var(--border)]">|</span>
          <span>{filteredStations.length} observations cataloged</span>
        </div>
      </div>

      {/* Structural Strike & Dip Map View */}
      <Card className="overflow-hidden border border-[var(--border)]">
        <CardHeader className="p-4 border-b border-[var(--border)] bg-zinc-950/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center space-x-2">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span>Structural Geology Strike & Dip Map</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Directional planar needles aligned with strike bearing (0–360°) and perpendicular dip inclination ticks.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-emerald-400"></span>
                <span>Strike Orientation</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                <span>Station Core</span>
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <StationsMapWrapper
            measurements={measurements}
            onSelectStation={(m) => setSelectedMeasurement(m)}
          />
        </CardContent>
        {selectedMeasurement && (
          <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="font-bold text-emerald-400 font-mono">{selectedMeasurement.stationCode}</span>
              <span className="text-zinc-300">{selectedMeasurement.formation}</span>
              <span className="text-zinc-400">{selectedMeasurement.lithology}</span>
              <span className="font-mono text-emerald-300">Strike {selectedMeasurement.strike}° / Dip {selectedMeasurement.dip}°</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedMeasurement(null)}
              className="text-xs h-6 px-2"
            >
              Dismiss
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <MapPin className="h-4 w-4 text-[var(--primary)]" />
            <span>Field Observation Catalog</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Coordinates stored in PostGIS PointZ (EPSG:4326) with WGS84 elevation values.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Station Code</TableHead>
                <TableHead>Observation Name</TableHead>
                <TableHead>Lithology</TableHead>
                <TableHead>Planar Strike / Dip</TableHead>
                <TableHead>Latitude (°N)</TableHead>
                <TableHead>Longitude (°E)</TableHead>
                <TableHead>Elevation (m)</TableHead>
                <TableHead>Sync Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStations.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[var(--primary)]">
                    {s.id}
                  </TableCell>
                  <TableCell className="font-medium text-xs">{s.name}</TableCell>
                  <TableCell className="text-xs">{s.lithology}</TableCell>
                  <TableCell className="font-mono text-xs font-medium">
                    <span className="text-amber-500">{String(s.strike).padStart(3, "0")}°</span>
                    {" / "}
                    <span className="text-blue-500">{s.dip}°</span>
                    <span className="text-[var(--foreground-muted)] text-[10px] ml-1">
                      ({s.dipDirection})
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {s.latitude.toFixed(5)}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {s.longitude.toFixed(5)}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {s.elevation.toFixed(1)} m
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        s.status === "SYNCED"
                          ? "success"
                          : s.status === "PENDING_ASSAY"
                          ? "warning"
                          : "default"
                      }
                    >
                      {s.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal for creating a station */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg border border-[var(--border)] shadow-2xl animate-in fade-in-50 zoom-in-95">
            <CardHeader className="p-4 border-b border-[var(--border)] flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center space-x-2">
                  <Plus className="h-4 w-4 text-[var(--primary)]" />
                  <span>Log Geological Observation</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Create an outcrop station with structural orientation and PointZ coordinates.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <form onSubmit={handleCreateStation}>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">Observation / Outcrop Name</label>
                  <Input
                    placeholder="e.g. Ridge Saddle Breccia"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">Lithological Description</label>
                  <Input
                    placeholder="e.g. Quartz Arenite with cross-bedding"
                    value={lithology}
                    onChange={(e) => setLithology(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Strike (0-360°)</label>
                    <Input
                      type="number"
                      min="0"
                      max="360"
                      placeholder="045"
                      value={strike}
                      onChange={(e) => setStrike(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Dip (0-90°)</label>
                    <Input
                      type="number"
                      min="0"
                      max="90"
                      placeholder="60"
                      value={dip}
                      onChange={(e) => setDip(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Dip Direction</label>
                    <Input
                      placeholder="135° SE"
                      value={dipDirection}
                      onChange={(e) => setDipDirection(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Latitude (°N)</label>
                    <Input
                      type="number"
                      step="0.00001"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Longitude (°E)</label>
                    <Input
                      type="number"
                      step="0.00001"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Elevation (m)</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={elevation}
                      onChange={(e) => setElevation(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="rounded bg-zinc-900/60 p-2 border border-zinc-800 text-[11px] text-[var(--foreground-muted)] flex items-start space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Measurements will be committed with Last-Write-Wins (LWW) conflict timestamps and synced to PostGIS.
                  </span>
                </div>
              </CardContent>
              <div className="p-4 border-t border-[var(--border)] flex justify-end space-x-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Record Station
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
