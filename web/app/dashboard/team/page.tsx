"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  Lock,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "geologist" | "viewer";
  mfaEnabled: boolean;
  joinedAt: string;
}

const initialMembers: TeamMember[] = [
  {
    id: "user-001",
    name: "Dr. Austin Miller",
    email: "austin@geoquerry.com",
    role: "owner",
    mfaEnabled: true,
    joinedAt: "2026-01-10",
  },
  {
    id: "user-002",
    name: "Elena Rostova",
    email: "elena.rostova@exploration.org",
    role: "admin",
    mfaEnabled: true,
    joinedAt: "2026-02-14",
  },
  {
    id: "user-003",
    name: "Emmanuel Kiprono",
    email: "e.kiprono@turkanamining.co.ke",
    role: "geologist",
    mfaEnabled: true,
    joinedAt: "2026-03-01",
  },
  {
    id: "user-004",
    name: "Sarah Chen",
    email: "schen@globalgeoconsult.com",
    role: "geologist",
    mfaEnabled: false,
    joinedAt: "2026-05-19",
  },
  {
    id: "user-005",
    name: "Audit Officer David",
    email: "compliance@ministryofmining.go.ke",
    role: "viewer",
    mfaEnabled: true,
    joinedAt: "2026-07-02",
  },
];

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSudoOpen, setIsSudoOpen] = useState(false);
  const [targetMember, setTargetMember] = useState<TeamMember | null>(null);

  // Form State
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "geologist" | "viewer">("geologist");

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const newMember: TeamMember = {
      id: `user-${Date.now().toString().slice(-4)}`,
      name: name || "Invited Geoscientist",
      email,
      role,
      mfaEnabled: false,
      joinedAt: "Pending acceptance",
    };

    setMembers([...members, newMember]);
    setIsInviteOpen(false);
    setEmail("");
    setName("");
  };

  const openSudoMode = (member: TeamMember) => {
    setTargetMember(member);
    setIsSudoOpen(true);
  };

  const handlePromoteRole = () => {
    if (!targetMember) return;
    setMembers((prev) =>
      prev.map((m) =>
        m.id === targetMember.id
          ? { ...m, role: m.role === "viewer" ? "geologist" : "admin" }
          : m
      )
    );
    setIsSudoOpen(false);
    setTargetMember(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Organization Team & Roles
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Hierarchical RBAC (Owner &gt; Admin &gt; Geologist &gt; Viewer) with sudo-verified elevation.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            onClick={() => setIsInviteOpen(true)}
            className="flex items-center space-x-1"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Invite Team Member</span>
          </Button>
        </div>
      </div>

      {/* Sudo Mode Security Notice */}
      <Card className="border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-center space-x-2">
          <Shield className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-xs text-amber-600 dark:text-amber-400">
            Sudo Mode Protected (ADR 0001 / ADR 0005)
          </span>
        </div>
        <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
          Modifying member roles or removing exploration project collaborators requires step-up credential verification. Sudo assertions expire after 10 minutes.
        </p>
      </Card>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <Users className="h-4 w-4 text-[var(--primary)]" />
            <span>Active Team Directory</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Member accounts scoped strictly to tenant organization boundary with PostgreSQL RLS.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Collaborator Name</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>Assigned Role</TableHead>
                <TableHead>MFA Enforced</TableHead>
                <TableHead>Member Since</TableHead>
                <TableHead className="text-right">Access Controls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium text-xs">{m.name}</TableCell>
                  <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                    {m.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        m.role === "owner"
                          ? "default"
                          : m.role === "admin"
                          ? "success"
                          : "outline"
                      }
                    >
                      {m.role.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1 text-xs">
                      {m.mfaEnabled ? (
                        <span className="text-emerald-500 flex items-center space-x-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="text-amber-500 flex items-center space-x-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span>Required</span>
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-[var(--foreground-muted)]">
                    {m.joinedAt}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.role !== "owner" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openSudoMode(m)}
                        className="text-xs py-1 h-7"
                      >
                        Elevate / Modify
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invite Member Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5 text-[var(--primary)]" />
                <h3 className="font-semibold text-lg">Invite Organization Member</h3>
              </div>
              <button
                onClick={() => setIsInviteOpen(false)}
                className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground-muted)]">Full Name</label>
                <Input
                  placeholder="e.g. Kipchoge Keino"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground-muted)]">Corporate Email</label>
                <Input
                  type="email"
                  placeholder="geoscientist@mining.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground-muted)]">Role Permission Tier</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--foreground)]"
                >
                  <option value="geologist">Geologist (Field Station Data Logging)</option>
                  <option value="admin">Administrator (Team & Billing Management)</option>
                  <option value="viewer">Viewer (Read-Only Exploration Reports)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsInviteOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Send Organization Invite
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sudo Mode Confirmation Modal */}
      {isSudoOpen && targetMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center space-x-2">
                <Lock className="h-5 w-5 text-amber-500" />
                <h3 className="font-semibold text-lg">Sudo Elevation Confirmation</h3>
              </div>
              <button
                onClick={() => setIsSudoOpen(false)}
                className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
              You are about to modify the role for{" "}
              <span className="font-bold text-[var(--foreground)]">{targetMember.name}</span> (
              {targetMember.email}). This change will immediately alter their database RLS permissions.
            </p>

            <div className="p-3 bg-[var(--background)] rounded-lg border border-[var(--border)] space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Current Role:</span>
                <span className="font-mono font-semibold">{targetMember.role.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">New Role:</span>
                <span className="font-mono font-semibold text-emerald-500">
                  {targetMember.role === "viewer" ? "GEOLOGIST" : "ADMIN"}
                </span>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-[var(--border)]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSudoOpen(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handlePromoteRole} className="bg-amber-600 hover:bg-amber-700 text-white">
                Authorize Sudo Elevation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
