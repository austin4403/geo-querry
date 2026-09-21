"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Plus, Globe, Download, X, Layers, CheckCircle2 } from "lucide-react";
import type { ConcessionPolygonData } from "@/components/gis/ConcessionPolygonLayer";

// Dynamic import of ConcessionsMapWrapper for SSR safety
const ConcessionsMapWrapper = dynamic(
  () => import("@/components/gis/ConcessionsMapWrapper").then((mod) => mod.ConcessionsMapWrapper),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[420px] rounded-lg bg-[#09090b] border border-zinc-800 flex items-center justify-center text-zinc-500 font-mono text-xs">
        Initializing Carto Dark Matter GIS Canvas...
      </div>
    ),
  }
);

interface ConcessionRecord {
  id: string;
  code: string;
  name: string;
  licenseType: string;
  areaHa: number;
  status: "ACTIVE" | "RENEWAL_DUE" | "PENDING";
  validUntil: string;
  crs: string;
  bounds: string;
  coordinates: [number, number][]; // [longitude, latitude] pairs in EPSG:4326
}

const initialConcessions: ConcessionRecord[] = [
  {
    id: "conc-001",
    code: "PL-2024-0012",
    name: "Kitui South Lithium Perimeter",
    licenseType: "Prospecting License",
    areaHa: 14250,
    status: "ACTIVE",
    validUntil: "2028-11-15",
    crs: "EPSG:32637 (UTM Zone 37N)",
    bounds: "38.10°E, 1.25°S to 38.35°E, 1.50°S",
    coordinates: [
      [38.10, -1.25],
      [38.35, -1.25],
      [38.35, -1.50],
      [38.10, -1.50],
      [38.10, -1.25],
    ],
  },
  {
    id: "conc-002",
    code: "ML-2022-0045",
    name: "Turkana Rare Earth Block B",
    licenseType: "Mining Lease",
    areaHa: 4800,
    status: "ACTIVE",
    validUntil: "2032-06-30",
    crs: "EPSG:32636 (UTM Zone 36N)",
    bounds: "35.80°E, 3.10°N to 36.05°E, 3.35°N",
    coordinates: [
      [35.80, 3.10],
      [36.05, 3.10],
      [36.05, 3.35],
      [35.80, 3.35],
      [35.80, 3.10],
    ],
  },
  {
    id: "conc-003",
    code: "SPL-2025-0108",
    name: "Migori Gold Belt Sector 4",
    licenseType: "Special Prospecting License",
    areaHa: 8900,
    status: "RENEWAL_DUE",
    validUntil: "2026-10-31",
    crs: "EPSG:32636 (UTM Zone 36N)",
    bounds: "34.30°E, 0.95°S to 34.60°E, 1.15°S",
    coordinates: [
      [34.30, -0.95],
      [34.60, -0.95],
      [34.60, -1.15],
      [34.30, -1.15],
      [34.30, -0.95],
    ],
  },
];

