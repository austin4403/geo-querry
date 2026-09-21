import { NextResponse } from "next/server";
import { getSession, isSudoActive } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, session: null, isSudo: false });
  }

  return NextResponse.json({
    authenticated: true,
    session: {
      userId: session.userId,
      email: session.email,
      authTime: session.authTime,
    },
    isSudo: isSudoActive(session),
    sudoExpiresAt: session.sudoExpiresAt || null,
  });
}
