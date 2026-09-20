import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";

export default function ConcessionsPage() {
  const concessions = [
    {
      id: "LIC-TUR-2024-01",
      name: "Turkana Central Exploration Block",
      areaKm2: "482.50",
      status: "ACTIVE",
      validUntil: "2029-12-31",
      mineralTarget: "Au, Cu, Li",
    },
    {
      id: "LIC-TUR-2025-08",
      name: "Rift Escarpment Prospect",
      areaKm2: "194.20",
      status: "UNDER_REVIEW",
      validUntil: "2027-06-30",
      mineralTarget: "Rare Earth Elements (REE)",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
          Spatial Concessions & Mining Licenses
        </h1>
        <p className="text-xs text-[var(--foreground-muted)]">
          Official spatial perimeter boundaries projected in EPSG:32637 UTM.
        </p>
      </div>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <Layers className="h-4 w-4 text-[var(--primary)]" />
            <span>Active Mineral Concessions</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Polygon perimeters stored as PostGIS MultiPolygon in PostgreSQL.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>License ID</TableHead>
                <TableHead>Concession Name</TableHead>
                <TableHead>Area (km²)</TableHead>
                <TableHead>Mineral Targets</TableHead>
                <TableHead>Expiration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {concessions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[var(--primary)]">
                    {c.id}
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.areaKm2}</TableCell>
                  <TableCell>{c.mineralTarget}</TableCell>
                  <TableCell className="font-mono text-xs">{c.validUntil}</TableCell>
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
    </div>
  );
}