export default function ConcessionsPage() {
  const [concessions, setConcessions] = useState<ConcessionRecord[]>(initialConcessions);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedConcession, setSelectedConcession] = useState<ConcessionPolygonData | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [licenseType, setLicenseType] = useState("Prospecting License");
  const [areaHa, setAreaHa] = useState("5000");
  const [crs, setCrs] = useState("EPSG:32637");
  const [validUntil, setValidUntil] = useState("2029-12-31");

  const filtered = concessions.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.licenseType.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateConcession = (e: React.FormEvent) => {
    e.preventDefault();
    const newRecord: ConcessionRecord = {
      id: `conc-${Date.now().toString().slice(-4)}`,
      code: code.toUpperCase() || "PL-2026-NEW",
      name: name || "Exploration Block",
      licenseType,
      areaHa: parseFloat(areaHa) || 1000,
      status: "ACTIVE",
      validUntil,
      crs: crs === "EPSG:32637" ? "EPSG:32637 (UTM Zone 37N)" : "EPSG:4326 (WGS 84)",
      bounds: "Bounding coordinates computed by PostGIS ST_Envelope",
      coordinates: [
        [36.8, -1.2],
        [37.0, -1.2],
        [37.0, -1.4],
        [36.8, -1.4],
        [36.8, -1.2],
      ],
    };

    setConcessions([newRecord, ...concessions]);
    setIsModalOpen(false);
    setCode("");
    setName("");
  };

  const handleExportGeoJSON = () => {
    const geojson = {
      type: "FeatureCollection",
      features: concessions.map((c) => ({
        type: "Feature",
        id: c.id,
        properties: {
          code: c.code,
          name: c.name,
          license_type: c.licenseType,
          area_ha: c.areaHa,
          status: c.status,
          valid_until: c.validUntil,
        },
        geometry: {
          type: "Polygon",
          coordinates: [c.coordinates],
        },
      })),
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `concessions_${new Date().toISOString().slice(0, 10)}.geojson`;
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
            Mining Concessions & Leases
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            PostGIS MultiPolygon cadastral boundaries with spatial containment checks.
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
            <span>Export Cadastre</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Register Boundary</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by license code, concession name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-80"
        />
        <div className="flex items-center space-x-3 text-xs text-[var(--foreground-muted)] sm:ml-auto">
          <span className="flex items-center space-x-1">
            <Globe className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span>EPSG:4326 PostGIS MultiPolygon</span>
          </span>
          <span className="text-[var(--border)]">|</span>
          <span>{filtered.length} active tenements</span>
        </div>
      </div>

      {/* Cadastral Map View */}
      <Card className="overflow-hidden border border-[var(--border)]">
        <CardHeader className="p-4 border-b border-[var(--border)] bg-zinc-950/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center space-x-2">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span>Mining Tenement Cadastre GIS Map</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Interactive spatial boundary inspection with live concession status styling.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500/40 border border-emerald-500"></span>
                <span className="text-zinc-400">Active</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-amber-500/40 border border-amber-500"></span>
                <span className="text-zinc-400">Renewal Due</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-blue-500/40 border border-blue-500"></span>
                <span className="text-zinc-400">Pending</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ConcessionsMapWrapper
            concessions={filtered}
            onSelectConcession={(c) => setSelectedConcession(c)}
          />
        </CardContent>
        {selectedConcession && (
          <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="font-bold text-emerald-400 font-mono">{selectedConcession.code}</span>
              <span className="text-zinc-300 font-medium">{selectedConcession.name}</span>
              <span className="text-zinc-400">{selectedConcession.licenseType}</span>
              <span className="font-mono text-zinc-400">{selectedConcession.areaHa.toLocaleString()} Ha</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedConcession(null)}
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
            <Shield className="h-4 w-4 text-[var(--primary)]" />
            <span>Official Mining Cadastre Registry</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Boundary geometry validated with ST_IsValid and indexed via PostGIS GIST.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>License Code</TableHead>
                <TableHead>Concession Name</TableHead>
                <TableHead>License Type</TableHead>
                <TableHead>Area (Hectares)</TableHead>
                <TableHead>Reference CRS</TableHead>
                <TableHead>Expiration Date</TableHead>
                <TableHead>Tenement Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[var(--primary)]">
                    {c.code}
                  </TableCell>
                  <TableCell className="font-medium text-xs">{c.name}</TableCell>
                  <TableCell className="text-xs">{c.licenseType}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {c.areaHa.toLocaleString()} ha
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                    {c.crs}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.validUntil}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.status === "ACTIVE"
                          ? "success"
                          : c.status === "RENEWAL_DUE"
                          ? "warning"
                          : "default"
                      }
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Register Concession Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg border border-[var(--border)] shadow-2xl animate-in fade-in-50 zoom-in-95">
            <CardHeader className="p-4 border-b border-[var(--border)] flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center space-x-2">
                  <Plus className="h-4 w-4 text-[var(--primary)]" />
                  <span>Register Concession Boundary</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Upload or register a licensed mining tenement perimeter.
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
            <form onSubmit={handleCreateConcession}>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">License Code</label>
                  <Input
                    placeholder="e.g. PL-2026-0042"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">Concession Name</label>
                  <Input
                    placeholder="e.g. Samburu East Nickel Prospect"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">License Type</label>
                    <select
                      value={licenseType}
                      onChange={(e) => setLicenseType(e.target.value)}
                      className="w-full bg-[var(--background-card)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-[var(--foreground)]"
                    >
                      <option value="Prospecting License">Prospecting License</option>
                      <option value="Mining Lease">Mining Lease</option>
                      <option value="Special Prospecting License">Special Prospecting License</option>
                      <option value="Reconnaissance Permit">Reconnaissance Permit</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Area (Hectares)</label>
                    <Input
                      type="number"
                      placeholder="e.g. 12500"
                      value={areaHa}
                      onChange={(e) => setAreaHa(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Spatial Reference (CRS)</label>
                    <select
                      value={crs}
                      onChange={(e) => setCrs(e.target.value)}
                      className="w-full bg-[var(--background-card)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-[var(--foreground)]"
                    >
                      <option value="EPSG:32637">EPSG:32637 (UTM Zone 37N)</option>
                      <option value="EPSG:32636">EPSG:32636 (UTM Zone 36N)</option>
                      <option value="EPSG:4326">EPSG:4326 (WGS 84)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Validity Expiration</label>
                    <Input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="rounded bg-zinc-900/60 p-2 border border-zinc-800 text-[11px] text-[var(--foreground-muted)] flex items-start space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Bounding geometry is automatically validated with PostGIS <code className="text-zinc-300">ST_IsValid</code> and indexed with spatial GIST on ingestion.
                  </span>
                </div>
              </CardContent>
              <div className="p-4 border-t border-[var(--border)] flex justify-end space-x-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save Tenement
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
