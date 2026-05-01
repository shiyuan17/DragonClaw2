# Phase 5.15.10: Window Titlebar Permissions Fix

## Background

The current custom titlebar rollout on Windows still shows the native system titlebar above the in-app titlebar, creating duplicated chrome.

At the same time, the custom minimize / maximize / close buttons and drag area can render but fail to respond because the window capability set does not currently allow the required core window operations.

## Confirmed Root Causes

1. `src-tauri/tauri.conf.json` still keeps `decorations: true`, so the native Windows titlebar remains visible.
2. `src-tauri/capabilities/default.json` does not grant the custom titlebar the permissions required for:
   - close
   - minimize
   - maximize
   - unmaximize
   - toggle maximize
   - start dragging

## Scope

- Remove the native Windows titlebar so only the custom DragonClaw titlebar remains.
- Restore custom titlebar button behavior and drag behavior.
- Keep all existing business logic, Tauri commands, and tray close behavior unchanged.

## Implementation Notes

### Tauri window config

- Set the main window `decorations` to `false`.
- Remove Windows-misleading titlebar fields introduced in the previous pass:
  - `titleBarStyle`
  - `hiddenTitle`
- Keep window title, sizing, centering, shadow, and resize behavior unchanged.

### Capability permissions

- Add the minimum required window permissions to `src-tauri/capabilities/default.json`:
  - `core:window:allow-close`
  - `core:window:allow-minimize`
  - `core:window:allow-maximize`
  - `core:window:allow-unmaximize`
  - `core:window:allow-toggle-maximize`
  - `core:window:allow-start-dragging`

### Frontend titlebar behavior

- Make `Header.tsx` treat `getCurrentWindow()` success as the readiness source of truth.
- Do not rely only on `window.__TAURI__` or `window.__TAURI_INTERNALS__` to decide if controls should be enabled.
- Preserve:
  - drag on drag-region only
  - double-click maximize / restore
  - custom minimize / maximize / close buttons
- During development, log window-control failures with `console.error` instead of swallowing them silently.

### Interaction safety

- Keep buttons inside explicit `no-drag` regions.
- Do not overuse `preventDefault` in the button event path so normal clicks are not blocked.

## Validation

1. `npm run build`
2. `npm run tauri dev`
3. Manual verification on Windows:
   - native titlebar is gone
   - custom minimize works
   - custom maximize / restore works
   - custom close still hides to tray through existing backend behavior
   - drag and double-click maximize both work
   - startup, workspace-clone, and legacy home all use the same titlebar without extra top whitespace

## Rollback

- Revert the `decorations` change if native window chrome must be temporarily restored.
- Revert the new capability permissions if they unexpectedly broaden access beyond the custom titlebar flow.
