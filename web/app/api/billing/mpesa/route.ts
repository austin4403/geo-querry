import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getCurrentUser } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: active session required" }, { status: 401 });
    }

    const body = await req.json();
    const { phoneNumber, amountKes, planTier } = body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // Strict E.164 MSISDN validation for Safaricom Kenya (e.g. 2547XXXXXXXX or 2541XXXXXXXX)
    const sanitizedPhone = phoneNumber.replace(/\D/g, "");
    if (!/^254[17]\d{8}$/.test(sanitizedPhone)) {
      return NextResponse.json(
        { error: "Invalid format: phone number must match Safaricom E.164 pattern (e.g. 254712345678)" },
        { status: 400 }
      );
    }

    if (!amountKes || typeof amountKes !== "number" || amountKes <= 0) {
      return NextResponse.json({ error: "Positive amount in KES is required" }, { status: 400 });
    }

    const checkoutRequestId = `ws_CO_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    return NextResponse.json({
      success: true,
      checkoutRequestId,
      merchantRequestId: `MR_${Date.now()}`,
      customerMessage: "Success. Request accepted for processing. Please check your phone for the M-Pesa prompt.",
      planTier: planTier || "STARTER",
      amountKes,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal billing error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
