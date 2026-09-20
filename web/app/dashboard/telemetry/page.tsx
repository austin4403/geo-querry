import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Activity, Radio } from "lucide-react";

export default function TelemetryPage() {
  const activePersonnel = [
    {
      id: "GEO-01",
      name: "Dr. Austin Miller",
      role: "Lead Geologist",
      lastSeen: "20s ago",
      battery: "88%",
      location: "35.8812° N, 14.4215° E",
      status: "TRANSMITTING",
    },
    {
      id: "GEO-02",
      name: "Elena Vance",
      role: "Field Structural Tech",
      lastSeen: "45s ago",
      battery: "94%",
      location: "35.8825° N, 14.4190° E",
      status: "TRANSMITTING",
    },
    {
      id: "GEO-03",
      name: "Marcus Chen",
      role: "Geochemist",
      lastSeen: "4m ago",
      battery: "62%",
      location: "35.8790° N, 14.4250° E",
      status: "SILENT",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-[var(--border)] pb-4">
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-emerald-500 flex items-center space-x-1">
            <Radio className="h-3 w-3 animate-pulse mr-1" />
            <span>CONNECT-GO SSE HUB ACTIVE</span>
          </Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mt-1 text-[var(--foreground)]">
          Live Field Telemetry & Safety Stream
        </h1>
        <p className="text-xs text-[var(--foreground-muted)]">
          Real-time GPS breadcrumbs with single-use tickets, 30s TTL, and memory-bounded ring buffer.
        </p>
      </div>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <Activity className="h-4 w-4 text-[var(--primary)]" />
            <span>Active Exploration Personnel</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Live updates fan out locklessly via Go telemetry hub to browser clients.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field ID</TableHead>
                <TableHead>Geologist Name</TableHead>
                <TableHead>Survey Role</TableHead>
                <TableHead>Last Heartbeat</TableHead>
                <TableHead>Device Battery</TableHead>
                <TableHead>WGS 84 Position</TableHead>
                <TableHead>Signal Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activePersonnel.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[var(--primary)]">
                    {p.id}
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.role}</TableCell>
                  <TableCell className="font-mono text-xs">{p.lastSeen}</TableCell>
                  <TableCell className="font-mono text-xs">{p.battery}</TableCell>
                  <TableCell className="font-mono text-xs">{p.location}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "TRANSMITTING" ? "success" : "warning"}>
                      {p.status}
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
