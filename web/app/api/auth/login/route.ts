import { NextResponse } from "next/server";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  try {
    let email = "chief.geologist@geoquerry.local";
    let userId = "usr_geologist_101";

    try {
      const body = await req.json();
      if (body.email) {
        email = body.email.trim().toLowerCase();
      }
      if (body.userId) {
        userId = body.userId.trim();
      } else if (body.email) {
        const handle = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "_");
        userId = `usr_${handle}`;
      }
    } catch {
      // Use defaults if empty JSON body
    }

    const now = Math.floor(Date.now() / 1000);
    await setSession({
      userId,
      email,
      authTime: now,
      // Default 15-minute initial sudo mode for immediate workstation onboarding
      sudoExpiresAt: now + 900,
    });

    return NextResponse.json({ success: true, redirect: "/dashboard", userId, email });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal authentication error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
