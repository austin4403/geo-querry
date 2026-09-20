import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Plus, Download } from "lucide-react";

export default function StationsPage() {
  const stations = [
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Outcrop Geological Stations
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Structural planar strike/dip measurements and sample collection points.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" className="flex items-center space-x-1">
            <Download className="h-3.5 w-3.5" />
            <span>Export GeoJSON</span>
          </Button>
          <Button size="sm" className="flex items-center space-x-1">
            <Plus className="h-3.5 w-3.5" />
            <span>Record Station</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <MapPin className="h-4 w-4 text-[var(--primary)]" />
            <span>Field Observation Catalog</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Coordinates stored in PostGIS Point (EPSG:4326) and transformed dynamically.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Station ID</TableHead>
                <TableHead>Station Name</TableHead>
                <TableHead>Lithology</TableHead>
                <TableHead>Strike / Dip</TableHead>
                <TableHead>Easting (UTM)</TableHead>
                <TableHead>Northing (UTM)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stations.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[var(--primary)]">
                    {s.id}
                  </TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.lithology}</TableCell>
                  <TableCell className="font-mono text-xs">{s.strikeDip}</TableCell>
                  <TableCell className="font-mono text-xs">{s.easting}</TableCell>
                  <TableCell className="font-mono text-xs">{s.northing}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "VERIFIED" ? "success" : "warning"}>
                      {s.status}
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
