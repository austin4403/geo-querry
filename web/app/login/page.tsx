"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth/client";
import { Zap, ShieldCheck, ArrowRight, UserCheck, CheckCircle2, Lock, Mail, Github } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("chief.geologist@geoquerry.local");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<"quick" | "credentials">("quick");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (targetEmail: string, targetPassword?: string) => {
    setIsLoading(true);
    setError(null);

    const result = await authClient.signIn.email({
      email: targetEmail,
      password: targetPassword,
    });

    if (result.error) {
      setError(result.error.message);
      setIsLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSignIn(email, password);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[#09090b] text-[#f4f4f5]">
      {/* Background ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-[#00e599]/10 blur-[120px] rounded-full" />
      </div>

      <Card className="relative w-full max-w-md border-[#27272a] bg-[#121215] shadow-2xl backdrop-blur-md">
        <CardHeader className="text-center space-y-3 pb-3">
          {/* Neon Logo Badge */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00e599]/15 border border-[#00e599]/40 text-[#00e599] shadow-[0_0_25px_rgba(0,229,153,0.25)]">
            <Zap className="h-7 w-7 fill-[#00e599]" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <CardTitle className="text-2xl font-bold tracking-tight text-white">Neon Auth</CardTitle>
              <Badge variant="outline" className="border-[#00e599]/40 text-[#00e599] bg-[#00e599]/10 text-[10px] uppercase tracking-wider font-semibold">
                Connected
              </Badge>
            </div>
            <CardDescription className="text-sm text-[#a1a1aa]">
              Managed authentication in the Neon backend for apps and agents
            </CardDescription>
          </div>

          {/* Mode Switcher */}
          <div className="flex rounded-lg bg-[#18181b] p-1 border border-[#27272a] mt-2">
            <button
              type="button"
              onClick={() => setActiveTab("quick")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === "quick"
                  ? "bg-[#27272a] text-[#00e599] shadow-xs"
                  : "text-[#71717a] hover:text-[#a1a1aa]"
              }`}
            >
              1-Click Access
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("credentials")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === "credentials"
                  ? "bg-[#27272a] text-[#00e599] shadow-xs"
                  : "text-[#71717a] hover:text-[#a1a1aa]"
              }`}
            >
              Email & Password
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
            >
              {error}
            </div>
          )}

          {activeTab === "quick" ? (
            <div className="space-y-4">
              {/* Primary 1-Click Action */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="primary"
                  disabled={isLoading}
                  onClick={() => handleSignIn("chief.geologist@geoquerry.local")}
                  className="w-full h-11 bg-[#00e599] hover:bg-[#00c984] text-[#09090b] font-semibold text-sm transition-all shadow-[0_0_20px_rgba(0,229,153,0.3)] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Zap className="h-4 w-4 fill-current" />
                  {isLoading ? "Signing in with Neon..." : "Continue with Neon Auth"}
                  <ArrowRight className="h-4 w-4 ml-auto opacity-70" />
                </Button>
                <p className="text-[11px] text-center text-[#71717a]">
                  Instant access to your exploration tenant workspace
                </p>
              </div>

              {/* Social Login Buttons */}
              <div className="space-y-2">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[#27272a]" />
                  </div>
                  <span className="relative bg-[#121215] px-3 text-[10px] uppercase tracking-wider text-[#71717a]">
                    or connect via OAuth
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoading}
                    onClick={() => handleSignIn("github.user@geoquerry.local")}
                    className="h-9 border-[#27272a] hover:border-[#3f3f46] hover:bg-[#18181b] text-xs text-[#e4e4e7] flex items-center justify-center gap-2"
                  >
                    <Github className="h-3.5 w-3.5" />
                    GitHub
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoading}
                    onClick={() => handleSignIn("google.user@geoquerry.local")}
                    className="h-9 border-[#27272a] hover:border-[#3f3f46] hover:bg-[#18181b] text-xs text-[#e4e4e7] flex items-center justify-center gap-2"
                  >
                    <Mail className="h-3.5 w-3.5 text-red-400" />
                    Google
                  </Button>
                </div>
              </div>

              {/* Personas */}
              <div className="pt-2 border-t border-[#27272a]/60 space-y-2">
                <div className="text-[11px] font-semibold text-[#a1a1aa] flex items-center justify-between">
                  <span>Fast Switch Workspace Role:</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSignIn("chief.geologist@geoquerry.local")}
                    className="flex items-center gap-2 p-2 rounded-md bg-[#18181b] border border-[#27272a] hover:border-[#00e599]/50 text-left transition-colors cursor-pointer group"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-[#00e599] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-white truncate group-hover:text-[#00e599]">Chief Geologist</div>
                      <div className="text-[10px] text-[#71717a] truncate">Tenant Admin</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSignIn("field.geologist@geoquerry.local")}
                    className="flex items-center gap-2 p-2 rounded-md bg-[#18181b] border border-[#27272a] hover:border-[#00e599]/50 text-left transition-colors cursor-pointer group"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-white truncate group-hover:text-blue-300">Field Surveyor</div>
                      <div className="text-[10px] text-[#71717a] truncate">Telemetry & Sync</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCredentialsSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-medium text-[#d4d4d8] flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-[#71717a]" />
                  <span>Neon Account Email</span>
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

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-medium text-[#d4d4d8] flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#71717a]" />
                  <span>Password</span>
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="h-10 bg-[#18181b] border-[#27272a] text-white placeholder:text-[#52525b] focus:border-[#00e599] focus:ring-1 focus:ring-[#00e599]"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={isLoading}
                className="w-full h-10 bg-[#00e599] hover:bg-[#00c984] text-[#09090b] font-semibold text-xs mt-2"
              >
                {isLoading ? "Signing in..." : "Sign In to Neon Auth"}
              </Button>
            </form>
          )}

          {/* Neon Security Assurance Footer */}
          <div className="rounded-lg border border-[#27272a] bg-[#18181b]/50 p-3 text-xs text-[#a1a1aa] flex items-start space-x-2.5">
            <ShieldCheck className="h-4 w-4 text-[#00e599] shrink-0 mt-0.5" />
            <span className="text-[11px] leading-relaxed">
              <strong>Neon Database Auth:</strong> Auth schema (<code className="text-[#00e599]">neon_auth</code>) branches directly with PostGIS data branches, with mTLS Ed25519 token propagation to Go Core.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
