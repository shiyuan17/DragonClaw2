# Phase 5.55.1: Gateway RPC Readiness Grace

## Goal

Prevent OpenClaw startup from being treated as failed while the gateway sidecars are still warming up.

## Problem

OpenClaw v2026.5.4 can accept the gateway port before RPC sidecars are fully ready. During this window, `openclaw gateway status --require-rpc` may return or time out with transient startup states such as `startup-sidecars-pending` or `gateway starting`. DragonClaw currently treats that probe failure as fatal once the wait path times out, then kills and clears a service that may become ready moments later.

## Scope

- Keep the existing Tauri command signatures and frontend `invoke()` contracts unchanged.
- Keep persistent-service behavior from Phase 5.55: DragonClaw quit must not proactively stop OpenClaw.
- Treat local process startup separately from persisted-process reuse.
- For a newly spawned service, allow `gateway ready` log plus port acceptance to complete startup quickly.
- Keep RPC validation for persisted-service reuse and startup diagnostics, with a wider timeout window.

## Implementation Notes

- Increase the per-probe RPC readiness timeout and wrapper timeout so first-run sidecar warmup has enough room.
- Increase the total startup readiness budget to cover slow first runs that build Control UI assets.
- Split the log signal used for lifecycle readiness from broader log classification: only true `gateway ready` lines should set the startup ready flag.
- Continue polling while the child process is alive and only fail when the total readiness budget is exhausted or the child exits.
- Preserve existing failure reporting with the last RPC probe error when startup genuinely times out.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- `cargo check` or `cargo test` for `src-tauri` if available.
- Manual `npm run tauri dev` cold start: no false failure during `startup-sidecars-pending`, and startup completes after `gateway ready`.
- Manual warm start: existing OpenClaw is reused and homepage chat becomes available quickly.
