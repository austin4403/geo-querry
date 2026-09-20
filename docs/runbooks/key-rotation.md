# Runbook: Ed25519 Assertion Key Rotation

## Scope
Scheduled and emergency rotation of the Ed25519 key pair used by Next.js BFF to sign internal identity assertions for the Go backend.

## 1. Key Ring Architecture
The Go backend supports a **multi-key verification ring**:
- `ACTIVE_ASSERTION_KID`: The current Key ID used by Next.js to sign new tokens.
- `ASSERTION_PUBLIC_KEYS`: A JSON map of known Key IDs to Base64-encoded Ed25519 public keys.
Example configuration:
```json
{
  "key-2026-09-primary": "MCowBQYDK2VwAyEA...",
  "key-2026-10-next": "MCowBQYDK2VwAyEA..."
}
```

## 2. Standard Rotation Procedure (Zero-Downtime)

### Step 1: Generate New Ed25519 Key Pair
```bash
# Generate private key in PKCS8 PEM format
openssl genpkey -algorithm Ed25519 -out new_private_key.pem

# Extract corresponding public key
openssl pkey -in new_private_key.pem -pubout -out new_public_key.pem
```

### Step 2: Deploy New Public Key to Go Backend
1. Append the new Key ID (`kid = "key-YYYY-MM-id"`) and public key to `ASSERTION_PUBLIC_KEYS` in Go backend environment variables / secret manager.
2. Deploy the Go backend. Both old and new keys are now accepted for token verification.

### Step 3: Switch Next.js BFF Signing Key
1. Update `INTERNAL_ASSERTION_PRIVATE_KEY` and `INTERNAL_ASSERTION_KID` in Next.js BFF environment.
2. Redeploy Next.js BFF. Newly minted assertions use the new key pair immediately.

### Step 4: Revoke Deprecated Key
1. Wait **15 minutes** (ensuring all 5-minute maximum lifetime assertions signed with the old key have expired).
2. Remove the old public key from the Go backend configuration and redeploy.

## 3. Emergency Revocation (Key Compromise)
If the Next.js private signing key is suspected compromised:
1. Immediately remove the compromised Key ID from `ASSERTION_PUBLIC_KEYS` on the Go backend and trigger an instant rolling restart.
2. Any assertion signed with the compromised key will fail with `CodeUnauthenticated`.
3. Generate and deploy a brand-new key pair following Steps 1-3.
