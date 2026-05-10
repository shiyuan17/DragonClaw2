# Phase 5.64: Workspace 模型配置卡片回刷与显示名本地化

> Status: Planned
> Date: 2026-05-10
> Type: Workspace model-config hotfix

## Goal

Fix the `workspace-clone` model config modal so newly saved configs appear in the top card strip immediately, and move provider display names out of `openclaw.json` into DragonClaw-local persisted state.

## Background

The current workspace model config flow has two coupled problems:

- saving a new provider config updates backend state but does not immediately refresh the modal card list, so the user still sees the old cards until a manual refresh or reopen;
- provider `displayName` is currently written into `models.providers.*` inside `~/.openclaw/openclaw.json`, but that field is not part of the OpenClaw provider contract and should remain launcher-only UI metadata.

This phase is intentionally limited to the workspace model-config chain. It does not change Tauri command names, `invoke()` payload contracts, OpenClaw provider key semantics, or the underlying `providerKey/modelId` switching contract.

## Implementation Scope

### 1. Modal Save/Delete Refresh Truth

- Update `WorkspaceCloneModelConfigModal` so save success waits for `onRefreshSavedProviders()` and `onRefreshCurrentConfig()` before settling UI state.
- Rebuild the active draft from refreshed saved-provider data instead of assuming local optimistic state is sufficient.
- Apply the same refresh path after provider deletion so the card list, editing target, and active-model state remain aligned.

### 2. DragonClaw-Local Provider Display Names

- Extend `src-tauri/src/launcher_state.rs` with a persisted `provider_display_names` map keyed by `providerKey`.
- Store that metadata in `dragonclaw-launcher.json`, not in `openclaw.json`.
- Keep the current provider command signatures intact while changing the source of `SavedProvider.display_name` from OpenClaw config fields to DragonClaw-local state.

### 3. Provider Config Write Cleanup

- Update `provider_mgr.rs` so `upsert_saved_provider_config` still accepts `display_name`, but only persists it into launcher-local state.
- Ensure generated provider entries synced into `openclaw.json` and `agents/main/agent/models.json` contain only OpenClaw-supported fields:
  - `baseUrl`
  - `apiKey`
  - `api`
  - `models`
- On delete, remove any matching local display-name metadata.

### 4. Legacy `displayName` Self-Heal

- When listing saved providers, detect legacy `displayName` / `display_name` fields still present in `openclaw.json`.
- Migrate those values into DragonClaw-local state if a local display name is not already stored.
- Strip the legacy display-name fields from `openclaw.json` during the same self-heal pass so future reads no longer depend on them.

### 5. Workspace Model Menu Display

- Keep model switching keyed by the real `providerKey/modelId`.
- Make the workspace composer model list show the human-readable provider display name when available, without changing the existing model-selection behavior.
- Any new model-list display metadata should remain additive and optional for compatibility.

## Constraints

- No Tauri command rename, removal, or parameter-shape break.
- No OpenClaw provider JSON schema expansion beyond supported fields.
- No refactor of unrelated startup, gateway, or global model modal flows in this phase.

## Acceptance Criteria

- Saving a new custom provider in the workspace model modal shows a new card immediately without manually clicking refresh.
- The new card can be selected, edited, and switched right away in the same modal session.
- Closing and reopening the modal preserves the custom display name.
- `workspace-clone` composer model items show the display name when available, while still switching by `providerKey/modelId`.
- The corresponding provider entry in `~/.openclaw/openclaw.json` no longer contains `displayName` or `display_name`.
- Legacy provider entries with `displayName` are migrated without losing the visible name.
- Deleting a provider also removes its DragonClaw-local display-name metadata.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run tauri dev`
- Manual regression:
  - create a new workspace custom model config and keep the modal open;
  - verify the new card appears immediately;
  - verify the display name survives reopen/restart;
  - verify composer model list shows the display name;
  - verify `openclaw.json` provider entries no longer contain `displayName`;
  - verify delete also clears local display-name metadata.
