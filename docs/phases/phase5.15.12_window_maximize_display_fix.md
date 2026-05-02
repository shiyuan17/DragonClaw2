# Phase 5.15.12: Window Maximize Display Fix

## Background

After the native Windows titlebar was removed, double-clicking the custom titlebar can still fail to trigger the expected maximize / restore toggle when the drag surface captures the press sequence first.

The previous padding-based shell compensation also made maximized content look cropped instead of truly filling the window.

## Scope

- Keep the existing Tauri maximize / restore behavior unchanged.
- Keep all `invoke()` calls, hooks, and backend commands unchanged.
- Fix the visual shell only so maximized borderless windows use the full client area.

## Implementation Notes

1. Let the native drag region handle window dragging.
2. Keep double-click maximize / restore attached to the custom titlebar surface.
3. Leave the shell edge-to-edge so maximized windows use the full client area.
4. Keep fixed overlays aligned to the real window bounds.

## Validation

1. `npm run build`
2. `npm run tauri dev`
3. Manual check on Windows:
   - double-clicking the custom titlebar still maximizes and restores
   - double-clicking the titlebar toggles maximize / restore reliably
   - the app fills the maximized window instead of shrinking inward
   - modal and startup overlays still cover the whole client area

## Rollback

- Reintroduce a client-area inset only if a verified Tauri or window-manager fix requires it.
