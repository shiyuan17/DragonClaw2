# Phase 5.72.4: OpenClaw Config Safety Hardening

> Status: Planned
> Date: 2026-05-12
> Type: Backend config safety

## Goal

Harden DragonClaw's OpenClaw config read/write path without changing the existing OpenClaw startup flow, Tauri command signatures, or frontend `invoke()` contracts.

## Implementation Scope

### 1. Safe Config Writes

- Keep `~/.openclaw/openclaw.json` as the only user config file.
- Route config replacement through `ConfigRepository`.
- Serialize to a temporary file, validate the candidate JSON, replace conservatively, and restore the previous file if replacement fails.
- Preserve a timestamped backup for troubleshooting.

### 2. Advanced Config Guard

- Detect OpenClaw advanced config patterns that DragonClaw cannot safely round-trip yet:
  - JSON5 comments or trailing commas;
  - root-level `$include`.
- Refuse destructive whole-file rewrites in those cases and return a clear error pointing users to the official OpenClaw config patch path.

### 3. Compatibility First

- Preserve existing provider fields and unknown fields.
- Do not overwrite object-shaped or SecretRef-style `apiKey` values when the user saves a provider without entering a new key.
- Keep `agents/main/agent/models.json` sync for current agent compatibility, but update it through merge-style provider replacement and fail loudly on sync errors.
- Keep `gateway --allow-unconfigured` for this phase to avoid first-run regressions.

### 4. Safer Gateway Defaults

- Continue rotating empty or legacy fixed gateway tokens.
- Stop adding insecure Control UI flags to new gateway config.
- Preserve existing insecure flags if a user's config already contains them.

## Constraints

- No Tauri command signature changes.
- No frontend `invoke()` payload changes.
- No OpenClaw config directory migration.
- Do not remove existing user config fields.
- Do not introduce OpenClaw CLI patching as the default write path in this phase.

## Acceptance Criteria

- Normal JSON configs continue to save and launch OpenClaw.
- Existing random gateway tokens are preserved.
- Empty or legacy fixed gateway tokens are rotated.
- Existing `controlUi` flags are preserved, but new configs no longer add insecure flags.
- `$include` configs and likely JSON5 configs are not rewritten by DragonClaw.
- Provider saves preserve unknown fields and existing non-string `apiKey` values when no new key is supplied.
- Failed derived `models.json` sync surfaces an error instead of being silently swallowed.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- Rust unit tests for config write safety and gateway defaults
- Manual regression:
  - save provider;
  - switch default model;
  - start OpenClaw service;
  - open Control UI;
  - send one chat message.
