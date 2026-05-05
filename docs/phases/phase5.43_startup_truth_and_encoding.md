# Phase 5.43: Startup Truth Source and Encoding Cleanup

> Status: Planned
> Date: 2026-05-05
> Type: Startup state convergence / text integrity

## Goal

Make backend lifecycle state the only ready/failure source the frontend trusts, and clean up the highest-exposure mojibake text on startup, settings, chat, binding, and service diagnostics.

## Implementation Scope

### 1. Single Ready Source

- Frontend startup flow must rely on `get_service_lifecycle_snapshot` and `service-lifecycle`.
- Remove optimistic ready transitions that enter workspace before backend lifecycle reaches `ready`.
- Keep `AppPhase` focused on shell routing (`checking / initializing / workspace`) and not service readiness inference.

### 2. Startup Flow Convergence

- Collapse `useSetup` and `useService` startup semantics into one path:
  - check environment
  - start or reuse service
  - wait for structured lifecycle `ready`
  - enter workspace
- Startup failure must stay recoverable and visible through structured state, not inferred log text.

### 3. High-Exposure Mojibake Cleanup

- Repair user-facing strings in:
  - app shell and startup overlay
  - setup / reinstall / service actions
  - workspace-clone high-frequency feedback
  - service / control UI logs shown to users
- Keep cleanup scoped to real user-facing text and compile-critical source corruption.

## Constraints

- Do not change existing command signatures or `invoke()` payloads.
- Do not refactor unrelated workspace business logic in this phase.
- Preserve existing service event names; only change how the frontend consumes readiness.

## Acceptance Criteria

- The frontend no longer reaches workspace solely because environment/config exists while the service is still starting.
- Structured lifecycle transitions cover:
  - `null -> service-starting -> ready`
  - `null -> service-starting -> failed`
  - `ready -> null` on stop
- High-exposure mojibake strings are removed from the startup and ready-workspace path.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- `npm run tauri dev`
- Manual regression:
  - first launch setup;
  - reuse existing service;
  - startup failure;
  - manual stop / restart;
  - open gateway -> chat works.
