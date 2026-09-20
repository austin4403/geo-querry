"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Compass,
  MapPin,
  Layers,
  Activity,
  UploadCloud,
  Users,
  CreditCard,
  History,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: "Survey Workstation", href: "/dashboard", icon: Compass },
  { label: "Spatial Concessions", href: "/dashboard/concessions", icon: Layers },
  { label: "Outcrop Stations", href: "/dashboard/stations", icon: MapPin },
  { label: "Live Telemetry", href: "/dashboard/telemetry", icon: Activity },
  { label: "GIS Ingestion", href: "/dashboard/ingestion", icon: UploadCloud },
  { label: "Team & Tenancy", href: "/dashboard/team", icon: Users },
  { label: "Billing & Plans", href: "/dashboard/billing", icon: CreditCard },
  { label: "Audit Ledger", href: "/dashboard/audit", icon: History },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-[var(--border)] bg-[var(--surface-card)] min-h-[calc(100vh-3.5rem)] p-4 flex flex-col justify-between">
      <nav aria-label="Main Navigation" className="space-y-1">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
          Geological Survey
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground-muted)]">
        <p className="font-medium text-[var(--foreground)]">CRS Status</p>
        <p className="mt-1 font-mono">EPSG:32637 (UTM 37N)</p>
        <p className="text-[11px] mt-1 text-emerald-600 dark:text-emerald-400">
          WGS 84 / Strict Geodesic
        </p>
      </div>
    </aside>
  );
}
