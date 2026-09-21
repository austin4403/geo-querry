import "server-only";
import crypto from "node:crypto";

export interface AssertionClaims {
  sub: string;
  authTime: number;
  authMethods?: string[];
  sudoExpiresAt?: number;
  ttlSeconds?: number;
}

export interface SignerConfig {
  keyId: string;
  privateKeyPemOrDer?: string;
  privateKeyObject?: crypto.KeyObject;
}

// In-memory ephemeral key for development if no PEM key is provided via env
let devKeyPair: { keyId: string; privateKey: crypto.KeyObject; publicKey: crypto.KeyObject } | null = null;

export function getDevKeyPair() {
  if (!devKeyPair) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    devKeyPair = {
      keyId: "bff-dev-key-1",
      privateKey,
      publicKey,
    };
  }
  return devKeyPair;
}

/**
 * Creates an Ed25519-signed internal assertion token adhering strictly to ADR-0002.
 * The assertion contains only verified identity claims. It contains zero client-provided
 * roles, permissions, or tenant IDs.
 */
export function createInternalAssertion(
  claims: AssertionClaims,
  config?: Partial<SignerConfig>
): string {
  const devKey = getDevKeyPair();
  const keyId = config?.keyId || process.env.BFF_KEY_ID || devKey.keyId;
  const privateKey = config?.privateKeyObject || devKey.privateKey;

  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(claims.ttlSeconds || 120, 300); // Max 300s lifetime per security invariants

  const header = {
    alg: "EdDSA",
    typ: "JWT",
    kid: keyId,
  };

  const payload: Record<string, unknown> = {
    iss: "geoquerry-bff",
    aud: "geoquerry-core",
    sub: claims.sub,
    iat: now,
    nbf: now - 1,
    exp: now + ttl,
    jti: crypto.randomUUID(),
    auth_time: claims.authTime || now,
    amr: claims.authMethods || ["session_cookie"],
  };

  if (claims.sudoExpiresAt && claims.sudoExpiresAt > now) {
    payload.sudo_exp = claims.sudoExpiresAt;
  }

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);
  const encodedSignature = signature.toString("base64url");

  return `${signingInput}.${encodedSignature}`;
}
