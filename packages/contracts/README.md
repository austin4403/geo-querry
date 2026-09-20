# GeoQuerry API & ConnectRPC Contracts

This package contains the single authoritative Protocol Buffer schema definitions for all GeoQuerry services across Web BFF, Go Core, Sandboxed Workers, Mobile (Flutter), and Desktop (Tauri).

## Directory Structure
```
packages/contracts/
├── v1/
│   ├── common.proto     # ErrorInfo, cursor pagination primitives
│   ├── auth.proto       # Ed25519 assertion exchange, sudo verification
│   ├── tenant.proto     # Organizations, projects, members, RBAC
│   ├── billing.proto    # Plans, M-Pesa STK push, Stripe checkout, entitlements
│   ├── gis.proto        # Dataset upload quarantine, bounds, CRS metadata
│   ├── sync.proto       # Offline sync batch push/pull, conflict resolution
│   ├── telemetry.proto  # Real-time positions, stream tickets, sequence tracking
│   ├── geology.proto    # Observations, stations, lithology, structural models
│   ├── media.proto      # Presigned photo upload contracts
│   └── audit.proto      # Audit log retrieval
├── buf.yaml             # Buf configuration
├── buf.gen.yaml         # Code generation targets
└── README.md
```

## Backward Compatibility & Field Hygiene Rules
1. **Never change field numbers**: Once assigned, tag numbers are immutable.
2. **Never reuse deleted tags**: Deleted fields must be declared `reserved <number>, "<field_name>";`.
3. **Never trust client-submitted authorization**: Fields like `role`, `organization_id`, `price`, or `entitlement` passed by clients are never authoritative. Go core resolves all permissions against the database.
4. **No raw SQL or stack traces**: Handlers must attach `ErrorInfo` with machine-readable error codes (`error_code`).

## Code Generation
Generate Go and TypeScript client bindings via:
```bash
export PATH=$PATH:$(go env GOPATH)/bin
cd packages/contracts
buf generate
```
