# Phase 5.33: OpenClaw Gateway Config Validation Fix
> Status: Planned
> Date: 2026-05-03
> Type: Backend compatibility / gateway startup

## Background

OpenClaw 2026.4.27 validates `~/.openclaw/openclaw.json` strictly before starting the gateway. DragonClaw currently stores agency employee ownership metadata directly in `agents.list` as `dragonclawManagedSource`, which OpenClaw rejects as an unknown key. The gateway then exits before binding port `18789`, leaving the homepage chat stuck on WebSocket connection errors.

## Goals

- Remove DragonClaw-only metadata from OpenClaw runtime config.
- Preserve installed employee detection, reinstall, and uninstall behavior.
- Automatically migrate polluted configs before service startup.
- Avoid marking the homepage service as ready when the gateway process exits early.
- Keep all existing Tauri command signatures unchanged.

## Implementation Scope

### 1. Agency Employee Metadata

- Stop writing `dragonclawManagedSource` into `agents.list`.
- Store DragonClaw ownership in a sidecar marker file under the managed agent/workspace path.
- Treat existing `dragonclawManagedSource: agency-roster` entries as legacy managed entries during migration.

### 2. Config Migration

- Add a small migration helper that removes legacy `dragonclawManagedSource` keys from `openclaw.json`.
- Backfill sidecar marker files for valid installed agency employees.
- Run the migration from agency install/uninstall/list operations and before service startup.

### 3. Service Startup Reliability

- Start service only after the config is sanitized.
- If the gateway child exits quickly or the target port never listens, clear stale runtime state and return an explicit startup error.
- Keep logs available for diagnosis without changing command signatures.

## Acceptance Criteria

- A polluted `openclaw.json` is cleaned automatically and OpenClaw gateway starts.
- `openclaw gateway status --json --port 18789` reports a live listener and healthy RPC after startup.
- Installed agency employees remain visible and uninstallable after migration.
- Installing or uninstalling employees never writes `dragonclawManagedSource` back into `openclaw.json`.
- `npm run build` passes.
- `cargo test --manifest-path src-tauri\Cargo.toml --lib` passes.
- `docs/TODO.md` remains unchecked until manual UI acceptance.
