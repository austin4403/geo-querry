# Security Control: Multi-Factor Authentication (TOTP & Single-Use Recovery Codes)

## 1. Time-Based One-Time Password (TOTP)
- **Algorithm**: RFC 6238 TOTP using HMAC-SHA1 or HMAC-SHA256, 6 digits, 30-second step interval.
- **Clock Drift**: Tolerate $\pm 1$ step (30 seconds) to account for client device clock inaccuracies.
- **Storage Security**:
  - TOTP shared secret seeds **must NEVER be stored in plaintext**.
  - Secrets are encrypted at rest using AES-256-GCM with a dedicated database encryption key (`DB_ENCRYPTION_KEY`).
  - Secret seeds are never returned in user query APIs after the initial enrollment QR code display.

## 2. Emergency Recovery Codes
- **Generation**:
  - During MFA enrollment, 10 cryptographically random 16-character alphanumeric codes are generated.
- **Storage & Verification**:
  - Recovery codes **must NEVER be stored in plaintext**.
  - Each code is hashed with **bcrypt** (cost 12) or **Argon2id** prior to storage in `user_recovery_codes`.
- **Single-Use Enforcement**:
  - Upon successful use of a recovery code for authentication, its database record is immediately marked as `used = true` and `used_at = NOW()`.
  - Used codes cannot be replayed.
  - Using a recovery code emits a critical security notification email and high-severity audit log event.
