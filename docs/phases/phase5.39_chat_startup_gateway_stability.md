# Phase 5.39: Chat Startup and Gateway Stability

> Status: Implementing
> Date: 2026-05-04
> Type: Frontend startup UX / gateway reliability

## Goal

Move the ready-workspace service startup feedback into the chat canvas without mixing startup state into message rendering, composer behavior, or gateway client internals. Fix the repeated homepage chat reconnect loop by keeping the WebSocket lifecycle independent from bootstrap data updates.

## Implementation Scope

### 1. Independent Chat Startup Panel

- Add a presentational `WorkspaceCloneServiceStartupPanel` component.
- Add a small `useWorkspaceServiceStartupStatus` hook that maps service loading/running state, gateway connection state, errors, and recent logs into panel props.
- Keep the panel display-only: no Tauri invokes, no gateway client access, no global config reads.
- Default the panel to a compact startup/check/connect stepper; only reveal recent startup logs when the user clicks the log icon.
- Keep full logs in the existing logs drawer; show only compact recent startup lines inside the expanded panel log section.

### 2. Ready Workspace Startup UX

- Stop showing `StartupOverlay` for ready-workspace service start.
- Keep `SetupWizard` and first-run setup behavior unchanged.
- Let the existing `handleStart` continue to own service startup.

### 3. Gateway Client Stability

- Make the homepage WebSocket effect depend only on `running`, `servicePort`, and `gatewayToken`.
- Use refs/stable callbacks for bootstrap and event handling so `agents`, `sessions`, and selected-agent updates do not recreate the socket.
- Preserve existing gateway method names and frontend send/history behavior.

### 4. Backend Gateway Readiness

- Start OpenClaw gateway with the official token surface: `--token <token>` plus `OPENCLAW_GATEWAY_TOKEN`.
- After startup, verify readiness with `gateway status --json --require-rpc --url ws://127.0.0.1:<port> --token <token>`.
- Reuse an existing tracked process only after the same RPC/token check passes; clear stale runtime state when it fails.

## Acceptance Criteria

- `npm run build` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` passes.
- Clicking chat startup shows an in-chat panel, not a full-screen overlay.
- Startup, RPC check, connection, error retry, and collapsed/expanded logs do not shift the composer or corrupt message rendering.
- Successful startup connects once and stays connected without repeated flashing.
