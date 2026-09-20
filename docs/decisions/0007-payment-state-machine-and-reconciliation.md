# ADR-0007: Dual Payment State Machines, Webhook Ingestion, and Reconciliation

## Status
Accepted

## Context
GeoQuerry provides multi-currency billing tailored for African geological exploration (Safaricom M-Pesa via Daraja in Kenya / East Africa) and international enterprise subscriptions (Stripe in USD/EUR).

Key financial risks:
- Forged webhooks granting unpaid entitlements.
- Unsigned M-Pesa callbacks spoofed by malicious callers.
- Floating-point currency rounding discrepancies.
- Mismatched currency unit conversions (Daraja uses whole KES shillings; internal systems use minor currency units / cents).
- Duplicate webhook delivery creating double credits or duplicate subscriptions.
- Worker crashes resulting in unrecorded transactions.

## Decision

### 1. Trusted Server-Side Pricing Catalog & Minor Units
- **Currency Representation**:
  - Floating-point numbers are strictly forbidden for currency and financial calculations.
  - All monetary amounts are stored as 64-bit integers in minor units (e.g. `amount_minor_units`):
    - USD / EUR: 1 USD = `100` minor units (cents).
    - KES: 1 KES = `100` minor units (cents).
- **Explicit Daraja Currency Unit Conversion**:
  - Daraja STK Push API requires whole KES shillings.
  - Conversion rule:
    `daraja_amount = internal_amount_minor_units / 100`
    Example: An internal subscription priced at `500,000` minor units MUST be dispatched to Daraja as `5,000` KES, NEVER `500,000`.
  - Precision check: Modulo `internal_amount_minor_units % 100 == 0` is validated before dispatch.
- **Fixed Price Catalog**:
  - Clients never transmit prices, currencies, or entitlement tiers. Clients only submit plan IDs (`plan_id`). The server resolves amounts from the authoritative price catalog in Go.

### 2. Separation of State Machines
Three independent, decoupled state machines are maintained:
1. **Payment Attempt State Machine**:
   `INITIATED -> PENDING -> (SETTLED | FAILED | EXPIRED | RECONCILED)`
2. **Subscription State Machine**:
   `INACTIVE -> TRIALING -> ACTIVE -> PAST_DUE -> CANCELED -> UNPAID`
3. **Entitlement State Machine**:
   `REVOKED <-> PROVISIONED`
- Entitlements are never directly modified by payment callbacks or UI triggers. Entitlements are updated solely by the internal Subscription State Service upon verified transition to `ACTIVE`.

### 3. Webhook Ingestion and Durable Inbox Pattern
- **Stripe Webhooks**:
  - Validated using raw-body HMAC-SHA256 signature verification (`Stripe-Signature`) against the endpoint signing secret.
- **M-Pesa Daraja Webhooks**:
  - Daraja callbacks are not cryptographically signed.
  - Mitigation:
    1. Verify payload against active pending attempt: validate `MerchantRequestID`, `CheckoutRequestID`, expected amount, currency, and registered callback secret token.
    2. Any ambiguous, failed, or disputed callback leaves the attempt in `PENDING` state.
    3. The payment is reconciled out-of-band by invoking the Daraja Transaction Status Query API before settlement.
- **Durable Inbox Insertion**:
  - Webhooks are written into an append-only `webhook_inbox` table within an atomic transaction.
  - HTTP `200 OK` is returned to the provider **only after** the raw event is successfully committed to the database.
  - Processing is performed asynchronously by an idempotent River queue worker. If the worker crashes, the event remains in the inbox and is safely re-leased.

### 4. Continuous Out-of-Band Reconciliation Worker
- A scheduled River job polls pending M-Pesa attempts older than 2 minutes and invokes Daraja Query API.
- Stripe events are reconciled against the Stripe List Events API daily to detect any missed webhook events.

## Consequences
- Impossible for client manipulation or network spoofing to grant free entitlements.
- Complete idempotency: duplicate webhooks yield identical database state without duplicate grants.
- Resilient recovery from background worker crashes and temporary payment gateway outages.
