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
} from "lucide-react";
import { GeoQuerryLogo } from "@/components/icons/GeoQuerryLogo";
import { authClient } from "@/lib/auth/client";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = isSignUp
      ? await authClient.signUp.email({ email, password, name: fullName })
      : await authClient.signIn.email({ email, password });

    if (authError) {
      setError(authError.message || "Authentication failed. Please check credentials.");
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  };

  const handleNeonOAuth = async () => {
    setError(null);
    setLoading(true);

    const { error: socialError } = await authClient.signIn.social({
      provider: "google",
      callbackURL: redirect,
    });

    if (socialError) {
      setError(socialError.message || "Neon OAuth initialization failed.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full space-y-8 relative z-10">
      {/* Header Branding */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-blue-600/15 border border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/10">
          <GeoQuerryLogo className="w-8 h-8" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight font-mono">
          Geo<span className="text-blue-400">Querry</span>
        </h1>
        <p className="text-xs text-zinc-400">
          {isSignUp ? "Create your geological survey account" : "Sign in to access GIS field mapping & project datasets"}
        </p>
      </div>

      {/* Main Card */}
      <div className="p-8 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-2xl backdrop-blur-md space-y-6">
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Direct Neon Auth / OAuth Button */}
        <button
          type="button"
          onClick={handleNeonOAuth}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-emerald-500/30 hover:border-emerald-500/60 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm group disabled:opacity-60"
        >
          <Database className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          Continue with Neon Auth (Google / OAuth)
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px bg-zinc-800 flex-1" />
          <span className="text-[10px] text-zinc-500 uppercase font-mono">or email credentials</span>
          <div className="h-px bg-zinc-800 flex-1" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-blue-500"
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
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-blue-500"
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
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-blue-500"
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
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isSignUp ? "Create Account & Onboard" : "Sign In to GeoQuerry"}
          </button>
        </form>

        {/* Toggle between Sign in and Sign up */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-blue-400 hover:underline font-semibold"
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
      {/* Background Decorative Gradient Blobs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 w-[350px] h-[350px] bg-emerald-600/5 blur-[100px] rounded-full pointer-events-none" />

      <Suspense
        fallback={
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
