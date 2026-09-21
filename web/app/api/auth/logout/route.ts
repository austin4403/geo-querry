import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { clearSudoState } from "@/lib/session";

export async function POST(req: Request) {
  // Best-effort upstream sign-out: even if the Neon Auth call fails, local
  // sudo state is dropped and the browser is sent back to the login page.
  try {
    await auth.signOut();
  } catch (err) {
    console.warn("[auth] upstream sign-out failed:", err);
  }
  await clearSudoState();
  return NextResponse.redirect(new URL("/login", req.url));
}
