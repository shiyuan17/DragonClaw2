# Phase 5.72.3: Tauri Startup Cargo PATH Bootstrap
> Status: Planned
> Date: 2026-05-12
> Type: Tooling / startup reliability

## Summary

- Fix the local startup failure where `npm run tauri dev` aborts before launch because the Tauri CLI cannot find `cargo`.
- Keep the fix narrowly scoped to the startup wrapper and developer-facing diagnostics.
- Preserve all existing Tauri command contracts, frontend `invoke()` calls, and Rust business logic.

## Problem

- On Windows, this machine can run Cargo from `C:\Users\cobalt-47\.cargo\bin\cargo.exe`, but that directory is missing from the current `PATH`.
- `@tauri-apps/cli` calls `cargo metadata` during startup. When `cargo` is not discoverable from `PATH`, startup fails immediately with:
  - `failed to run 'cargo metadata' command to get workspace directory`
  - `program not found`

## Scope

- Add a lightweight wrapper for `npm run tauri ...` that:
  - preserves the current CLI arguments
  - probes common Rust toolchain locations on Windows
  - prepends the discovered Cargo bin directory to `PATH` for the spawned Tauri CLI process only
  - emits a clearer actionable error if Rust/Cargo is genuinely unavailable
- Update the `package.json` `tauri` script to use the wrapper.

## Out of Scope

- No changes to any `#[tauri::command]` signatures.
- No changes to frontend feature behavior or backend service logic.
- No global machine-level PATH mutation.
- No automatic Rust installation.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run tauri dev`
- Confirm the wrapper no longer fails at the initial `cargo metadata` step on this machine.

## Assumptions

- A per-process PATH bootstrap is safer than mutating the user's global environment.
- The wrapper should stay cross-platform and remain a no-op when Cargo is already discoverable.
