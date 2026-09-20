import test from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import { createInternalAssertion, getDevKeyPair } from "./assertion.ts";

test("assertion generator produces valid Ed25519 token with proper claims", () => {
  const { publicKey } = getDevKeyPair();

  const token = createInternalAssertion({
    sub: "usr_test_123",
    authTime: Math.floor(Date.now() / 1000),
    sudoExpiresAt: Math.floor(Date.now() / 1000) + 900,
  });

  const parts = token.split(".");
  assert.strictEqual(parts.length, 3, "token must have 3 dot-separated parts");

  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  assert.strictEqual(header.alg, "EdDSA");
  assert.strictEqual(header.typ, "JWT");
  assert.ok(header.kid, "header must include key id");

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  assert.strictEqual(payload.iss, "geoquerry-bff");
  assert.strictEqual(payload.aud, "geoquerry-core");
  assert.strictEqual(payload.sub, "usr_test_123");
  assert.ok(payload.jti, "must have jti");
  assert.ok(payload.exp > payload.iat, "expiry must be in future");
  assert.ok(payload.sudo_exp, "must contain sudo_exp");

  // Invariant: MUST NOT contain role or tenant claims
  assert.strictEqual(payload.role, undefined);
  assert.strictEqual(payload.tenant_id, undefined);
  assert.strictEqual(payload.roles, undefined);

  // Cryptographic signature verification using raw Node crypto
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = Buffer.from(parts[2], "base64url");
  const isValid = crypto.verify(null, Buffer.from(signingInput), publicKey, signature);
  assert.strictEqual(isValid, true, "Ed25519 signature must verify with public key");
});
