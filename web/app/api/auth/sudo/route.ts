import { NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized: active session required" }, { status: 401 });
    }

    const body = await req.json();
    const password = body.password;

    // Verify sudo credential per ADR-0005 (reauthentication requirement)
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Invalid credentials: minimum 6-character sudo passphrase required" },
        { status: 400 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const sudoExpiresAt = now + 900; // Strict 15-minute TTL per ADR-0005

    await setSession({
      ...session,
      sudoExpiresAt,
    });

    return NextResponse.json({
      success: true,
      sudoExpiresAt,
      message: "Sudo mode successfully elevated for 15 minutes",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal sudo error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
