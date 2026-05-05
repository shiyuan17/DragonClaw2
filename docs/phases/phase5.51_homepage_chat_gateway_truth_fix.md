# Phase 5.51: Homepage Chat Gateway Truth Fix

> Status: In Progress
> Date: 2026-05-05
> Type: Backend lifecycle truth / homepage chat startup UX

## Goal

Fix the homepage chat startup loop where the UI can stay on "validating gateway" or "connecting chat" even though the tracked OpenClaw runtime state is stale and no real reusable gateway is available.

## Scope

### 1. Backend ready truth

- Unify reusable-service validation around one internal rule:
  - tracked PID is still alive
  - target port is still accepting connections
  - gateway RPC validation with the configured token succeeds
- Prevent `get_service_lifecycle_snapshot()` from synthesizing `ready` from process liveness alone.
- When stale runtime state or existing-process RPC validation fails, clear tracked runtime state and surface a structured failed or non-ready lifecycle result instead of advertising reuse.

### 2. Frontend startup phase mapping

- Keep `useSetup.checkEnvironment()` dependent on backend-validated lifecycle truth for background-service reuse.
- Make the workspace startup panel prioritize explicit connection errors over generic loading/checking copy so WebSocket handshake failures are shown as errors immediately.

### 3. Diagnostics

- Preserve existing gateway reconnect and protocol behavior.
- Distinguish stale runtime cleanup and existing-process RPC validation failures in lifecycle detail and service logs so future debugging stays actionable.

## Constraints

- Do not change any Tauri command signature, `invoke()` payload, gateway WebSocket protocol, or workspace chat send contract.
- Build on top of the existing Phase 5.49 and Phase 5.50 in-flight changes; do not revert unrelated work.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`
- `npm run tauri dev`
- Manual checks:
  - stale `~/.openclaw/openclaw-service.json` with dead PID or no listener no longer shows "reuse existing service"
  - a real reusable OpenClaw gateway still goes directly to ready
  - browser-side WebSocket handshake failures show an error phase instead of staying on checking
