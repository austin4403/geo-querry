import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

// Next.js 16 renamed middleware to proxy; @neondatabase/auth docs use the
// proxy.ts file for route protection on Next 16+.
const neonAuthMiddleware = auth.middleware({ loginUrl: "/login" });

const PROTECTED_PREFIXES = ["/dashboard"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. CSRF verification on state-changing API requests
  if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin && host) {
      try {
        const originUrl = new URL(origin);
        // Compare hostnames, permitting same-host or localhost during development
        if (originUrl.host !== host && !originUrl.host.startsWith("localhost")) {
          return new NextResponse(
            JSON.stringify({ error: "Forbidden: cross-origin mutation rejected" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch {
        return new NextResponse(
          JSON.stringify({ error: "Forbidden: malformed origin header" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  // 2. Authentication boundary for protected areas, enforced by the Neon Auth
  // middleware (session resolution + cookie refresh; redirects unauthenticated
  // requests to /login). Other paths stay public.
  const response = isProtected(pathname)
    ? await neonAuthMiddleware(request)
    : NextResponse.next();

  // 3. Mandatory Security Headers per ADR-0001 / ADR-0005 & Security Assessment
  // React DevTools / Turbopack requires 'unsafe-eval' in non-production environments
  // for reconstructing callstacks and debugging. Production strictly omits it.
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  const cspDirectives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.tile.opentopomap.org https://*.basemaps.cartocdn.com",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "child-src blob:",
    "connect-src 'self' https://* wss://*",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", cspDirectives);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );

  // Authenticated state & API isolation
  if (pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files and image optimization
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
