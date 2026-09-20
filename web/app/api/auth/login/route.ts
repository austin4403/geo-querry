import { NextResponse } from "next/server";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body.email || "chief.geologist@geoquerry.local";
    const userId = body.userId || "usr_geologist_101";

    const now = Math.floor(Date.now() / 1000);
    await setSession({
      userId,
      email,
      authTime: now,
      // Default 15-minute initial sudo mode for immediate workstation onboarding
      sudoExpiresAt: now + 900,
    });

    return NextResponse.json({ success: true, redirect: "/dashboard" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal authentication error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
