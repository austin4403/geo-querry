"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  UploadCloud,
  FileArchive,
  Layers,
  ShieldCheck,
  AlertCircle,
  Clock,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

interface GisDataset {
  id: string;
  name: string;
  format: "SHAPEFILE" | "GEOTIFF" | "CWLS_LAS";
  byteSize: string;
  crs: string;
  status: "READY" | "PROCESSING" | "QUARANTINED" | "FAILED";
  uploadedAt: string;
  bounds: string;
}

const initialDatasets: GisDataset[] = [
  {
    id: "ds-001",
    name: "Turkana_Aeromagnetic_Grid_v2.tif",
    format: "GEOTIFF",
    byteSize: "248.4 MB",
    crs: "EPSG:32637 (UTM Zone 37N)",
    status: "READY",
    uploadedAt: "2h ago",
    bounds: "35.80°E - 36.20°E, 3.10°N - 3.50°N",
  },
  {
    id: "ds-002",
    name: "Concession_Boundaries_2026.zip",
    format: "SHAPEFILE",
    byteSize: "14.2 MB",
    crs: "EPSG:4326 (WGS 84)",
    status: "READY",
    uploadedAt: "1d ago",
    bounds: "34.00°E - 38.50°E, 1.00°S - 4.00°N",
  },
  {
    id: "ds-003",
    name: "DrillCore_Borehole_Survey_2026.las",
    format: "CWLS_LAS",
    byteSize: "68.9 MB",
    crs: "Collar Reference Local Grid",
    status: "PROCESSING",
    uploadedAt: "3m ago",
    bounds: "Depth: 0.0m - 850.0m",
  },
];

export default function IngestionPage() {
  const [datasets, setDatasets] = useState<GisDataset[]>(initialDatasets);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(10);

    const filename = file.name;
    const format = filename.endsWith(".tif") || filename.endsWith(".tiff")
      ? "GEOTIFF"
      : filename.endsWith(".las")
      ? "CWLS_LAS"
      : "SHAPEFILE";

    const byteSizeFormatted = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

    // Simulate R2 presigned PUT -> River queue scan -> READY
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          setDatasets((current) => [
            {
              id: `ds-${Date.now().toString().slice(-4)}`,
              name: filename,
              format,
              byteSize: byteSizeFormatted,
              crs: "EPSG:32637 (UTM Zone 37N)",
              status: "READY",
              uploadedAt: "Just now",
              bounds: "Bounding coordinates indexed by PostGIS",
            },
            ...current,
          ]);
          return 100;
        }
        return prev + 30;
      });
    }, 600);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            GIS Data Ingestion & Sandboxing
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Cloudflare R2 quarantine presigning and River background worker CRS reprojection.
          </p>
        </div>
      </div>

      {/* Upload Zone Card */}
      <Card className="border-dashed border-2 border-[var(--border)] hover:border-[var(--primary)] transition-colors">
        <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className="p-4 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <UploadCloud className="h-8 w-8" />
          </div>
          <div className="max-w-md space-y-1">
            <h3 className="font-semibold text-base">Drag and drop spatial datasets</h3>
            <p className="text-xs text-[var(--foreground-muted)]">
              Accepts ESRI Shapefile (.zip), Orthomosaic GeoTIFF (.tif), and Borehole LAS (.las) up to 1 GB.
            </p>
          </div>

          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              accept=".zip,.tif,.tiff,.las"
              onChange={handleSimulateUpload}
              disabled={isUploading}
            />
            <Button size="sm" disabled={isUploading} className="flex items-center space-x-1">
              <span>{isUploading ? "Uploading & Scanning..." : "Select Spatial Archive"}</span>
            </Button>
          </label>

          {isUploading && (
            <div className="w-full max-w-sm space-y-1">
              <div className="flex justify-between text-[11px] text-[var(--foreground-muted)]">
                <span>R2 Quarantine Presigned Upload</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--primary)] transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Architecture Notice */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold text-xs text-emerald-600 dark:text-emerald-400">
              Quarantine Presigning
            </span>
          </div>
          <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
            Files upload directly to Cloudflare R2 quarantine buckets with AES-256 encryption. No payload touches the web BFF.
          </p>
        </Card>

        <Card className="p-4 border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-4 w-4 text-blue-500" />
            <span className="font-semibold text-xs text-blue-600 dark:text-blue-400">
              Sandboxed Extraction
            </span>
          </div>
          <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
            Zip-slip protection verifies all extracted file headers before running GDAL raster and vector projections.
          </p>
        </Card>

        <Card className="p-4 border-purple-500/20 bg-purple-500/5">
          <div className="flex items-center space-x-2">
            <Layers className="h-4 w-4 text-purple-500" />
            <span className="font-semibold text-xs text-purple-600 dark:text-purple-400">
              River Durable Workers
            </span>
          </div>
          <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
            Reprojection to EPSG:32637 and PostGIS GIST bounding box indexing run as retryable transactional jobs.
          </p>
        </Card>
      </div>

      {/* Ingestion Table */}
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <FileArchive className="h-4 w-4 text-[var(--primary)]" />
            <span>Ingested Spatial Datasets</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Verified layers with extracted Coordinate Reference System metadata and bounding extents.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dataset Name</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Archive Size</TableHead>
                <TableHead>Detected CRS</TableHead>
                <TableHead>Spatial Extent</TableHead>
                <TableHead>Processed</TableHead>
                <TableHead>Pipeline Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium text-xs">
                    <div className="flex items-center space-x-2">
                      <FileArchive className="h-3.5 w-3.5 text-[var(--foreground-muted)]" />
                      <span>{d.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{d.format}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{d.byteSize}</TableCell>
                  <TableCell className="text-xs font-mono text-[var(--primary)]">{d.crs}</TableCell>
                  <TableCell className="text-xs text-[var(--foreground-muted)] font-mono text-[11px]">
                    {d.bounds}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--foreground-muted)]">{d.uploadedAt}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        d.status === "READY"
                          ? "success"
                          : d.status === "PROCESSING"
                          ? "warning"
                          : "destructive"
                      }
                    >
                      {d.status}
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
