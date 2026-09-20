# Security Control: Sudo Mode and Elevated Re-Authentication

## 1. Purpose
Sudo mode protects high-impact tenant and account operations against session hijacking, unattended browser terminals, and cross-site scripting attacks.

## 2. Operations Requiring Sudo Mode
Any request executing the following actions requires an active sudo verification:
- Transferring organization ownership (`TransferOrganizationOwnership`).
- Deleting an organization or project (`DeleteOrganization`, `DeleteProject`).
- Removing an organization member (`RemoveMember`).
- Modifying member roles to or from `admin` / `owner`.
- Creating, regenerating, or deleting API keys (`CreateApiKey`, `RevokeApiKey`).
- Changing billing payment methods, initiating refunds, or canceling enterprise plans.
- Modifying organization spatial Coordinate Reference System (CRS) project definitions.
- Exporting raw survey datasets or sensitive mineral assay observations.

## 3. Sudo Mode Mechanism
1. **Verification Challenge**:
   - The user must submit their primary password or pass an MFA challenge (TOTP or WebAuthn/Passkey).
2. **Sudo Window**:
   - Upon successful verification, the session enters elevated status with a maximum duration of **15 minutes**.
3. **Internal Assertion Claim**:
   - The assertion contains a `sudo_exp` claim (Unix epoch).
   - If `sudo_exp < current_timestamp`, the Go core service rejects the sensitive operation with `CodeFailedPrecondition` and machine-readable error `GEO_SUDO_REQUIRED`.
   - The Next.js BFF catches this error and presents the user with an in-context re-authentication dialog without resetting the current form or workflow.
