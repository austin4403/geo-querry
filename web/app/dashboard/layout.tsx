import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getSudoState, isSudoActive } from "@/lib/session";
import { TopNav } from "@/components/layout/top-nav";
import { Sidebar } from "@/components/layout/sidebar";

// Session is resolved against Neon Auth on every request — never prerender.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const sudo = await getSudoState();
  const hasSudo = isSudoActive(sudo, user.id);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <TopNav user={user} hasActiveSudo={hasSudo} />
      <div className="flex flex-1">
        <Sidebar />
        <main id="main-content" className="flex-1 p-6 max-w-6xl">
          {children}
        </main>
      </div>
    </div>
  );
}
