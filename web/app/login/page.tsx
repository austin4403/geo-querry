"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock,
  Mail,
  Loader2,
  Eye,
  EyeOff,
  User,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Radio,
  Info,
} from "lucide-react";
import { GeoQuerryLogo } from "@/components/icons/GeoQuerryLogo";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  const navigateToTarget = (url: string) => {
    window.location.href = url;
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);
    setLoading(true);

    try {
      const res = isSignUp
        ? await authClient.signUp.email({ email, password, name: fullName })
        : await authClient.signIn.email({ email, password });

      if (res?.error) {
        setError(res.error.message || "Authentication failed. Please check your credentials.");
        setLoading(false);
        return;
      }

      navigateToTarget(redirect);
    } catch (err: unknown) {
      console.warn("[Email Auth] Error:", err);
      try {
        const fallback = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (fallback.ok) {
          navigateToTarget(redirect);
          return;
        }
      } catch {
        // ignore
      }
      setError(err instanceof Error ? err.message : "Authentication failed.");
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "github" = "google") => {
    setError(null);
    setInfoNotice(null);
    setLoading(true);

    try {
      // Clear any pre-existing local session so the browser does not default into an old account
      await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => {});

      const absoluteCallback = typeof window !== "undefined"
        ? `${window.location.origin}${redirect}`
        : redirect;

      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          callbackURL: absoluteCallback,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (provider === "github" && (data.code === "PROVIDER_NOT_SUPPORTED" || data.error?.includes("not supported"))) {
          setInfoNotice(
            "GitHub OAuth requires a Client ID & Secret configured in the Neon Console (Auth → OAuth Providers). Please sign in using Google or Email credentials for instant access."
          );
          setLoading(false);
          return;
        }
        throw new Error(data.message || data.error || "Failed to initialize social sign-in");
      }

      if (data.url) {
        // Redirect browser directly to the external Google / OAuth consent screen
        window.location.href = data.url;
        return;
      }

      throw new Error("No authorization URL returned by OAuth provider");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "OAuth provider failed to respond.");
      setLoading(false);
    }
  };

  const handlePersonaLogin = async (personaEmail: string, personaPass?: string) => {
    setEmail(personaEmail);
    setError(null);
    setInfoNotice(null);
    setLoading(true);

    const defaultPass = personaEmail.includes("field") ? "FieldSurveyor2026!" : "GeoQuerryPassword123!";
    const pass = personaPass || defaultPass;
    setPassword(pass);

    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: personaEmail, password: pass }),
      });

      if (!res.ok) {
        throw new Error("Failed to sign in as persona");
      }

      navigateToTarget(redirect);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Persona switch failed");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full space-y-6 relative z-10">
      {/* Header Branding */}
      <div className="text-center space-y-2">
        <Link href="/" className="inline-flex items-center space-x-2 focus-visible:ring-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary)] text-white shadow-sm">
            <span className="text-sm font-black tracking-tighter">GQ</span>
          </div>
          <span className="text-2xl font-bold tracking-wide text-[var(--foreground)]">GeoQuerry</span>
        </Link>
        <div className="flex items-center justify-center space-x-2 pt-1">
          <Badge variant="outline" className="text-[11px] font-mono">
            v1.0 Core
          </Badge>
          <span className="text-xs text-[var(--foreground-muted)]">
            {isSignUp ? "Survey Account Provisioning" : "Exploration Workstation Access"}
          </span>
        </div>
      </div>

      {/* Main Workstation Auth Card */}
      <Card className="border border-[var(--border)] bg-[var(--surface-card)] shadow-lg backdrop-blur-sm">
        <CardHeader className="p-6 pb-4 border-b border-[var(--border)]">
          <CardTitle className="text-lg font-bold text-[var(--foreground)]">
            {isSignUp ? "Create Survey Account" : "Sign In to Workspace"}
          </CardTitle>
          <CardDescription className="text-xs text-[var(--foreground-muted)]">
            {isSignUp
              ? "Register a verified exploration identity for PostGIS field mapping"
              : "Access spatial concessions, structural stations, and personnel telemetry"}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-md bg-[var(--status-destructive-bg)] border border-[var(--status-destructive-border)] text-[var(--status-destructive-fg)] text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-tight">{error}</span>
            </div>
          )}

          {infoNotice && (
            <div className="p-3 rounded-md bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] text-[var(--status-warning-fg)] text-xs flex items-start space-x-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-tight">{infoNotice}</span>
            </div>
          )}

          {/* Social Providers (Google & GitHub) */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => handleOAuth("google")}
              className="w-full flex items-center justify-center space-x-2 h-9 text-xs"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.8z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
                />
              </svg>
              <span>Google</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => handleOAuth("github")}
              className="w-full flex items-center justify-center space-x-2 h-9 text-xs"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>GitHub</span>
            </Button>
          </div>

          {/* Fast Persona Switchers */}
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                Fast Test Personas
              </span>
              <span className="text-[10px] text-[var(--foreground-muted)] font-mono">1-click switch</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => handlePersonaLogin("geologist@geoquerry.com", "GeoQuerryPassword123!")}
                className="flex items-center space-x-2 p-2 rounded border border-[var(--border)] bg-[var(--surface-card)] hover:border-[var(--primary)] text-left transition-colors cursor-pointer disabled:opacity-50"
              >
                <UserCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--foreground)] truncate">Chief Geologist</div>
                  <div className="text-[10px] text-[var(--foreground-muted)] truncate">Admin / Owner</div>
                </div>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => handlePersonaLogin("field.geologist@geoquerry.com", "FieldSurveyor2026!")}
                className="flex items-center space-x-2 p-2 rounded border border-[var(--border)] bg-[var(--surface-card)] hover:border-[var(--primary)] text-left transition-colors cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--foreground)] truncate">Field Surveyor</div>
                  <div className="text-[10px] text-[var(--foreground-muted)] truncate">Telemetry & Sync</div>
                </div>
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center space-x-2">
            <div className="h-px bg-[var(--border)] flex-1" />
            <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-mono">
              or email credentials
            </span>
            <div className="h-px bg-[var(--border)] flex-1" />
          </div>

          {/* Email & Password Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--foreground)]">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-[var(--foreground-muted)] absolute left-3 top-3 pointer-events-none" />
                  <Input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Austin Odhiambo"
                    className="pl-9 h-10 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--foreground)]">Work Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[var(--foreground-muted)] absolute left-3 top-3 pointer-events-none" />
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="geologist@miningcorp.com"
                  className="pl-9 h-10 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--foreground)]">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[var(--foreground-muted)] absolute left-3 top-3 pointer-events-none" />
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10 h-10 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors p-1"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="w-full h-10 text-xs font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : isSignUp ? (
                "Create Account & Onboard"
              ) : (
                "Sign In with Credentials"
              )}
            </Button>
          </form>

          {/* Toggle Sign in / Sign up */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setInfoNotice(null);
              }}
              className="text-xs text-[var(--primary)] hover:underline font-medium cursor-pointer"
            >
              {isSignUp ? "Already have a workstation account? Sign In" : "Need an exploration account? Sign Up"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* CRS / Workstation Metadata Footer */}
      <div className="flex items-center justify-between text-[11px] text-[var(--foreground-muted)] px-2 font-mono">
        <div className="flex items-center space-x-1.5">
          <Radio className="h-3 w-3 text-emerald-500 animate-pulse" />
          <span>PostGIS / ConnectRPC</span>
        </div>
        <span>EPSG:32637 (UTM 37N)</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full bg-[var(--background)] text-[var(--foreground)] flex flex-col justify-between items-center px-4 py-6 relative">
      {/* Top Bar with Theme Toggle */}
      <header className="w-full max-w-5xl flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2 font-bold tracking-tight text-[var(--foreground)] focus-visible:ring-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
            <span className="text-xs font-black">GQ</span>
          </div>
          <span className="text-sm font-semibold tracking-wide hidden sm:inline">GeoQuerry</span>
        </Link>
        <div className="flex items-center space-x-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Centered Login Card */}
      <main className="my-auto w-full flex justify-center py-6">
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl text-center text-xs text-[var(--foreground-muted)] py-2">
        <p>GeoQuerry Mineral Exploration Workstation • Strict Geodesic PostGIS Engine</p>
      </footer>
    </div>
  );
}
