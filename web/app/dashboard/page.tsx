import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Download, Compass } from "lucide-react";

export default function DashboardPage() {
  const surveyStations = [
    {
      id: "STN-001",
      name: "Outcrop Ridge Alpha",
      lithology: "Banded Iron Formation",
      strikeDip: "045° / 60° SE",
      easting: "743210.45",
      northing: "9812400.12",
      samples: 4,
      status: "VERIFIED",
    },
    {
      id: "STN-002",
      name: "Riverbed Shear Zone",
      lithology: "Quartz-Carbonate Vein",
      strikeDip: "120° / 75° SW",
      easting: "743890.10",
      northing: "9812950.88",
      samples: 2,
      status: "PENDING_ASSAY",
    },
    {
      id: "STN-003",
      name: "Fault Escarpment C",
      lithology: "Mylonitic Gneiss",
      strikeDip: "010° / 45° E",
      easting: "744105.70",
      northing: "9813200.50",
      samples: 7,
      status: "VERIFIED",
    },
  ];

  return (
    <div>
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-4 mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <Badge variant="default" className="text-xs font-mono">
              ACTIVE TENANT: TURKANA GOLD LTD
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1 text-[var(--foreground)]">
            Survey Workstation
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Project CRS: EPSG:32637 (UTM 37N) • Elevation Datum: Mean Sea Level (MSL)
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" className="flex items-center space-x-1.5">
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>
          <Button size="sm" className="flex items-center space-x-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span>New Station</span>
          </Button>
        </div>
      </div>

      {/* Quick Stats Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Outcrop Observations</CardDescription>
            <CardTitle className="text-xl font-bold font-mono-num">24 Stations</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-[var(--foreground-muted)]">
            100% PostGIS Geodesic Validated
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Assayed Rock Samples</CardDescription>
            <CardTitle className="text-xl font-bold font-mono-num">86 Samples</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-[var(--foreground-muted)]">
            Chain-of-Custody QA/QC Verified
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Boreholes Drilled</CardDescription>
            <CardTitle className="text-xl font-bold font-mono-num">6 Collars (1,840 m)</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-[var(--foreground-muted)]">
            True Vertical Depth (TVD) Corrected
          </CardContent>
        </Card>
      </div>

      {/* Accessible Geological Records Table */}
      <Card>
        <CardHeader className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center space-x-2">
                <Compass className="h-4 w-4 text-[var(--primary)]" />
                <span>Structural Stations (Tabular Fallback)</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Non-map tabular view with accessible keyboard navigation and screen-reader support.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Station ID</TableHead>
                <TableHead>Station Name</TableHead>
                <TableHead>Primary Lithology</TableHead>
                <TableHead>Strike / Dip</TableHead>
                <TableHead>Easting (m)</TableHead>
                <TableHead>Northing (m)</TableHead>
                <TableHead>QA Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {surveyStations.map((station) => (
                <TableRow key={station.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[var(--primary)]">
                    {station.id}
                  </TableCell>
                  <TableCell className="font-medium">{station.name}</TableCell>
                  <TableCell>{station.lithology}</TableCell>
                  <TableCell className="font-mono text-xs">{station.strikeDip}</TableCell>
                  <TableCell className="font-mono text-xs">{station.easting}</TableCell>
                  <TableCell className="font-mono text-xs">{station.northing}</TableCell>
                  <TableCell>
                    <Badge
                      variant={station.status === "VERIFIED" ? "success" : "warning"}
                    >
                      {station.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
