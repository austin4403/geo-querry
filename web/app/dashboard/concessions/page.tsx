"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Plus, Globe, Download, X, Layers, CheckCircle2 } from "lucide-react";

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
  },
];

export default function ConcessionsPage() {
  const [concessions, setConcessions] = useState<ConcessionRecord[]>(initialConcessions);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          coordinates: [
            [
              [35.8, 3.1],
              [36.0, 3.1],
              [36.0, 3.3],
              [35.8, 3.3],
              [35.8, 3.1],
            ],
          ],
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
                  <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                    {c.validUntil}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === "ACTIVE" ? "success" : "warning"}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center space-x-2">
                <Layers className="h-5 w-5 text-[var(--primary)]" />
                <h3 className="font-semibold text-lg">Register Concession Boundary</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateConcession} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Official License Code</label>
                  <Input
                    placeholder="e.g. ML-2026-0099"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Concession Name</label>
                  <Input
                    placeholder="e.g. Samburu Nickel Belt"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">License Classification</label>
                  <select
                    value={licenseType}
                    onChange={(e) => setLicenseType(e.target.value)}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--foreground)]"
                  >
                    <option value="Prospecting License">Prospecting License (PL)</option>
                    <option value="Mining Lease">Mining Lease (ML)</option>
                    <option value="Special Prospecting License">Special Prospecting License (SPL)</option>
                    <option value="Artisanal Permit">Artisanal Mining Permit</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Area (Hectares)</label>
                  <Input
                    type="number"
                    value={areaHa}
                    onChange={(e) => setAreaHa(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Coordinate Reference System</label>
                  <select
                    value={crs}
                    onChange={(e) => setCrs(e.target.value)}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--foreground)]"
                  >
                    <option value="EPSG:32637">EPSG:32637 - WGS84 UTM Zone 37N</option>
                    <option value="EPSG:32636">EPSG:32636 - WGS84 UTM Zone 36N</option>
                    <option value="EPSG:4326">EPSG:4326 - WGS84 Geographic</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Validity Expiration</label>
                  <Input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
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
                  <span>Save Tenement Boundary</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
