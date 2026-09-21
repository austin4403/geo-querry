import crypto from "node:crypto";

/**
 * Sudo elevation state (ADR-0005): a short-lived, HMAC-signed cookie bound to
 * the authenticated Neon Auth user. Identity itself lives in the Neon Auth
 * session; this cookie only carries the elevated-privilege expiry so the BFF
 * can propagate `sudo_exp` in the internal assertion (ADR-0002).
 */

export interface SudoState {
  userId: string;
  sudoExpiresAt: number; // epoch seconds
}

const SUDO_TTL_SECONDS = 900; // strict 15-minute TTL per ADR-0005

export const SUDO_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-geoquerry_sudo"
    : "geoquerry_sudo";

function signingSecret(): string {
  // Shared with the Neon Auth SDK cookie secret: same trust domain, one env
  // var. createNeonAuth already enforces a minimum length of 32 chars.
  return process.env.NEON_AUTH_COOKIE_SECRET || "";
}

export function signSudoToken(state: SudoState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySudoToken(token: string, secret: string): SudoState | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  const presented = Buffer.from(signature, "base64url");
  // Constant-time compare over equal-length digests; malformed input yields a
  // length mismatch that also fails this comparison.
  if (presented.length !== expected.length || !crypto.timingSafeEqual(presented, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SudoState>;
    if (typeof parsed.userId !== "string" || typeof parsed.sudoExpiresAt !== "number") {
      return null;
    }
    return { userId: parsed.userId, sudoExpiresAt: parsed.sudoExpiresAt };
  } catch {
    return null;
  }
}

export function isSudoActive(sudo: SudoState | null, userId: string): boolean {
  if (!sudo || sudo.userId !== userId) {
    return false;
  }
  return sudo.sudoExpiresAt > Math.floor(Date.now() / 1000);
}

export function sudoExpiryFrom(nowSeconds = Math.floor(Date.now() / 1000)): number {
  return nowSeconds + SUDO_TTL_SECONDS;
}
