import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { createInternalAssertion, getDevKeyPair } from "@/lib/assertion";

describe("Ed25519 BFF Internal Identity Assertion", () => {
  it("generates a valid Ed25519 signed JWT with strictly confined identity claims", () => {
    const devKeyPair = getDevKeyPair();
    const token = createInternalAssertion({
      sub: "usr_lead_geologist_42",
      authTime: Math.floor(Date.now() / 1000),
      authMethods: ["oidc_neon", "hardware_key"],
    });

    const parts = token.split(".");
    expect(parts).toHaveLength(3);

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));

    // Header assertions
    expect(header.alg).toBe("EdDSA");
    expect(header.typ).toBe("JWT");
    expect(header.kid).toBe("bff-dev-key-1");

    // Payload assertions adhering to ADR-0002 & ADR-0005
    expect(payload.iss).toBe("geoquerry-bff");
    expect(payload.aud).toBe("geoquerry-core");
    expect(payload.sub).toBe("usr_lead_geologist_42");
    expect(payload.jti).toBeDefined();
    expect(payload.amr).toEqual(["oidc_neon", "hardware_key"]);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(300);

    // Cryptographic signature verification using Ed25519 public key
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(signatureB64, "base64url");
    const isValid = crypto.verify(null, Buffer.from(signingInput), devKeyPair.publicKey, signature);
    expect(isValid).toBe(true);
  });

  it("enforces strict maximum 300s TTL ceiling even if higher TTL is requested", () => {
    const token = createInternalAssertion({
      sub: "usr_junior_field_tech",
      authTime: Math.floor(Date.now() / 1000),
      ttlSeconds: 99999, // Attempt excessive lifetime
    });

    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    expect(payload.exp - payload.iat).toBe(300); // Clamped to 300s
  });

  it("includes sudo_exp claim only when actively elevated", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createInternalAssertion({
      sub: "usr_admin",
      authTime: now,
      sudoExpiresAt: now + 900,
    });

    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    expect(payload.sudo_exp).toBe(now + 900);
  });
});
