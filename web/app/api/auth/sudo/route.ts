import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { elevateSudo, getCurrentUser } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: active session required" }, { status: 401 });
    }

    const body = await req.json();
    const password = body.password;

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Invalid credentials: minimum 6-character sudo passphrase required" },
        { status: 400 }
      );
    }

    // Step-up credential verification (ADR-0005): re-validate the password
    // against Neon Auth instead of trusting a client claim.
    const { error } = await auth.signIn.email({ email: user.email, password });
    if (error) {
      return NextResponse.json(
        { error: "Invalid credentials: password verification failed" },
        { status: 401 }
      );
    }

    const sudoExpiresAt = await elevateSudo(user.id);

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
