-- =============================================================================
-- 000004_billing_and_entitlements.down.sql
-- Rollback for Billing, Subscriptions, and Entitlements
-- =============================================================================

DROP TABLE IF EXISTS organization_entitlements;
DROP TABLE IF EXISTS organization_subscriptions;
DROP TABLE IF EXISTS webhook_inbox;
DROP TRIGGER IF EXISTS trg_transactions_immutable ON payment_transactions;
DROP FUNCTION IF EXISTS trg_prevent_transaction_mutation();
DROP TABLE IF EXISTS payment_transactions;
DROP TABLE IF EXISTS payment_attempts;
DROP TABLE IF EXISTS plans;
