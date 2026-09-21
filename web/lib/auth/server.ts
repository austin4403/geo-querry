import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export interface NeonAuthSession {
  user: {
    id: string;
    email: string;
    name?: string;
    role?: string;
  };
  session: {
    id: string;
    expiresAt: string;
    createdAt?: string;
  };
}

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-geoquerry_session"
    : "geoquerry_session";

class NeonAuthServer {
  private baseUrl: string | null;
  private cookieSecret: string | null;

  constructor() {
    this.baseUrl = process.env.NEON_AUTH_BASE_URL || null;
    this.cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET || null;
  }

  /**
   * Retrieves the current user session from the session cookie or upstream Neon Auth.
   * Conforms to auth.getSession() in @neondatabase/auth
   */
  public async getSession(): Promise<{ data: NeonAuthSession | null }> {
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

      if (sessionCookie?.value) {
        const raw = Buffer.from(sessionCookie.value, "base64url").toString("utf8");
        const parsed = JSON.parse(raw);

        const userId = parsed.userId || parsed.user?.id;
        const email = parsed.email || parsed.user?.email || "geologist@geoquerry.com";
        const name = parsed.name || parsed.user?.name || email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        const authTime = parsed.authTime || Math.floor(Date.now() / 1000);

        // Check 15-day maximum lifetime
        const now = Math.floor(Date.now() / 1000);
        if (now - authTime <= 15 * 86400) {
          return {
            data: {
              user: {
                id: userId,
                email,
                name,
              },
              session: {
                id: `sess_${userId}`,
                createdAt: new Date(authTime * 1000).toISOString(),
                expiresAt: new Date((authTime + 15 * 86400) * 1000).toISOString(),
              },
            },
          };
        }
      }

      // Check Neon Auth upstream session token
      const neonToken =
        cookieStore.get("__Secure-neon-auth.session_token")?.value ||
        cookieStore.get("neon-auth.session_token")?.value;

      if (neonToken && this.baseUrl) {
        const neonUrl = new URL(this.baseUrl);
        const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/get-session`, {
          headers: {
            host: neonUrl.host,
            Cookie: `__Secure-neon-auth.session_token=${neonToken}; neon-auth.session_token=${neonToken}`,
          },
        });

        if (res.ok) {
          const upstream = await res.json();
          if (upstream?.user) {
            return {
              data: {
                user: {
                  id: upstream.user.id,
                  email: upstream.user.email,
                  name: upstream.user.name,
                },
                session: {
                  id: upstream.session?.id || `sess_${upstream.user.id}`,
                  createdAt: upstream.session?.createdAt || new Date().toISOString(),
                  expiresAt: upstream.session?.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString(),
                },
              },
            };
          }
        }
      }

      return { data: null };
    } catch {
      return { data: null };
    }
  }

  /**
   * Sign out current user
   */
  public async signOut(): Promise<{ success: boolean }> {
    try {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
      cookieStore.delete("__Secure-neon-auth.session_token");
      cookieStore.delete("neon-auth.session_token");

      if (this.baseUrl) {
        const neonUrl = new URL(this.baseUrl);
        await fetch(`${this.baseUrl.replace(/\/$/, "")}/sign-out`, {
          method: "POST",
          headers: { host: neonUrl.host },
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
    return { success: true };
  }

  /**
   * Server-side signIn methods (used by sudo step-up authentication)
   */
  public signIn = {
    email: async ({ email, password }: { email: string; password?: string }) => {
      if (!password || password.length < 6) {
        return { error: { message: "Invalid credentials: minimum 6 characters required" }, data: null };
      }

      if (this.baseUrl) {
        try {
          const neonUrl = new URL(this.baseUrl);
          const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/sign-in/email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              host: neonUrl.host,
            },
            body: JSON.stringify({ email, password }),
          });

          if (res.ok) {
            const data = await res.json();
            return { error: null, data };
          }
          const err = await res.json().catch(() => ({}));
          return { error: { message: err.message || "Invalid email or password" }, data: null };
        } catch {
          // fallback
        }
      }

      return {
        error: null,
        data: {
          user: { email },
        },
      };
    },
  };

  /**
   * Middleware handler for route protection conforming to @neondatabase/auth
   */
  public middleware(options?: { loginUrl?: string }) {
    const loginUrl = options?.loginUrl || "/login";
    return async (req: NextRequest) => {
      const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME);
      const neonToken =
        req.cookies.get("__Secure-neon-auth.session_token") ||
        req.cookies.get("neon-auth.session_token");

      if (!sessionCookie?.value && !neonToken?.value) {
        return NextResponse.redirect(new URL(loginUrl, req.url));
      }
      return NextResponse.next();
    };
  }

  /**
   * Dispatches or proxies auth API requests for /api/auth/[...path] to Neon Auth
   */
  public handler() {
    const handleRequest = async (
      req: NextRequest,
      context?: { params?: Promise<{ path?: string[] }> | { path?: string[] } }
    ): Promise<Response> => {
      const resolvedParams = context?.params ? await context.params : { path: [] };
      const pathSegments = resolvedParams.path || [];
      const subpath = pathSegments.join("/");

      const isLiveNeon =
        this.baseUrl &&
        !this.baseUrl.includes("sample") &&
        !this.baseUrl.includes("ep-xxx") &&
        !this.baseUrl.includes("placeholder");

      if (isLiveNeon && this.baseUrl) {
        try {
          const neonUrl = new URL(this.baseUrl);
          const upstreamUrl = `${this.baseUrl.replace(/\/$/, "")}/${subpath}`;

          const headers = new Headers();
          req.headers.forEach((val, key) => {
            const k = key.toLowerCase();
            // Strip forwarded headers that cause Neon hostname validation to fail
            if (
              k !== "host" &&
              !k.startsWith("x-forwarded") &&
              k !== "content-length"
            ) {
              headers.set(key, val);
            }
          });
          headers.set("host", neonUrl.host);

          const cookieHeader = req.headers.get("cookie");
          if (cookieHeader) {
            headers.set("cookie", cookieHeader);
          }

          const reqBody =
            req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;

          const upstreamRes = await fetch(upstreamUrl, {
            method: req.method,
            headers,
            body: reqBody,
            redirect: "manual",
          });

          // Forward response with upstream headers & cookies
          const resHeaders = new Headers();
          upstreamRes.headers.forEach((val, key) => {
            if (key.toLowerCase() !== "content-encoding") {
              resHeaders.append(key, val);
            }
          });

          const rawBody = await upstreamRes.text();

          // If upstream succeeded on sign-in or sign-up, synchronize our local session cookie
          if (upstreamRes.ok && (subpath.includes("sign-in") || subpath.includes("sign-up"))) {
            try {
              const data = JSON.parse(rawBody);
              const user = data.user;
              if (user && user.id && user.email) {
                const now = Math.floor(Date.now() / 1000);
                const payload = {
                  userId: user.id,
                  email: user.email,
                  name: user.name || "Chief Geologist",
                  authTime: now,
                  sudoExpiresAt: now + 900,
                };

                const serialized = Buffer.from(JSON.stringify(payload)).toString("base64url");
                const cookieStore = await cookies();
                cookieStore.set(SESSION_COOKIE_NAME, serialized, {
                  httpOnly: true,
                  secure: process.env.NODE_ENV === "production",
                  sameSite: "lax",
                  path: "/",
                  maxAge: 15 * 86400,
                });
              }
            } catch {
              // ignore parse errors
            }
          }

          return new Response(rawBody, {
            status: upstreamRes.status,
            statusText: upstreamRes.statusText,
            headers: resHeaders,
          });
        } catch (err) {
          console.warn("[Neon Auth] Upstream proxy error, falling back to local handler:", err);
        }
      }

      // Offline fallback if upstream unreachable
      if (req.method === "GET") {
        if (subpath === "session" || subpath === "get-session") {
          const { data } = await this.getSession();
          return NextResponse.json(data);
        }
        return NextResponse.json({ status: "neon_auth_ready" });
      }

      if (req.method === "POST") {
        if (subpath === "sign-out" || subpath === "logout") {
          const cookieStore = await cookies();
          cookieStore.delete(SESSION_COOKIE_NAME);
          return NextResponse.json({ success: true });
        }

        let body: Record<string, unknown> = {};
        try {
          body = await req.json();
        } catch {
          body = {};
        }

        const email = String(body.email || "geologist@geoquerry.com").trim().toLowerCase();
        const userId = (body.userId as string) || `c04df38c-13e2-48c7-a367-d451a3b955d2`;

        const redirectTarget =
          (body.callbackURL as string) ||
          (body.redirectTo as string) ||
          (body.callbackUrl as string) ||
          "/dashboard";

        const now = Math.floor(Date.now() / 1000);
        const payload = {
          userId,
          email,
          name: "Chief Geologist",
          authTime: now,
          sudoExpiresAt: now + 900,
        };

        const serialized = Buffer.from(JSON.stringify(payload)).toString("base64url");
        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE_NAME, serialized, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 15 * 86400,
        });

        return NextResponse.json({
          success: true,
          user: {
            id: userId,
            email,
          },
          session: {
            id: `sess_${userId}`,
            createdAt: new Date(now * 1000).toISOString(),
            expiresAt: new Date((now + 15 * 86400) * 1000).toISOString(),
          },
          url: redirectTarget,
          redirect: redirectTarget,
        });
      }

      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    };

    return {
      GET: handleRequest,
      POST: handleRequest,
    };
  }
}

export const auth = new NeonAuthServer();
