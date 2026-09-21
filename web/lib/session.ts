import "server-only";
import { cookies } from "next/headers";
import { auth, SESSION_COOKIE_NAME } from "@/lib/auth/server";
import {
  SUDO_COOKIE_NAME,
  isSudoActive,
  signSudoToken,
  sudoExpiryFrom,
  verifySudoToken,
  type SudoState,
} from "@/lib/sudo";

export interface UserSession {
  userId: string;
  email: string;
  authTime: number;
  sudoExpiresAt?: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  authTime: number;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { data } = await auth.getSession();
  if (!data?.user || !data.session) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email,
    name: data.user.name || data.user.email.split("@")[0],
    authTime: data.session.createdAt
      ? Math.floor(new Date(data.session.createdAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000),
  };
}

export async function getSession(): Promise<UserSession | null> {
  const { data } = await auth.getSession();
  if (!data?.user) {
    return null;
  }

  const sudoState = await getSudoState();
  const authTime = data.session.createdAt
    ? Math.floor(new Date(data.session.createdAt).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  return {
    userId: data.user.id,
    email: data.user.email,
    authTime,
    sudoExpiresAt: sudoState?.sudoExpiresAt,
  };
}

export async function setSession(session: UserSession): Promise<void> {
  const cookieStore = await cookies();
  const serialized = Buffer.from(JSON.stringify(session)).toString("base64url");

  cookieStore.set(SESSION_COOKIE_NAME, serialized, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 86400,
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(SUDO_COOKIE_NAME);
}

export async function getSudoState(): Promise<SudoState | null> {
  const cookieStore = await cookies();
  const sudoCookie = cookieStore.get(SUDO_COOKIE_NAME);
  if (!sudoCookie?.value) {
    return null;
  }
  return verifySudoToken(sudoCookie.value, process.env.NEON_AUTH_COOKIE_SECRET || "");
}

export { isSudoActive };

/** Elevates the current Neon Auth user to sudo mode and returns the expiry. */
export async function elevateSudo(userId: string): Promise<number> {
  const sudoExpiresAt = sudoExpiryFrom();
  const token = signSudoToken({ userId, sudoExpiresAt }, process.env.NEON_AUTH_COOKIE_SECRET || "");

  const cookieStore = await cookies();
  cookieStore.set(SUDO_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 900,
  });

  return sudoExpiresAt;
}

export async function clearSudoState(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SUDO_COOKIE_NAME);
}
