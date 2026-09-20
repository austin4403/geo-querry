# ADR-0006: Server-Sent Events (SSE) Real-Time Authentication and Replay

## Status
Accepted

## Context
GeoQuerry provides real-time geological field team telemetry, compass tracking, and collaborative map updating via streaming connections. Standard Server-Sent Events (`EventSource`) natively do not allow custom `Authorization: Bearer <token>` HTTP headers in standard browser implementations.

Passing long-lived access tokens or session cookies in URL query parameters (`?token=...`) exposes credentials to:
- Access logs in reverse proxies and Cloudflare edge caches.
- Browser URL history and bookmarks.
- Referrer headers leaked to third-party assets.

## Decision

### 1. Authentication Mechanisms for Streaming
- **Web Browsers (BFF Domain)**:
  - Streaming uses `fetch` with a `ReadableStream` reader where custom headers can be supplied, or authenticated `EventSource` leveraging secure `HttpOnly`, `SameSite=Strict` cookies.
- **Native / Non-Cookie Clients (Stream Tickets)**:
  - Native clients or cross-origin streams acquire a short-lived, single-use stream ticket via an authenticated POST request:
    `POST /geoquerry.v1.TelemetryService/AcquireStreamTicket`
  - Ticket Properties:
    - Cryptographically random string (256-bit entropy).
    - Stored in-memory or Redis/PostgreSQL with a TTL of **30 seconds**.
    - Single-use: consumed and invalidated immediately upon SSE connection handshake.
    - Bound to the requesting user, tenant organization, and authorized project ID.
- **Continuous Re-Authorization**:
  - Closing an active stream is not the only revocation control. Every reconnect attempt must perform a full tenant membership check.
  - Active streams subscribe to an internal revocation channel; upon user suspension or role revocation, active connections are terminated by the server immediately.

### 2. Stream Replay Buffer and Snapshot Fallback
- **Last-Event-ID / Sequence Cursor**:
  - Telemetry and sync events stream with monotonically increasing sequence IDs (`seq_id`).
  - Clients pass `Last-Event-ID` on reconnect.
- **In-Memory Ring Buffer**:
  - The Go telemetry hub maintains a rolling ring buffer of recent events (default: 1,000 events or 10 minutes per active project channel).
  - Reconnects within the buffer window receive gapless replay.
- **90-Day Retention Floor & Snapshot Fallback**:
  - If a client's sequence or sync cursor falls outside the buffer window or predates the **90-day retention floor**, the server returns `SYNC_CURSOR_EXPIRED` / `ERR_REPLAY_GAP`.
  - The client must request a full authorized snapshot (`PullProjectSnapshot`) rather than an incremental replay.

## Consequences
- No credential leakage in HTTP logs or browser histories.
- Instantaneous revocation across active real-time connections.
- Clean recovery from brief network drops in the field without overwhelming database resources.
