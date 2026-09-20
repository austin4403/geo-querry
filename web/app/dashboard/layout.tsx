import React from "react";
import { redirect } from "next/navigation";
import { getSession, isSudoActive } from "@/lib/session";
import { TopNav } from "@/components/layout/top-nav";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const hasSudo = isSudoActive(session);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <TopNav session={session} hasActiveSudo={hasSudo} />
      <div className="flex flex-1">
        <Sidebar />
        <main id="main-content" className="flex-1 p-6 max-w-6xl">
          {children}
        </main>
      </div>
    </div>
  );
}
