"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, ShieldCheck, ArrowRight, UserCheck, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("chief.geologist@geoquerry.local");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performLogin = async (targetEmail: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      if (!res.ok) {
        throw new Error("Failed to authenticate with Neon Auth");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Neon Auth failed to respond");
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(email);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[#09090b] text-[#f4f4f5]">
      {/* Background ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-[#00e599]/10 blur-[120px] rounded-full" />
      </div>

      <Card className="relative w-full max-w-md border-[#27272a] bg-[#121215] shadow-2xl backdrop-blur-md">
        <CardHeader className="text-center space-y-3 pb-4">
          {/* Neon Logo Badge */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00e599]/15 border border-[#00e599]/40 text-[#00e599] shadow-[0_0_25px_rgba(0,229,153,0.25)]">
            <Zap className="h-7 w-7 fill-[#00e599]" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <CardTitle className="text-2xl font-bold tracking-tight text-white">Neon Auth</CardTitle>
              <Badge variant="outline" className="border-[#00e599]/40 text-[#00e599] bg-[#00e599]/10 text-[10px] uppercase tracking-wider font-semibold">
                Active
              </Badge>
            </div>
            <CardDescription className="text-sm text-[#a1a1aa]">
              Single sign-on identity service for GeoQuerry PostGIS platform
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
            >
              {error}
            </div>
          )}

          {/* Primary 1-Click Neon Auth Action */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="primary"
              disabled={isLoading}
              onClick={() => performLogin(email)}
              className="w-full h-11 bg-[#00e599] hover:bg-[#00c984] text-[#09090b] font-semibold text-sm transition-all shadow-[0_0_20px_rgba(0,229,153,0.3)] flex items-center justify-center gap-2"
            >
              <Zap className="h-4 w-4 fill-current" />
              {isLoading ? "Authenticating with Neon..." : "Continue with Neon Auth"}
              <ArrowRight className="h-4 w-4 ml-auto opacity-70" />
            </Button>
            <p className="text-[11px] text-center text-[#71717a]">
              Instant passwordless sign-in with your active Neon workspace identity
            </p>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[#27272a]" />
            </div>
            <span className="relative bg-[#121215] px-3 text-[11px] uppercase tracking-wider text-[#71717a]">
              or specify email
            </span>
          </div>

          {/* Direct Email Form via Neon */}
          <form onSubmit={handleFormSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium text-[#d4d4d8] flex items-center gap-1.5">
                <span>Account Email</span>
              </label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="geologist@exploration.com"
                className="h-10 bg-[#18181b] border-[#27272a] text-white placeholder:text-[#52525b] focus:border-[#00e599] focus:ring-1 focus:ring-[#00e599]"
              />
            </div>

            <Button
              type="submit"
              variant="outline"
              disabled={isLoading}
              className="w-full h-9 border-[#27272a] hover:border-[#3f3f46] hover:bg-[#18181b] text-xs font-medium text-[#e4e4e7]"
            >
              Sign In via Neon Magic Link
            </Button>
          </form>

          {/* Quick Switch Persona Profiles */}
          <div className="pt-2 border-t border-[#27272a]/60 space-y-2">
            <div className="text-[11px] font-semibold text-[#a1a1aa] flex items-center justify-between">
              <span>Quick Test Personas:</span>
              <span className="text-[10px] text-[#71717a]">1-click switch</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = "chief.geologist@geoquerry.local";
                  setEmail(target);
                  performLogin(target);
                }}
                className="flex items-center gap-2 p-2 rounded-md bg-[#18181b] border border-[#27272a] hover:border-[#00e599]/50 text-left transition-colors group"
              >
                <UserCheck className="h-3.5 w-3.5 text-[#00e599] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-white truncate group-hover:text-[#00e599]">Chief Geologist</div>
                  <div className="text-[10px] text-[#71717a] truncate">Owner & Admin</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = "field.geologist@geoquerry.local";
                  setEmail(target);
                  performLogin(target);
                }}
                className="flex items-center gap-2 p-2 rounded-md bg-[#18181b] border border-[#27272a] hover:border-[#00e599]/50 text-left transition-colors group"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-white truncate group-hover:text-blue-300">Field Surveyor</div>
                  <div className="text-[10px] text-[#71717a] truncate">Telemetry & Sync</div>
                </div>
              </button>
            </div>
          </div>

          {/* Security Guarantee Notice */}
          <div className="rounded-lg border border-[#27272a] bg-[#18181b]/50 p-3 text-xs text-[#a1a1aa] flex items-start space-x-2.5">
            <ShieldCheck className="h-4 w-4 text-[#00e599] shrink-0 mt-0.5" />
            <span className="text-[11px] leading-relaxed">
              Managed by <strong className="text-white font-medium">Neon Auth</strong>. Sessions issue ephemeral Ed25519 cryptographic tokens to the Go PostGIS backend with zero credential exposure.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
