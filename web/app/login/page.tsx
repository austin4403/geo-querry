"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock,
  Mail,
  Loader2,
  Database,
  Eye,
  EyeOff,
  User,
  Zap,
  ShieldCheck,
  ArrowRight,
  UserCheck,
  CheckCircle2,
} from "lucide-react";
import { GeoQuerryLogo } from "@/components/icons/GeoQuerryLogo";
import { authClient } from "@/lib/auth/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("chief.geologist@geoquerry.local");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigateToTarget = (url: string) => {
    // Perform full navigation to ensure session cookies and headers are established
    window.location.href = url;
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = isSignUp
        ? await authClient.signUp.email({ email, password, name: fullName })
        : await authClient.signIn.email({ email, password });

      if (res?.error) {
        setError(res.error.message || "Authentication failed. Please check credentials.");
        setLoading(false);
        return;
      }

      navigateToTarget(redirect);
    } catch (err: unknown) {
      console.warn("[Email Auth] Error:", err);
      // Fallback directly to API endpoint if SDK encounters unexpected client errors
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
    setLoading(true);

    try {
      const res = await authClient.signIn.social({
        provider,
        callbackURL: redirect,
      });

      if (res?.error) {
        setError(res.error.message || "OAuth initialization failed.");
        setLoading(false);
        return;
      }

      // If Better Auth provided an external redirection URL (e.g. Google consent),
      // follow it; otherwise navigate directly to the target dashboard.
      const dataUrl = (res?.data as { url?: string } | undefined)?.url;
      navigateToTarget(dataUrl || redirect);
    } catch (err: unknown) {
      console.warn("[OAuth] Direct call error, running fallback:", err);
      try {
        const fallbackRes = await fetch("/api/auth/sign-in/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, callbackURL: redirect }),
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          navigateToTarget(data.url || data.redirect || redirect);
          return;
        }
      } catch {
        // ignore
      }
      setError(err instanceof Error ? err.message : "Neon OAuth failed to respond.");
      setLoading(false);
    }
  };

  const handlePersonaLogin = async (personaEmail: string) => {
    setEmail(personaEmail);
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: personaEmail }),
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
    <div className="max-w-md w-full space-y-8 relative z-10">
      {/* Header Branding */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10">
          <GeoQuerryLogo className="w-8 h-8" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight font-mono">
          Geo<span className="text-emerald-400">Querry</span>
        </h1>
        <p className="text-xs text-zinc-400">
          {isSignUp
            ? "Create your exploration account via Neon Auth"
            : "Sign in to access GIS field mapping & PostGIS survey datasets"}
        </p>
      </div>

      {/* Main Card */}
      <div className="p-8 rounded-3xl bg-zinc-900/95 border border-zinc-800 shadow-2xl backdrop-blur-md space-y-6">
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Primary 1-Click Neon Auth Action */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-[#00e599] hover:bg-[#00c984] text-zinc-950 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_25px_rgba(0,229,153,0.35)] group disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
            ) : (
              <Zap className="w-4 h-4 fill-zinc-950 text-zinc-950 group-hover:scale-110 transition-transform" />
            )}
            <span>{loading ? "Authenticating with Neon Auth..." : "Continue with Neon Auth"}</span>
            {!loading && <ArrowRight className="w-4 h-4 ml-auto opacity-70" />}
          </button>
          <p className="text-[11px] text-center text-zinc-400">
            One-click passwordless sign-in with your active Neon workspace identity
          </p>
        </div>

        {/* Social Providers (Google & GitHub) */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={loading}
            className="py-2.5 px-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
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
            Google
          </button>

          <button
            type="button"
            onClick={() => handleOAuth("github")}
            disabled={loading}
            className="py-2.5 px-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            GitHub
          </button>
        </div>

        {/* Fast Persona Switchers */}
        <div className="pt-2 border-t border-zinc-800/80 space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
            <span>Fast Test Personas:</span>
            <span className="text-[10px] text-zinc-500">1-click switch</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handlePersonaLogin("chief.geologist@geoquerry.local")}
              className="flex items-center gap-2 p-2 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 text-left transition-colors group cursor-pointer disabled:opacity-60"
            >
              <UserCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-white truncate group-hover:text-emerald-400">Chief Geologist</div>
                <div className="text-[10px] text-zinc-400 truncate">Admin / Owner</div>
              </div>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handlePersonaLogin("field.surveyor@geoquerry.local")}
              className="flex items-center gap-2 p-2 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-blue-500/50 text-left transition-colors group cursor-pointer disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-white truncate group-hover:text-blue-400">Field Surveyor</div>
                <div className="text-[10px] text-zinc-400 truncate">Telemetry & Sync</div>
              </div>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px bg-zinc-800 flex-1" />
          <span className="text-[10px] text-zinc-500 uppercase font-mono">or email credentials</span>
          <div className="h-px bg-zinc-800 flex-1" />
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Austin Odhiambo"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Work Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="geologist@miningcorp.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-60 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isSignUp ? "Create Account & Onboard" : "Sign In with Credentials"}
          </button>
        </form>

        {/* Security Guarantee Badge */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400 flex items-start space-x-2.5">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <span className="text-[11px] leading-relaxed">
            Managed by <strong className="text-zinc-200 font-medium">Neon Auth</strong>. Zero credentials exposed to client. Sessions issue asymmetric Ed25519 tokens to the Go PostGIS core.
          </span>
        </div>

        {/* Toggle between Sign in and Sign up */}
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-emerald-400 hover:underline font-semibold cursor-pointer"
          >
            {isSignUp ? "Already have an account? Sign In" : "Need an exploration account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full bg-zinc-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background Decorative Ambient Blobs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 w-[350px] h-[350px] bg-blue-600/5 blur-[100px] rounded-full pointer-events-none" />

      <Suspense
        fallback={
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
