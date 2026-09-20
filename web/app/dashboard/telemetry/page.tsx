"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Radio,
  Battery,
  Navigation,
  AlertTriangle,
  RefreshCw,
  Signal,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";

interface GeologistLiveStatus {
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

const initialGeologists: GeologistLiveStatus[] = [
  {
    id: "geo-001",
    name: "Dr. Austin Miller",
    role: "Lead Structural Geologist",
    lat: 3.1245,
    lng: 35.8921,
    elevation: 642.5,
    heading: 42,
    battery: 88,
    lastSeen: "2s ago",
    isActive: true,
    sosAlert: false,
  },
  {
    id: "geo-002",
    name: "Wanjiku Karanja",
    role: "Exploration Field Tech",
    lat: 3.1289,
    lng: 35.8994,
    elevation: 618.0,
    heading: 185,
    battery: 45,
    lastSeen: "8s ago",
    isActive: true,
    sosAlert: false,
  },
  {
    id: "geo-003",
    name: "Emmanuel Kiprono",
    role: "Senior Geochemist",
    lat: 3.1341,
    lng: 35.9015,
    elevation: 685.2,
    heading: 310,
    battery: 18,
    lastSeen: "14s ago",
    isActive: true,
    sosAlert: false,
  },
  {
    id: "geo-004",
    name: "Sarah Chen",
    role: "Geophysics Operator",
    lat: 3.1198,
    lng: 35.8872,
    elevation: 604.1,
    heading: 90,
    battery: 92,
    lastSeen: "4m ago",
    isActive: false,
    sosAlert: false,
  },
];

export default function TelemetryPage() {
  const [geologists, setGeologists] = useState<GeologistLiveStatus[]>(initialGeologists);
  const [ticketStatus, setTicketStatus] = useState<string>("Ready (Token TTL 30s)");
  const [isSimulating, setIsSimulating] = useState(true);

  // Live telemetry pulse simulation
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setGeologists((prev) =>
        prev.map((g) => {
          if (!g.isActive) return g;
          const jitterLat = (Math.random() - 0.5) * 0.0002;
          const jitterLng = (Math.random() - 0.5) * 0.0002;
          const newHeading = (g.heading + Math.floor(Math.random() * 10 - 5) + 360) % 360;
          return {
            ...g,
            lat: g.lat + jitterLat,
            lng: g.lng + jitterLng,
            heading: newHeading,
            lastSeen: "1s ago",
          };
        })
      );
    }, 2500);

    return () => clearInterval(interval);
  }, [isSimulating]);

  const toggleEmergency = (id: string) => {
    setGeologists((prev) =>
      prev.map((g) => (g.id === id ? { ...g, sosAlert: !g.sosAlert } : g))
    );
  };

  const activeCount = geologists.filter((g) => g.isActive).length;
  const emergencyCount = geologists.filter((g) => g.sosAlert).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Live Field Telemetry & Safety
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Sub-second bidirectional SSE / Connect-Go breadcrumbs with single-use ticket auth.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant={isSimulating ? "primary" : "outline"}
            size="sm"
            onClick={() => setIsSimulating(!isSimulating)}
            className="flex items-center space-x-1"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSimulating ? "animate-spin" : ""}`} />
            <span>{isSimulating ? "Streaming Live" : "Stream Paused"}</span>
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--foreground-muted)]">Active Traverses</span>
            <Radio className="h-4 w-4 text-emerald-500 animate-pulse" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono">
            {activeCount} / {geologists.length}
          </div>
          <div className="text-[11px] text-[var(--foreground-muted)] mt-1">
            Ring buffer 30m window
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--foreground-muted)]">Stream Handshake</span>
            <Signal className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-base font-semibold font-mono text-emerald-500">
            CONNECT_OK
          </div>
          <div className="text-[11px] text-[var(--foreground-muted)] mt-1">{ticketStatus}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--foreground-muted)]">Safety Monitored</span>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-500">
            {emergencyCount > 0 ? `${emergencyCount} SOS ACTIVE` : "Normal"}
          </div>
          <div className="text-[11px] text-[var(--foreground-muted)] mt-1">
            Inactive member reaper active
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--foreground-muted)]">GPS Datum</span>
            <Navigation className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <div className="mt-2 text-base font-bold font-mono">WGS 84 PointZ</div>
          <div className="text-[11px] text-[var(--foreground-muted)] mt-1">
            Precision: ±2.4m RMS
          </div>
        </Card>
      </div>

      {/* Geologists Telemetry Table */}
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <Radio className="h-4 w-4 text-[var(--primary)]" />
            <span>Field Personnel Telemetry Stream</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Live location vectors, azimuth headings, and battery diagnostics broadcast over Connect-Go streaming.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Geologist</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Live Coordinate (WGS84)</TableHead>
                <TableHead>Elevation</TableHead>
                <TableHead>Heading</TableHead>
                <TableHead>Battery</TableHead>
                <TableHead>Radio Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {geologists.map((g) => (
                <TableRow key={g.id} className={g.sosAlert ? "bg-red-500/10" : ""}>
                  <TableCell className="font-medium text-xs">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          g.sosAlert
                            ? "bg-red-500 animate-ping"
                            : g.isActive
                            ? "bg-emerald-500"
                            : "bg-zinc-500"
                        }`}
                      />
                      <span>{g.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-[var(--foreground-muted)]">
                    {g.role}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {g.lat.toFixed(5)}°N, {g.lng.toFixed(5)}°E
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {g.elevation.toFixed(1)} m
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    <div className="flex items-center space-x-1">
                      <Navigation
                        className="h-3.5 w-3.5 text-blue-500 transform"
                        style={{ transform: `rotate(${g.heading}deg)` }}
                      />
                      <span>{String(g.heading).padStart(3, "0")}°</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    <div className="flex items-center space-x-1">
                      <Battery
                        className={`h-3.5 w-3.5 ${
                          g.battery < 20
                            ? "text-red-500"
                            : g.battery < 50
                            ? "text-amber-500"
                            : "text-emerald-500"
                        }`}
                      />
                      <span>{g.battery}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        g.sosAlert ? "destructive" : g.isActive ? "success" : "default"
                      }
                    >
                      {g.sosAlert ? "SOS DISTRESS" : g.isActive ? `ONLINE (${g.lastSeen})` : "RADIO SILENCE"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={g.sosAlert ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => toggleEmergency(g.id)}
                      className="text-xs py-1 h-7"
                    >
                      {g.sosAlert ? "Clear SOS" : "Trigger SOS"}
                    </Button>
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
