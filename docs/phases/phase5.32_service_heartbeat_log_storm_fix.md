# Phase 5.32: Service Heartbeat and Log Storm Hang Fix
> Status: Planned
> Date: 2026-05-03
> Type: Backend stability / homepage responsiveness

## Background

After Phase 5.31, the ready homepage chunk no longer contains employee data or markdown parser code, but Windows Event Viewer still reports `dragonclaw.exe` as an application hang. The strongest remaining risk is the service lifecycle path:

- Each successful OpenClaw service start creates another permanent `service-heartbeat` thread.
- The frontend heartbeat listener calls `is_service_running` on every heartbeat.
- On Windows, external process checks spawn `powershell Get-Process` synchronously and without timeout.
- OpenClaw stdout/stderr lines are emitted one by one as WebView events, so noisy startup logs can still flood the homepage event loop.

## Goals

- Ensure only one heartbeat monitor can run in the app process.
- Remove PowerShell from routine Windows process liveness checks.
- Avoid overlapping frontend service status probes.
- Batch high-frequency service logs before they cross into the WebView event loop.
- Preserve every existing Tauri command signature.

## Implementation Scope

### 1. Backend Service Status

- Add a heartbeat singleton or generation guard to `ServiceState`.
- Make `is_service_running` prefer the owned child process and `try_wait` before falling back to tracked/runtime state validation.
- Replace Windows `powershell Get-Process` with a native Win32 process check using `OpenProcess`, `GetExitCodeProcess`, and `CloseHandle`.
- Add a short timeout to remaining external process commands such as `taskkill`.

### 2. Heartbeat Event Flow

- Emit heartbeat payloads with current running state and port so the frontend does not need to invoke `is_service_running` for every heartbeat.
- Slow heartbeat cadence to about 5 seconds and avoid emitting idle heartbeats after the service is known stopped.
- Keep startup fallback polling, but guard it against overlapping `is_service_running` calls.

### 3. Log Event Batching

- Batch service stdout/stderr lines for roughly 200-250ms before emitting them to the frontend.
- Keep ready/error signal detection prompt enough to finish startup without waiting for a large log backlog.
- Update the frontend log listener to accept both legacy single-log events and the new batch event.
- Keep the 300-entry log cap and avoid deriving log drawer UI data unless the drawer is open.

## Acceptance Criteria

- `npm run build` passes.
- `cargo test --manifest-path src-tauri\Cargo.toml --lib` passes.
- Starting, stopping, and restarting the service repeatedly does not create multiple heartbeat loops.
- The ready homepage remains draggable and clickable while the gateway is connecting, reconnecting, or failing.
- DragonClaw no longer periodically spawns PowerShell just to check whether OpenClaw is running.
- High-frequency OpenClaw logs do not freeze the homepage when the log drawer is closed.
- `docs/TODO.md` remains unchecked until manual UI acceptance.
