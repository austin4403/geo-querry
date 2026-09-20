# Runbook: Payment Reconciliation & Webhook Diagnostics

## Scope
Resolution of stranded, ambiguous, or failed payment transactions across Safaricom M-Pesa (Daraja) and Stripe.

## 1. M-Pesa Daraja Ambiguous Transaction Procedure
When a user reports funds debited on mobile phone but the organization portal displays "Payment Pending":

### Step 1: Query the `payment_attempts` Table
```sql
SELECT id, organization_id, provider, status, amount_minor_units, 
       provider_attempt_id, created_at, updated_at
FROM payment_attempts
WHERE provider = 'mpesa' AND status = 'PENDING'
ORDER BY created_at DESC LIMIT 10;
```

### Step 2: Trigger Manual Reconciliation Query
Invoke the reconciliation CLI or internal admin endpoint with the specific `payment_attempt_id`:
```bash
./bin/geoquerry-admin reconcile-payment --id="<PAYMENT_ATTEMPT_UUID>"
```
This triggers an explicit Safaricom Daraja Transaction Status Query API request:
- If Daraja returns `ResultCode: 0` (Success):
  1. Updates `payment_attempts` to `SETTLED`.
  2. Inserts settled transaction record in `payment_transactions`.
  3. Transitions subscription to `ACTIVE` and provisions entitlements.
- If Daraja returns non-zero (Failed / Cancelled by user):
  1. Updates `payment_attempts` to `FAILED`.
  2. Records error code in metadata.

## 2. Stripe Webhook Signature Verification Failure
If Stripe events are failing with `400 Bad Request` or signature mismatch:
1. Verify the active `STRIPE_WEBHOOK_SECRET` against Stripe Dashboard.
2. Confirm the Go HTTP handler reads the **raw unparsed body bytes** before any JSON parsing.
3. Check clock synchronization on the server (`ntpstat` / `timedatectl`). Stripe signature validation tolerates a maximum of 300 seconds clock drift.

## 3. Entitlement Correction
Under no circumstances should database flags in `organization_entitlements` be updated via raw SQL without an audit log. Always execute corrective mutations through the authoritative billing service CLI.
