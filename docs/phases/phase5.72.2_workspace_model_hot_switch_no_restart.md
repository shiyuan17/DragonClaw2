# Phase 5.72.2: Workspace 模型热切换不重启服务

> Status: Planned
> Date: 2026-05-12
> Type: Workspace model switching hotfix

## Goal

Align DragonClaw with OpenClaw's runtime model switching semantics: changing the chat model or saved provider config must update configuration and UI state without restarting the OpenClaw service.

## Scope

- Remove automatic `stop_service` / `start_service*` calls from model switching flows.
- Remove automatic service restart from provider create, update, and delete flows.
- Keep manual service lifecycle actions unchanged, including tray restart, explicit start/stop, and connection repair.
- Preserve all existing Tauri command names, parameter shapes, return types, and Gateway contracts.

## Implementation Notes

- `useConfig` remains the shared source for saving config, switching the default model, refreshing current config, and bumping config version.
- `ModelsTab` model-chip switching refreshes config only; it must not own service lifecycle state.
- Workspace composer model switching continues to use the existing `set_default_model` command through `handleSetModel`.
- Provider deletion keeps the backend fallback behavior for the active model; only the frontend restart side effect is removed.

## Acceptance Criteria

- Switching models from the workspace composer updates the selected model and does not stop or restart OpenClaw.
- Switching models from the legacy model switch modal and AI Engine model chips also does not restart OpenClaw.
- Adding, editing, or deleting a provider refreshes UI/config state without restarting OpenClaw.
- Manual restart and repair flows still work as before.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- `npm run tauri dev`
- Manual regression: start service, switch models, save/delete providers, confirm uptime does not reset and chat still works.
