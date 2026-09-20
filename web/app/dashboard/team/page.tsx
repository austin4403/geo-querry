import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Shield } from "lucide-react";

export default function TeamPage() {
  const members = [
    {
      id: "usr_01",
      name: "Austin Miller",
      email: "austin@geoquerry.com",
      role: "owner",
      mfa: "TOTP_ENABLED",
      joined: "2026-01-10",
    },
    {
      id: "usr_02",
      name: "Sarah Kimani",
      email: "sarah.k@turkanagold.com",
      role: "admin",
      mfa: "TOTP_ENABLED",
      joined: "2026-02-14",
    },
    {
      id: "usr_03",
      name: "David Ochieng",
      email: "david.o@turkanagold.com",
      role: "geologist",
      mfa: "NOT_SET",
      joined: "2026-03-01",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Team Members & Tenancy RBAC
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Hierarchical anti-escalation enforcement: Owner &gt; Admin &gt; Geologist &gt; Viewer.
          </p>
        </div>
        <Button size="sm" className="flex items-center space-x-1.5">
          <UserPlus className="h-4 w-4" />
          <span>Invite Member</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <Users className="h-4 w-4 text-[var(--primary)]" />
            <span>Organization Members</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Role elevation strictly requires active sudo verification within 15 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tenant Role</TableHead>
                <TableHead>MFA Security</TableHead>
                <TableHead>Joined Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs font-semibold text-[var(--primary)]">
                    {m.id}
                  </TableCell>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-[var(--foreground-muted)]">{m.email}</TableCell>
                  <TableCell>
                    <Badge variant={m.role === "owner" ? "warning" : "default"}>
                      {m.role.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.mfa === "TOTP_ENABLED" ? "success" : "destructive"}>
                      <Shield className="h-3 w-3 mr-1 inline" />
                      {m.mfa}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{m.joined}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
