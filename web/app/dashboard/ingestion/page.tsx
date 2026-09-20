import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UploadCloud, ShieldAlert, ArrowUpRight } from "lucide-react";

export default function IngestionPage() {
  const queuedUploads = [
    {
      id: "UPL-9821",
      filename: "Turkana_Aeromagnetic_Grid_v2.tif",
      size: "248.4 MB",
      format: "Cloud-Optimized GeoTIFF",
      quarantineStatus: "SCAN_PASSED",
      ingestionStage: "River Worker: Reprojecting EPSG:32637",
    },
    {
      id: "UPL-9822",
      filename: "Concession_Boundaries_2026.zip",
      size: "14.2 MB",
      format: "ESRI Shapefile Archive",
      quarantineStatus: "SCANNING",
      ingestionStage: "Unpacking ZIP (Sandbox Worker)",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            GIS Quarantine Ingestion Pipeline
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Asynchronous multi-stage processing of GeoTIFF, LAS LiDAR, and Shapefiles via River queue.
          </p>
        </div>
        <Button size="sm" className="flex items-center space-x-1.5">
          <UploadCloud className="h-4 w-4" />
          <span>Upload Spatial Dataset</span>
        </Button>
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 flex items-start space-x-3">
        <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-[var(--foreground)]">
            Zero Direct PostGIS Parsing on Main Thread
          </p>
          <p className="text-[var(--foreground-muted)]">
            All untrusted binary archives are held in Cloudflare R2 quarantine buckets before being
            extracted inside isolated worker sub-processes to prevent zip-slip and GDAL vulnerabilities.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <UploadCloud className="h-4 w-4 text-[var(--primary)]" />
            <span>Active Ingestion Jobs</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Live execution status tracked through River background worker queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>Dataset File</TableHead>
                <TableHead>File Size</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Quarantine</TableHead>
                <TableHead>Worker Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queuedUploads.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[var(--primary)]">
                    {u.id}
                  </TableCell>
                  <TableCell className="font-medium flex items-center space-x-1.5">
                    <span>{u.filename}</span>
                    <ArrowUpRight className="h-3 w-3 text-[var(--foreground-muted)]" />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.size}</TableCell>
                  <TableCell>{u.format}</TableCell>
                  <TableCell>
                    <Badge variant={u.quarantineStatus === "SCAN_PASSED" ? "success" : "warning"}>
                      {u.quarantineStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-[var(--foreground-muted)]">
                    {u.ingestionStage}
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
