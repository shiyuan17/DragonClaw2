# Phase 5.55: Startup Flow Single Source and Persistent Service

## Goal

Unify DragonClaw startup into one visible flow and make OpenClaw reusable across Launcher restarts.

## Scope

- Remove the static HTML boot splash so the app opens directly into the React setup/guide surface.
- Stop showing the full-screen OpenClaw startup overlay after setup has already begun.
- Keep service startup, gateway readiness, config refresh, and first homepage chat connection coordinated by the existing setup/service lifecycle hooks.
- Prevent the homepage chat from repeating the normal startup checklist after the setup flow has already handled service readiness.
- Keep OpenClaw running when DragonClaw is closed or quit, unless the user explicitly stops or restarts the service.

## Constraints

- Do not change any Tauri command names, arguments, or return types.
- Do not change frontend `invoke()` contracts.
- Keep `start_service_silent` silent; browser opening remains an explicit user action.
- Preserve existing runtime state reuse through the persisted OpenClaw service `pid` and `port`.
- Avoid broad UI rewrites and avoid touching unrelated workspace-clone work already in progress.

## Implementation Notes

- `index.html` should keep only the minimal root mount and page baseline styles.
- `App.tsx` should no longer render `StartupOverlay` for `launching` or `service-starting`.
- The setup flow should continue using `get_service_lifecycle_snapshot` and `start_service_silent` as the source of truth for ready detection.
- The homepage chat startup panel should be reserved for exceptional states, such as a stopped service, missing token, or connection failure.
- Tray quit should exit DragonClaw without calling `stop_service`, leaving the OpenClaw process and runtime state available for the next launch.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- `npm run tauri dev`
- Manual cold-start check: no Booting page and no full-screen OpenClaw startup overlay.
- Manual warm-start check: existing OpenClaw process is reused and homepage chat becomes available quickly.
