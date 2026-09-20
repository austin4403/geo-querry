import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, ShieldCheck } from "lucide-react";

export default function AuditPage() {
  const auditEntries = [
    {
      id: "AUD-10023",
      action: "auth.sudo_mode_granted",
      actorId: "usr_01 (Austin Miller)",
      ipAddress: "192.168.100.237",
      timestamp: "2026-09-20 19:12:04 UTC",
      status: "SUCCESS",
    },
    {
      id: "AUD-10022",
      action: "tenant.membership_role_updated",
      actorId: "usr_01 (Austin Miller)",
      ipAddress: "192.168.100.237",
      timestamp: "2026-09-20 18:45:12 UTC",
      status: "SUCCESS",
    },
    {
      id: "AUD-10021",
      action: "gis.dataset_quarantine_enqueued",
      actorId: "usr_02 (Sarah Kimani)",
      ipAddress: "197.232.14.88",
      timestamp: "2026-09-20 17:30:00 UTC",
      status: "SUCCESS",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
          Immutable Audit Event Ledger
        </h1>
        <p className="text-xs text-[var(--foreground-muted)]">
          Append-only compliance audit trail supporting NI 43-101 / JORC exploration governance.
        </p>
      </div>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <History className="h-4 w-4 text-[var(--primary)]" />
            <span>Security &amp; Data Operations Log</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Events are immutable; rows cannot be updated or deleted by any application role.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event ID</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Client IP</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditEntries.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[var(--primary)]">
                    {a.id}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[var(--foreground)]">
                    {a.action}
                  </TableCell>
                  <TableCell className="text-xs">{a.actorId}</TableCell>
                  <TableCell className="font-mono text-xs">{a.ipAddress}</TableCell>
                  <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                    {a.timestamp}
                  </TableCell>
                  <TableCell>
                    <Badge variant="success">
                      <ShieldCheck className="h-3 w-3 mr-1 inline" />
                      {a.status}
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
