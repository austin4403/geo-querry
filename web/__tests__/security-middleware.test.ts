import { describe, it, expect } from "vitest";
import proxy from "@/proxy";
import { NextRequest } from "next/server";

describe("Security Proxy & Response Headers", () => {
  it("attaches strict Content-Security-Policy, HSTS, and frame protection", async () => {
    const req = new NextRequest("http://localhost:3001/api/auth/session");

    const res = await proxy(req);

    // Frame ancestors protection (clickjacking prevention)
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("https://*.tile.openstreetmap.org");

    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");

    // Authenticated cache isolation on API paths
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0, must-revalidate");
  });

  it("rejects cross-origin mutations with 403 Forbidden (CSRF protection)", async () => {
    const req = new NextRequest("http://localhost:3001/api/billing/mpesa", {
      method: "POST",
      headers: {
        host: "app.geoquerry.com",
        origin: "https://evil-attacker.com",
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(403);
  });

  it("permits same-origin mutation requests", async () => {
    const req = new NextRequest("http://localhost:3001/api/auth/session", {
      method: "POST",
      headers: {
        host: "localhost:3001",
        origin: "http://localhost:3001",
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
  });
});
