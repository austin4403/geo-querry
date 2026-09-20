"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Plus, Download, Compass, X, CheckCircle2, RefreshCw } from "lucide-react";

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

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [lithology, setLithology] = useState("Banded Iron Formation");
  const [strike, setStrike] = useState("045");
  const [dip, setDip] = useState("60");
  const [lat, setLat] = useState("3.12500");
  const [lng, setLng] = useState("35.89500");
  const [elevation, setElevation] = useState("630");

  const filteredStations = stations.filter(
    (s) =>
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.lithology.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddStation = (e: React.FormEvent) => {
    e.preventDefault();
    const strikeNum = parseFloat(strike) || 0;
    const dipNum = parseFloat(dip) || 0;
    const dipDirAzimuth = (strikeNum + 90) % 360;

    const newRecord: StationRecord = {
      id: code.toUpperCase() || `STN-${String(stations.length + 1).padStart(3, "0")}`,
      name: name || "Field Station",
      lithology,
      strike: strikeNum,
      dip: dipNum,
      dipDirection: `${dipDirAzimuth}°`,
      latitude: parseFloat(lat) || 3.12,
      longitude: parseFloat(lng) || 35.89,
      elevation: parseFloat(elevation) || 600,
      samples: 0,
      status: "SYNCED",
      timestamp: "Just now",
    };

    setStations([newRecord, ...stations]);
    setIsModalOpen(false);
    setCode("");
    setName("");
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

      {/* Record Station Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center space-x-2">
                <Compass className="h-5 w-5 text-[var(--primary)]" />
                <h3 className="font-semibold text-lg">Record Outcrop Station</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddStation} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Station Code</label>
                  <Input
                    placeholder="e.g. STN-004"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Station Name</label>
                  <Input
                    placeholder="e.g. Quartz Ridge"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground-muted)]">Lithology Unit</label>
                <select
                  value={lithology}
                  onChange={(e) => setLithology(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--foreground)]"
                >
                  <option value="Banded Iron Formation">Banded Iron Formation (BIF)</option>
                  <option value="Quartz-Carbonate Vein">Quartz-Carbonate Vein</option>
                  <option value="Mylonitic Gneiss">Mylonitic Gneiss</option>
                  <option value="Pegmatite / Spodumene">Pegmatite / Spodumene</option>
                  <option value="Basaltic Greenstone">Basaltic Greenstone</option>
                  <option value="Calcrete / Regolith">Calcrete / Regolith</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-[var(--background)] p-3 rounded-lg border border-[var(--border)]">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">
                    Strike Azimuth (000° - 360°)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="360"
                    value={strike}
                    onChange={(e) => setStrike(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">
                    Dip Angle (00° - 90°)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="90"
                    value={dip}
                    onChange={(e) => setDip(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Latitude (°N)</label>
                  <Input
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Longitude (°E)</label>
                  <Input
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Elevation (m)</label>
                  <Input
                    value={elevation}
                    onChange={(e) => setElevation(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="flex items-center space-x-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Commit Station (PostGIS)</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
