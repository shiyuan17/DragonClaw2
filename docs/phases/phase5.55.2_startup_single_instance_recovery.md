# Phase 5.55.2: Startup Single-Instance Recovery and Freeze Fix

## Goal

Stabilize DragonClaw startup so the app no longer hangs on `checking / launching` when stale OpenClaw processes or slow readiness probes exist.

## Problem

- The frontend currently triggers multiple service lifecycle snapshot reads during mount, which increases startup contention.
- `get_service_lifecycle_snapshot` performs blocking persisted-process validation, so a "snapshot" request can stall the UI for tens of seconds.
- Historical launcher-owned OpenClaw processes can remain alive across quits, and failed reuse does not fully clean those stale launcher-owned processes.
- When the setup flow detects `service-starting`, it can wait only on lifecycle events and miss the ready transition if the event arrives before the listener settles.

## Scope

- Keep all existing Tauri command names, parameters, and return types unchanged.
- Keep the persistent-service behavior from Phase 5.55: quitting DragonClaw should not proactively stop a healthy OpenClaw background process.
- Make lifecycle snapshot reads fast and non-blocking.
- Add launcher-owned stale process recovery before starting a new OpenClaw instance.
- Ensure the setup flow has polling and timeout fallbacks even when lifecycle events are missed.

## Implementation Notes

- Frontend:
  - Use one startup truth path for initial lifecycle hydration instead of multiple competing snapshot reads.
  - Reuse the existing launch polling path when startup resumes from `service-starting`.
  - Add a visible setup timeout/error state so `checking` cannot hang forever without an actionable retry.
- Backend:
  - Change `get_service_lifecycle_snapshot` to return current known state quickly without synchronous RPC validation.
  - Move persisted-process RPC validation and stale launcher-process cleanup into background recovery and service-start paths.
  - Before launching a new service, identify launcher-owned OpenClaw gateway processes under the sandbox, keep at most one healthy instance, and terminate invalid/stale ones.
  - Prefer the last known healthy port before falling back to wide port scanning.
  - Improve service logs so recovery steps clearly show reuse, stale runtime cleanup, and forced restart decisions.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `cargo test` or targeted Rust test coverage for service recovery helpers if available
- `npm run tauri dev`
- Manual repeated startup validation:
  - clean state cold start
  - warm start with a healthy persisted OpenClaw process
  - stale runtime state file with no live process
  - stale launcher-owned process that listens but fails RPC readiness
  - multiple launcher-owned OpenClaw processes from prior runs
- Manual quit/reopen validation: DragonClaw can exit while leaving one healthy OpenClaw service alive, and a relaunch reuses that instance instead of creating another.
