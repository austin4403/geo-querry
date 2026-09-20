"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Compass, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("chief.geologist@geoquerry.local");
  const [userId, setUserId] = useState("usr_geologist_101");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, userId }),
      });

      if (!res.ok) {
        throw new Error("Failed to sign in");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[var(--background)]">
      <Card className="w-full max-w-md border-[var(--border)] bg-[var(--surface-card)] shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] text-white">
            <Compass className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">GeoQuerry Sign In</CardTitle>
          <CardDescription>
            Enter your credentials to access your tenant exploration workspace.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[var(--status-destructive-border)] bg-[var(--status-destructive-bg)] p-3 text-xs text-[var(--status-destructive-fg)]"
              >
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-[var(--foreground)]">
                Geologist Email
              </label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="geologist@exploration.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="userId" className="text-xs font-semibold text-[var(--foreground)]">
                Identity Identifier
              </label>
              <Input
                id="userId"
                type="text"
                required
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="usr_..."
              />
            </div>

            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground-muted)] flex items-start space-x-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                Browser session issues Ed25519 asymmetric internal assertion tokens to Go core.
                Zero credentials leaked to client.
              </span>
            </div>

            <Button type="submit" className="w-full" isLoading={isLoading}>
              Sign In to Workstation
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
