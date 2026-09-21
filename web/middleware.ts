import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-geoquerry_session"
    : "geoquerry_session";

export function middleware(request: NextRequest) {
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

  // 2. Authentication boundary for /dashboard
  if (pathname.startsWith("/dashboard")) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
    if (!sessionCookie?.value) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();

  // 3. Mandatory Security Headers per ADR-0001 / ADR-0005 & Security Assessment
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
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

  // 4. Authenticated Cache Isolation
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api")) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
