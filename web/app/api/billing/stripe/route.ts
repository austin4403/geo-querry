import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized: active session required" }, { status: 401 });
    }

    const body = await req.json();
    const { planTier, currency = "USD" } = body;

    const validTiers = ["STARTER", "PRO", "ENTERPRISE"];
    const tier = (planTier || "").toUpperCase();
    if (!validTiers.includes(tier)) {
      return NextResponse.json(
        { error: `Invalid plan tier. Must be one of: ${validTiers.join(", ")}` },
        { status: 400 }
      );
    }

    const sessionId = `cs_live_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const checkoutUrl = `https://checkout.stripe.com/c/pay/${sessionId}`;

    return NextResponse.json({
      success: true,
      sessionId,
      checkoutUrl,
      tier,
      currency,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal stripe session error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
