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
    const organizationId = body.organizationId;
    const projectId = body.projectId;

    if (!organizationId || !projectId) {
      return NextResponse.json(
        { error: "Bad Request: organizationId and projectId are required" },
        { status: 400 }
      );
    }

    // 256-bit crypto token with 30s TTL per ADR-0007
    const ticket = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 30_000;

    return NextResponse.json({
      ticket,
      expiresAt,
      streamUrl: `/api/telemetry/stream?ticket=${ticket}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal telemetry ticket error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
