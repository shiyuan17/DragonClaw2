# Phase 5.42a: Security Hotfix

> Status: In Progress
> Date: 2026-05-06
> Type: Security hardening / conservative hotfix

## Goal

Land the low-risk security fixes that do not change OpenClaw startup behavior, Control UI handshake semantics, Tauri command signatures, or existing frontend `invoke()` payload shapes.

This phase is intentionally scoped to avoid any regression in:

- launcher-driven OpenClaw startup;
- browser-opened Control UI availability;
- gateway auth handshake success;
- workspace chat/session recovery behavior.

## Confirmed Boundary

We verified that the current Control UI startup path still depends on a boot token being hydrated at page open time and then persisted into same-tab session storage for the gateway handshake.

Because of that:

- do **not** directly remove `#token=` from the Control UI open URL in this phase;
- do **not** directly disable or rewrite full workspace chat cache persistence in this phase.

Both are deferred until a replacement handoff / retention strategy is designed and regression-tested.

## Implementation Scope

### 1. Workspace Cron Agent Binding Safety

- Fix the `workspace-clone` cron drawer so `agentId === null` no longer falls back to `main`.
- When the current channel has no bound runtime Agent:
  - do not issue `cron.*` requests;
  - clear tasks, selected task, and cached run details;
  - surface an explicit unavailable/error state for the current context.
- Keep the existing hook return shape and caller contracts unchanged.

### 2. Composer Model Switch Recovery

- Fix the workspace composer model menu so a failed `handleSetModel` call always clears `switchingId`.
- Preserve the current success path.
- On failure, keep the menu usable instead of leaving it in a permanent busy state.

### 3. Workspace Token Layer Repair

- Add the missing `--dc-workspace-accent-border` token in `src/styles/tokens.css`.
- Derive it from the existing workspace accent / selection palette instead of introducing a parallel visual source of truth.
- Do not redesign the component styles; only restore the dropped active/focus/selected border states.

## Deferred Items

### A. Control UI Gateway Token Exposure

- Do not change `src-tauri/src/control_ui.rs` in this phase.
- Follow-up phase must replace URL token transport with a short-lived, local-only handoff before the fragment is removed.
- Any follow-up must prove that "open browser -> hydrate auth -> connect gateway -> enter session" still succeeds.

### B. Workspace Chat Cache Persistence

- Do not change the current chat-cache command signatures or persistence semantics in this phase.
- Follow-up phase should evaluate OS-level protection, configurable retention, or a safer local persistence layer without breaking:
  - refresh-time session restore;
  - history title recovery;
  - last-message previews;
  - fast local session switching.

## Constraints

- Do not change any existing Tauri command name, parameter list, or return type.
- Do not change existing frontend `invoke()` payload shapes.
- Do not change OpenClaw gateway startup flags or the current Control UI handshake contract.
- Keep the hotfix limited to the smallest set of files needed for the three low-risk fixes above.

## Acceptance Criteria

- Unbound channels no longer read or mutate `main` Agent cron tasks.
- A failed workspace model switch no longer leaves the composer model menu permanently busy.
- Workspace active/focus/selected borders that depend on `--dc-workspace-accent-border` render again.
- Control UI browser opening and gateway session success remain unchanged from the current behavior.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run tauri dev`
- Manual regression:
  - start the service and open the browser Control UI; confirm the current session still connects successfully;
  - open the workspace cron drawer in an unbound channel and confirm it does not show or mutate `main` tasks;
  - open the cron drawer for a bound Agent and confirm list / toggle / run / edit / delete still work;
  - force a model-switch failure once and confirm the menu is no longer stuck busy;
  - confirm the affected workspace active/focus/selected borders are visible again.
