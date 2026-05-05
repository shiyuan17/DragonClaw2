# Phase 5.49: Homepage Chat Connection Truth Fix

> Status: In Progress
> Date: 2026-05-05
> Type: Frontend reconnect resilience / backend lifecycle truth

## Goal

Fix the homepage chat false-negative connection experience and keep service lifecycle state aligned with the real OpenClaw process state.

## Scope

### 1. Frontend reconnect behavior

- Treat transient WebSocket failures as recoverable until the current connection round truly fails.
- Clear stale chat error text on `connecting` and immediately after handshake success.
- Keep the UI in a neutral connecting state while gateway bootstrap data is still loading.

### 2. Backend lifecycle hardening

- Detect child exits immediately after `ready`, without waiting for a stale first heartbeat window.
- Clear stale runtime state files and surface that condition through structured lifecycle failure detail.
- Record unexpected child exit diagnostics with `pid`, `port`, and `started_at`.

### 3. Minimal startup diagnostics

- Emit service-log entries for stale runtime cleanup, RPC validation restart, and unexpected child exits.
- Log a plugin summary during service startup for later root-cause correlation.

## Constraints

- Do not change any Tauri command signature or frontend `invoke()` contract.
- Keep the gateway protocol and homepage chat request flow unchanged.
- Do not disable plugins automatically as part of this fix.

## Validation

- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`
- Manual checks:
  - transient `1006` followed by reconnect does not leave a stale error on screen
  - child exit within 0-5 seconds after ready becomes failed/stopped in the same session
  - stale runtime state with no listener no longer looks online
