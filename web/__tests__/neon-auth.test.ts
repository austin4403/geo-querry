import { describe, it, expect } from "vitest";
import {
  signSudoToken,
  verifySudoToken,
  isSudoActive,
  sudoExpiryFrom,
  type SudoState,
} from "@/lib/sudo";

const SECRET = "unit-test-cookie-secret-0123456789abcdef0123456789abcdef";
const STATE: SudoState = {
  userId: "neon-user-123",
  sudoExpiresAt: Math.floor(Date.now() / 1000) + 900,
};

describe("Sudo Elevation Cookie (ADR-0005)", () => {
  it("round-trips a signed token", () => {
    const token = signSudoToken(STATE, SECRET);
    const verified = verifySudoToken(token, SECRET);

    expect(verified).toEqual(STATE);
  });

  it("rejects a tampered payload", () => {
    const token = signSudoToken(STATE, SECRET);
    const [payload] = token.split(".");
    // Flip the userId inside the payload without re-signing
    const forged = Buffer.from(
      JSON.stringify({ userId: "attacker", sudoExpiresAt: STATE.sudoExpiresAt })
    ).toString("base64url");
    const tampered = token.replace(payload, forged);

    expect(verifySudoToken(tampered, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSudoToken(STATE, "another-secret-with-at-least-32-chars-aaaa");

    expect(verifySudoToken(token, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySudoToken("garbage", SECRET)).toBeNull();
    expect(verifySudoToken("a.b.c", SECRET)).toBeNull();
  });

  it("isSudoActive binds the elevation to the authenticated user", () => {
    expect(isSudoActive(STATE, "neon-user-123")).toBe(true);
    // Cross-user replay: the elevation must not apply to another principal
    expect(isSudoActive(STATE, "neon-user-456")).toBe(false);
    expect(isSudoActive(null, "neon-user-123")).toBe(false);
  });

  it("isSudoActive expires after the TTL", () => {
    const expired: SudoState = { userId: STATE.userId, sudoExpiresAt: 1 };

    expect(isSudoActive(expired, STATE.userId)).toBe(false);
  });

  it("issues 15-minute elevations", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(sudoExpiryFrom(now)).toBe(now + 900);
  });
});
