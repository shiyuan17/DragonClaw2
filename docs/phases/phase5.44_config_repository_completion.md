# Phase 5.44: Config Repository Completion

> Status: Planned
> Date: 2026-05-05
> Type: Backend config convergence

## Goal

Finish the `openclaw.json` write-entry consolidation so config writes go through `ConfigRepository`, and eliminate silent partial-success behavior in `save_api_config`.

## Implementation Scope

### 1. Repository-Only Writes

- Move high-frequency config writers to repository-backed mutation helpers:
  - `config.rs`
  - `agents.rs`
  - `agency_agents.rs`
  - `agent_resource_settings.rs`
  - `provider_mgr.rs`
  - `setup.rs`
  - `channels/*` config writes
- Keep read-side compatibility, but stop scattering direct read-modify-write save paths.

### 2. `save_api_config` Consistency

- Replace the current broad double-write behavior with:
  - one authoritative `openclaw.json` write;
  - explicit derived sync for `agents/main/agent/models.json`.
- If the derived sync fails, surface a clear failure or partial-failure result instead of swallowing the error.

### 3. Atomic Write Hardening

- Make config file replacement more conservative than “delete old then rename”.
- Preserve existing serialized JSON shape and normalization semantics.

## Constraints

- No schema change for `openclaw.json`.
- No Tauri command signature or `invoke()` payload change.
- Do not mix startup-state refactors or UI cleanup into this phase.

## Acceptance Criteria

- Targeted config mutation paths no longer call direct ad hoc `write_openclaw_config` flows.
- `save_api_config` cannot silently succeed when derived agent model sync fails.
- Config replacement logic does not delete the old file before the new file is safely in place.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- Manual regression:
  - save API config;
  - switch default model;
  - add/update/delete saved provider;
  - create/update/delete managed agents;
  - verify `openclaw.json` shape remains unchanged.
