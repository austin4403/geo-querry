# ADR-0004: Durable Queue Selection — River over PostgreSQL

## Status
Accepted

## Context
GeoQuerry requires a durable background job execution framework for:
1. Asynchronous GIS parsing and spatial geometry extraction.
2. M-Pesa Daraja and Stripe payment webhook processing and reconciliation retries.
3. Offline sync delta processing and batch tombstone garbage collection.
4. Outbound audit event publishing and external notification delivery.

Previous discussions mentioned potential alternatives such as Redis Pub/Sub or pg-boss. A definitive, supported technology must be selected and recorded.

## Decision
1. **Authoritative Engine Selection**:
   - **River** (`github.com/riverqueue/river`) is selected as the exclusive durable job queue implementation.
   - Built natively for Go and PostgreSQL, utilizing PostgreSQL transactional semantics and advisory locks (`SKIP LOCKED`).

2. **Rejection of Redis Pub/Sub as Primary Queue**:
   - Redis Pub/Sub provides no durability, persistence, or backpressure across worker restarts.
   - Using Redis introduces two-phase commit failure risks between Postgres mutations and Redis queue pushes.

3. **Core Operational Principles with River**:
   - **Transactional Outbox / Enqueue**:
     Job insertion occurs within the *exact same PostgreSQL database transaction* that updates the business entities (e.g. inserting an unverified payment webhook event and enqueuing its verification job atomically).
   - **Mandatory Idempotency**:
     All River job workers must be strictly idempotent. Because River guarantees *at-least-once* execution, worker handlers must check entity state and deduplicate operations using unique business keys.
   - **Dead-Letter Queue (DLQ) and Exponential Backoff**:
     Jobs define explicit retry policies (default 5 retries with exponential backoff and jitter). Exhausted jobs transition to a `discarded` / dead-letter state, raising high-priority observability alerts.
   - **Work Isolation and Dedicated Queues**:
     - `queue_default`: General application maintenance.
     - `queue_payments`: High-priority billing reconciliation and webhook processing.
     - `queue_gis_quarantine`: CPU/memory-intensive GIS parsing dispatched to isolated worker nodes with strict resource limits.

## Consequences
- Guaranteed zero-data-loss execution: jobs cannot be orphaned if an application process crashes immediately after a database commit.
- Minimized infrastructure footprint: no additional Redis cluster required for background job durability on free/low-cost tiers (Neon).
- Full observability through PostgreSQL queryable job tables (`river_job`).
