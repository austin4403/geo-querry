import React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Shield, Radio } from "lucide-react";
import { CurrentUser } from "@/lib/session";

interface TopNavProps {
  user: CurrentUser | null;
  hasActiveSudo?: boolean;
}

export function TopNav({ user, hasActiveSudo = false }: TopNavProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border)] bg-[var(--surface-card)]/90 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center space-x-3">
          <Link
            href="/"
            className="flex items-center space-x-2 font-bold tracking-tight text-[var(--foreground)] focus-visible:ring-2"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
              <span className="text-xs font-black">GQ</span>
            </div>
            <span className="text-base font-semibold tracking-wide">GeoQuerry</span>
          </Link>
          <Badge variant="outline" className="hidden sm:inline-flex text-[11px] text-[var(--foreground-muted)]">
            v1.0 Core
          </Badge>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-2 py-1 rounded bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--foreground-muted)]">
            <Radio className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
            <span className="hidden md:inline font-mono">ConnectRPC / PostGIS</span>
          </div>

          {hasActiveSudo && (
            <Badge variant="warning" className="flex items-center space-x-1">
              <Shield className="h-3 w-3 mr-1" />
              <span>SUDO ELEVATED</span>
            </Badge>
          )}

          <ThemeToggle />

          {user ? (
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-[var(--foreground-muted)] hidden sm:inline">
                {user.email}
              </span>
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="rounded px-2.5 py-1 text-xs font-medium border border-[var(--border)] hover:bg-[var(--surface)] text-[var(--foreground)]"
                >
                  Sign Out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
