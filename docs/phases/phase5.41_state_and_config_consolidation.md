# Phase 5.41: State and Config Consolidation

> Status: Implementing
> Date: 2026-05-04
> Type: Architecture refactor / state and config convergence

## Goal

Consolidate three unstable backend/frontend seams without changing product behavior, Tauri command signatures, or existing frontend `invoke()` payload shapes:

- funnel `openclaw.json` writes through one backend repository entry;
- make service lifecycle state come from one structured backend source of truth;
- remove Control UI prebuild from the service startup path.

## Implementation Scope

### 1. Config Repository

- Add a backend config subsystem under `src-tauri/src/config_store/`:
  - `file.rs`: resolve `openclaw.json`, load/save, atomic write via temp file + replace.
  - `repository.rs`: `ConfigRepository` with `load`, `replace`, `update`, and shared normalization helpers.
- Keep `src-tauri/src/config.rs` as the Tauri command boundary and `CurrentConfig` mapper.
- Move shared config normalization into the repository layer:
  - config root creation
  - gateway token/bootstrap defaults
  - default workspace bootstrap
  - workspace normalization and sandbox path sync
- Update backend callers so `openclaw.json` writes no longer bypass the repository.
- Remove the extra `paths.rs` private JSON parser and reuse the repository read path instead.

### 2. Structured Service Lifecycle

- Extend `src-tauri/src/service.rs` with a structured lifecycle snapshot:
  - status: `service-starting | ready | failed`
  - metadata: `port`, `detail`, `startedAt`, `lastError`
- Add a read-only Tauri command `get_service_lifecycle_snapshot`.
- Emit a dedicated `service-lifecycle` event whenever lifecycle state changes.
- Keep `service-heartbeat`, `service-log`, and `service-log-batch` for diagnostics, but remove frontend ready/failure inference from log text parsing.
- Add a frontend hook `src/hooks/useServiceLifecycle.ts` and update `useService.ts` / `useSetup.ts` to consume structured lifecycle state only.

### 3. Control UI Preparation

- Move Control UI build/install helpers out of `src-tauri/src/service.rs` into `src-tauri/src/control_ui.rs`.
- Remove Control UI prebuild from `start_service` / `start_service_silent`.
- Trigger Control UI preparation only from:
  - post-install / reinstall background preparation;
  - explicit browser / Control UI entry points before opening the page.
- Control UI build failure must not transition the OpenClaw service lifecycle to `failed`.

## Constraints

- Do not change any existing Tauri command name, parameter list, or return type.
- Do not change any existing frontend `invoke()` payload shape.
- Do not mix unrelated UI copy, styling, encoding cleanup, or security work into this phase.
- Preserve current `openclaw.json` serialized schema in this phase.

## Acceptance Criteria

- `openclaw.json` writes are centralized behind the new repository layer.
- The frontend no longer parses log strings to detect OpenClaw ready/failure.
- `start_service_silent` can bring the service to `ready` even if Control UI assets are missing.
- Explicit browser opening still works and can independently prepare Control UI assets when needed.
- Existing service command signatures in `src-tauri/src/lib.rs` remain compatible.

## Validation

- `npm run check:file-size`
- `npm run build`
- `npm run tauri dev`
- Manual regression:
  - first launch: config bootstrap -> service start -> chat works
  - existing background service reuse
  - startup failure surfaces as structured lifecycle `failed`
  - tray/browser entry still opens the gateway
  - missing Control UI assets do not block service startup
