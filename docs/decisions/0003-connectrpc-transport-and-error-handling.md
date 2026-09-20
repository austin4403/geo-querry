# ADR-0003: ConnectRPC Transport, Codecs, and Error Convention

## Status
Accepted

## Context
GeoQuerry requires communication between:
1. Browser Next.js application and Go backend.
2. Flutter / Tauri clients and Go backend.
3. Microservices and isolated background workers.

We need a high-performance, strictly typed RPC protocol that works seamlessly across standard web browsers (HTTP/1.1 and HTTP/2), mobile networks, and desktop runtimes without requiring heavy gRPC proxies.

## Decision

### 1. Protocol and Transport Selection
- **Framework**: ConnectRPC (`connectrpc.com`).
- **Protocols Supported**:
  - Connect protocol (HTTP POST with JSON or Binary Protobuf payload).
  - gRPC protocol over HTTP/2.
  - gRPC-Web protocol over HTTP/1.1 and HTTP/2.
- **Payload Codecs**:
  - Binary Protocol Buffers (`application/proto`): Primary codec for high-throughput mobile sync and telemetry streams.
  - JSON (`application/json`): Enabled for browser debugging and Next.js BFF fallback.

### 2. Error Conventions and Machine-Readable Error Codes
- **Connect Error Codes**: Mapped to standard Connect / gRPC status codes:
  - `CodeUnauthenticated`: Missing or invalid bearer token/assertion.
  - `CodePermissionDenied`: Authenticated entity lacks required tenant or project permission.
  - `CodeNotFound`: Target resource does not exist or caller has no visibility (avoiding enumeration).
  - `CodeInvalidArgument`: Request failed schema or runtime validation.
  - `CodeFailedPrecondition`: Business state mismatch (e.g. invalid status transition).
  - `CodeAborted` / `CodeAlreadyExists`: Conflict resolution or unique constraint breach.
  - `CodeInternal`: System-level failures.
- **Structured Error Details**:
  - Custom protobuf error detail message `ErrorInfo` attached to `connect.Error`:
    ```protobuf
    message ErrorInfo {
      string error_code = 1;     // e.g. "GEO_TENANT_ACCESS_DENIED", "GEO_SUDO_REQUIRED"
      string message = 2;        // Safe, human-readable message for end users
      string correlation_id = 3; // Trace/Request correlation identifier
      map<string, string> metadata = 4;
    }
    ```
  - **Zero Leakage Rule**: Internal SQL errors, stack traces, host paths, database constraint names, and infrastructure identifiers **must never** be emitted in response bodies. Detailed diagnostic logs are captured exclusively in server-side structured telemetry linked by `correlation_id`.

### 3. Pagination and Idempotency
- **Cursor-Based Pagination**:
  - All paginated endpoints utilize opaque, base64-encoded cursors encoding `(created_at, id)`.
  - Offset-based pagination (`OFFSET N`) is prohibited on large spatial and observation datasets to prevent quadratic query degradation.
- **Idempotency Headers**:
  - Mutation endpoints accept an `Idempotency-Key` header (UUIDv4) cached in Redis or PostgreSQL outbox/inbox to prevent duplicate billing charges, double survey inserts, or redundant job dispatches.

## Consequences
- Single protobuf definition drives server handlers and strongly-typed TypeScript and Dart client SDKs.
- Clean debugging via standard HTTP tooling (cURL, browser dev tools).
- Robust client-side error handling keyed to machine-readable error codes.
