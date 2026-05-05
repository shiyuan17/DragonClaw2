# Phase 5.42a: Security Hotfix

> Status: Planned
> Date: 2026-05-05
> Type: Security hardening / hotfix

## Goal

Close the highest-risk security gaps without changing product behavior, Tauri command signatures, or existing frontend `invoke()` payload shapes:

- block `.env` injection in email binding writes;
- remove predictable / over-exposed gateway token paths;
- tighten sensitive credential persistence and cleanup boundaries;
- add integrity verification to install / plugin downloads.

## Implementation Scope

### 1. Email Binding `.env` Safety

- Reject or safely escape user-controlled values before writing `.env`.
- At minimum, forbid newline, carriage return, `=`, NUL, and other control characters in:
  - email account
  - authorization code
  - custom IMAP/SMTP hosts
- Keep existing `load_imap_smtp_email_binding` / `save_imap_smtp_email_binding` command shapes unchanged.

### 2. Gateway Token Boundary

- Remove fallback to a predictable default token in runtime use.
- Continue reading the real token from `openclaw.json` through the config repository.
- Stop opening Control UI with `?token=...` in the browser URL.
- Replace query-token transport with a shorter-lived or local-only handoff that does not expose the token in browser history.

### 3. Credential Retention

- Audit email / channel / QR credential writes and trim them to the minimum necessary persistence surface.
- Make cleanup explicit when temporary QR sessions or onboarding artifacts complete or fail.
- Do not widen frontend-readable credential surfaces in this phase.

### 4. Download / Plugin Integrity

- Add checksum verification or an equivalent integrity check for installer / plugin download paths used in this launcher.
- Fail closed on mismatch and surface a structured, user-readable error.

## Constraints

- Do not change any existing Tauri command name, parameter list, or return type.
- Do not mix startup-state refactors or UI redesign into this phase.
- Preserve existing happy-path behavior for already valid email/channel inputs.

## Acceptance Criteria

- Invalid email binding input can no longer inject extra `.env` entries.
- Gateway token is no longer passed in the Control UI browser URL.
- Runtime startup no longer falls back to a predictable default gateway token.
- Integrity failures abort install / plugin preparation with a clear error.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- Manual regression:
  - email binding save with normal values still works;
  - malicious newline / `=` payloads are rejected;
  - opening browser / Control UI still works;
  - checksum mismatch stops the relevant install path.
