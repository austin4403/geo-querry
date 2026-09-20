# Cross-Agent Contract Change Process

To prevent breaking changes across web, Go backend, desktop, and mobile clients, any proposed change to shared contracts (`packages/contracts/`) must adhere to this formal process.

## 1. Request for Contract Change
Any subagent or engineer proposing a modification to Protobuf or API schemas must file a **Contract Change Proposal** containing:
1. **Business Justification**: Problem statement and necessity of schema alteration.
2. **Security & Tenancy Impact**: How tenant boundaries and authorization checks are maintained.
3. **Compatibility Analysis**: Proof that existing clients will not break:
   - Field numbers cannot be changed or reassigned.
   - Removed fields must be marked with `reserved <number>, "<name>";`.
   - Adding required or non-optional semantics must be avoided.
4. **Migration Strategy**: Rollout plan across backend, web, and native mobile/desktop deployments.

## 2. Approval Gate
- **Sole Approver**: Architecture and Integration Lead.
- Changes cannot be merged into `main` without explicit approval and regenerated client libraries across all target languages.

## 3. Execution Pipeline
1. Edit contract files in `packages/contracts/v1/`.
2. Execute `buf lint` and `buf breaking --against ".git#branch=main"`.
3. Generate client stubs:
   ```bash
   cd packages/contracts && buf generate
   ```
4. Verify compiling client code in `backend/` and `web/`.
5. Update contract regression tests.
