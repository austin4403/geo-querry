import React from "react";
import Link from "next/link";
import { TopNav } from "@/components/layout/top-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/session";
import {
  Compass,
  MapPin,
  Layers,
  Activity,
  ShieldCheck,
  Server,
  Zap,
} from "lucide-react";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav user={user} />

      <main id="main-content" className="flex-1 px-4 py-8 sm:px-8 max-w-7xl mx-auto w-full">
        {/* Workstation Header */}
        <section className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[var(--border)] pb-6">
          <div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-blue-500 font-mono">
                SYSTEM OPERATIONAL
              </Badge>
              <span className="text-xs text-[var(--foreground-muted)]">
                Go Core + Neon PostGIS + Cloudflare Edge
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl text-[var(--foreground)]">
              Geological Survey & Spatial Intelligence Platform
            </h1>
            <p className="mt-1 text-base text-[var(--foreground-muted)] max-w-3xl">
              Survey-grade exploration workstation supporting field sync, structural strike/dip
              observations, core-log petrophysics, and live personnel telemetry.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {user ? (
              <Link href="/dashboard">
                <Button size="lg" className="flex items-center space-x-2">
                  <Compass className="h-4 w-4" />
                  <span>Open Workstation</span>
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="lg" className="flex items-center space-x-2">
                  <Zap className="h-4 w-4" />
                  <span>Launch Workspace</span>
                </Button>
              </Link>
            )}
          </div>
        </section>

        {/* High-density Status Grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="flex items-center justify-between text-xs">
                <span>Active Tenancy</span>
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              </CardDescription>
              <CardTitle className="text-xl font-bold">Multi-Tenant RLS</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-[var(--foreground-muted)]">
              Strict isolation on <code className="text-[var(--primary)] font-mono">app.current_organization_id</code>.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="flex items-center justify-between text-xs">
                <span>Spatial Reference</span>
                <Layers className="h-4 w-4 text-blue-500" />
              </CardDescription>
              <CardTitle className="text-xl font-bold">EPSG:32637 (UTM)</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-[var(--foreground-muted)]">
              Hemisphere-specific PostGIS projection pipelines & zero distortion.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="flex items-center justify-between text-xs">
                <span>Telemetry Ingestion</span>
                <Activity className="h-4 w-4 text-amber-500" />
              </CardDescription>
              <CardTitle className="text-xl font-bold">Single-Use Tickets</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-[var(--foreground-muted)]">
              30s TTL tickets with monotonic sequence IDs and 30-min replay buffer.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="flex items-center justify-between text-xs">
                <span>Durable Queue</span>
                <Server className="h-4 w-4 text-purple-500" />
              </CardDescription>
              <CardTitle className="text-xl font-bold">River on Postgres</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-[var(--foreground-muted)]">
              Transactional jobs with lease locks and exponential backoff retry.
            </CardContent>
          </Card>
        </section>

        {/* Feature Bento Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Compass className="h-5 w-5 text-[var(--primary)]" />
                <span>Survey-Grade Geological Records</span>
              </CardTitle>
              <CardDescription>
                Tabular and spatial views designed for field geologists and exploration directors.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
                <h4 className="text-sm font-semibold mb-2">Compliance and Precision Standard</h4>
                <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
                  Report-generation workflows and templates supporting NI 43-101 or JORC preparation,
                  subject to qualified professional review and sign-off. Raw coordinates and source
                  CRS are permanently preserved immutable.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Link href="/dashboard/concessions">
                  <Button variant="secondary" size="sm">Explore Concessions</Button>
                </Link>
                <Link href="/dashboard/stations">
                  <Button variant="secondary" size="sm">Structural Stations</Button>
                </Link>
                <Link href="/dashboard/ingestion">
                  <Button variant="secondary" size="sm">GIS Quarantine Ingestion</Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-emerald-500" />
                <span>Offline-First Sync</span>
              </CardTitle>
              <CardDescription>
                Drift SQLite on mobile/desktop synchronizing to Go PostGIS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-[var(--foreground-muted)]">
              <p>
                • 90-day retention tombstone tracking.
              </p>
              <p>
                • Deduplicated UUID batching with server sequence cursors.
              </p>
              <p>
                • Automatic revision branching upon structural strike/dip conflicts.
              </p>
              <div className="pt-4">
                <Link href="/dashboard/telemetry">
                  <Button variant="outline" size="sm" className="w-full">
                    View Live Feed
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--foreground-muted)]">
        GeoQuerry © 2026. Built with Next.js 15 BFF, Go 1.23 ConnectRPC, Neon PostgreSQL & Cloudflare Pages.
      </footer>
    </div>
  );
}
