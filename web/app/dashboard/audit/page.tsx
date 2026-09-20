"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Search,
  Download,
  ShieldCheck,
  Code2,
  X,
  Filter,
} from "lucide-react";

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  ip: string;
  timestamp: string;
  details: Record<string, any>;
}

const initialAuditEntries: AuditEntry[] = [
  {
    id: "evt-001",
    actor: "austin@geoquerry.com",
    action: "dataset.quarantined",
    targetType: "gis_dataset",
    targetId: "Turkana_Aeromagnetic_Grid_v2.tif",
    ip: "102.219.208.14",
    timestamp: "2026-09-20 21:45:10",
    details: {
      byte_size: 260465664,
      crs: "EPSG:32637",
      r2_key: "quarantine/org-1/proj-1/ds-001.tif",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
  },
  {
    id: "evt-002",
    actor: "elena.rostova@exploration.org",
    action: "payment.settled",
    targetType: "payment_transaction",
    targetId: "QKH79X82LJ",
    ip: "41.90.180.2",
    timestamp: "2026-09-20 20:12:00",
    details: {
      provider: "mpesa",
      amount_minor_units: 1937000,
      currency: "KES",
      phone: "254712345678",
      reconciled_via: "river_worker",
    },
  },
  {
    id: "evt-003",
    actor: "austin@geoquerry.com",
    action: "user.role_elevated",
    targetType: "organization_membership",
    targetId: "elena.rostova@exploration.org",
    ip: "102.219.208.14",
    timestamp: "2026-09-20 18:30:25",
    details: {
      previous_role: "geologist",
      new_role: "admin",
      sudo_assertion_id: "sudo_4920f18a",
    },
  },
  {
    id: "evt-004",
    actor: "e.kiprono@turkanamining.co.ke",
    action: "station.created",
    targetType: "geological_station",
    targetId: "STN-003",
    ip: "197.232.88.5",
    timestamp: "2026-09-20 16:04:12",
    details: {
      lithology: "Mylonitic Gneiss",
      strike: 10,
      dip: 45,
      coordinates: [35.9015, 3.1341, 685.2],
      sync_mode: "lww_postgis",
    },
  },
];

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>(initialAuditEntries);
  const [search, setSearch] = useState("");
  const [activeInspector, setActiveInspector] = useState<AuditEntry | null>(null);

  const filtered = entries.filter(
    (e) =>
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      e.actor.toLowerCase().includes(search.toLowerCase()) ||
      e.targetId.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportComplianceCSV = () => {
    const headers = ["Event ID", "Timestamp", "Actor", "Action", "Target Type", "Target ID", "IP Address"];
    const rows = entries.map((e) => [
      e.id,
      e.timestamp,
      e.actor,
      e.action,
      e.targetType,
      e.targetId,
      e.ip,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `geoquerry_audit_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Compliance & Audit Ledger
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Append-only tamper-evident event log satisfying JORC Code & NI 43-101 chain-of-custody.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportComplianceCSV}
            className="flex items-center space-x-1"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Compliance CSV</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--foreground-muted)]" />
          <Input
            placeholder="Search action, actor, target ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center space-x-2 text-xs text-[var(--foreground-muted)] sm:ml-auto">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Cryptographically Sealed</span>
          <span className="text-[var(--border)]">|</span>
          <span>{filtered.length} logged events</span>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <FileText className="h-4 w-4 text-[var(--primary)]" />
            <span>Audit Trail Ledger</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Every database write, role transition, payment settlement, and spatial ingestion event recorded with immutable timestamps.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp (UTC)</TableHead>
                <TableHead>Actor Principal</TableHead>
                <TableHead>Event Action</TableHead>
                <TableHead>Target Entity</TableHead>
                <TableHead>Client IP</TableHead>
                <TableHead className="text-right">Inspection</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                    {e.timestamp}
                  </TableCell>
                  <TableCell className="font-medium text-xs">{e.actor}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        e.action.startsWith("user.")
                          ? "warning"
                          : e.action.startsWith("payment.")
                          ? "success"
                          : "default"
                      }
                      className="font-mono text-[10px]"
                    >
                      {e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                    {e.targetId}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                    {e.ip}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveInspector(e)}
                      className="text-xs py-1 h-7 flex items-center space-x-1"
                    >
                      <Code2 className="h-3 w-3" />
                      <span>Details</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* JSON Inspector Modal */}
      {activeInspector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center space-x-2">
                <Code2 className="h-5 w-5 text-[var(--primary)]" />
                <h3 className="font-semibold text-lg">Event Payload Inspector</h3>
              </div>
              <button
                onClick={() => setActiveInspector(null)}
                className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 text-[var(--foreground-muted)]">
                <div>
                  <span className="font-medium">Event ID:</span>{" "}
                  <span className="font-mono text-[var(--foreground)]">{activeInspector.id}</span>
                </div>
                <div>
                  <span className="font-medium">Action:</span>{" "}
                  <span className="font-mono text-[var(--primary)]">{activeInspector.action}</span>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 overflow-x-auto">
                <pre className="font-mono text-[11px] text-zinc-300 leading-relaxed">
                  {JSON.stringify(activeInspector.details, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border)]">
              <Button size="sm" onClick={() => setActiveInspector(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
