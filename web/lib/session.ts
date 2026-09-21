import "server-only";
import { cookies } from "next/headers";

export interface UserSession {
  userId: string;
  email: string;
  authTime: number;
  sudoExpiresAt?: number;
}

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-geoquerry_session"
    : "geoquerry_session";

export async function getSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    const raw = Buffer.from(sessionCookie.value, "base64url").toString("utf8");
    const session = JSON.parse(raw) as UserSession;

    // Check 15-day maximum lifetime
    const now = Math.floor(Date.now() / 1000);
    if (now - session.authTime > 15 * 86400) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function setSession(session: UserSession): Promise<void> {
  const cookieStore = await cookies();
  const serialized = Buffer.from(JSON.stringify(session)).toString("base64url");

  cookieStore.set(SESSION_COOKIE_NAME, serialized, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 86400, // 15 days
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export function isSudoActive(session: UserSession | null): boolean {
  if (!session?.sudoExpiresAt) {
    return false;
  }
  return session.sudoExpiresAt > Math.floor(Date.now() / 1000);
}
