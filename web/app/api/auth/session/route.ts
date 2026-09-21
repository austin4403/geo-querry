import { NextResponse } from "next/server";
import { getCurrentUser, getSudoState, isSudoActive } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, session: null, isSudo: false });
  }

  const sudo = await getSudoState();
  const sudoActive = isSudoActive(sudo, user.id);

  return NextResponse.json({
    authenticated: true,
    session: {
      userId: user.id,
      email: user.email,
      name: user.name,
      authTime: user.authTime,
    },
    isSudo: sudoActive,
    sudoExpiresAt: sudoActive && sudo ? sudo.sudoExpiresAt : null,
  });
}
