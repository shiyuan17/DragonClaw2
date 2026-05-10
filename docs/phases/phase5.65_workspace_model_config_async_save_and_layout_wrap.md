# Phase 5.65: Workspace 模型配置异步保存与卡片换行修复
> Status: Planned
> Date: 2026-05-10
> Type: Workspace model-config hotfix

## Goal

Make `workspace-clone` model-config saves feel instant by inserting the new or edited provider card immediately, while the real OpenClaw file writes continue in the background. At the same time, fix the top card area so 4+ cards wrap cleanly instead of breaking the modal layout.

## Background

The current workspace model-config modal still blocks on a full synchronous write-and-refresh path:

- the frontend waits for provider persistence, provider-list refresh, and current-config refresh before leaving the `保存中` state;
- the backend writes `openclaw.json` and `agents/main/agent/models.json` synchronously before returning;
- the top saved-provider strip uses horizontal auto-flow sizing, so the fourth card starts to compress the modal and pushes footer actions out of place.

This phase keeps the existing sync provider-save command for legacy settings flows, but adds a dedicated async save path for the workspace modal only.

## Implementation Scope

### 1. Dedicated Workspace Async Save Path

- Keep `upsert_saved_provider_config` unchanged for the settings page and any existing sync callers.
- Add a workspace-only async save command that accepts the same provider payload, returns quickly once queued, and does not modify `agents.defaults.model`.
- Extract shared provider persistence logic in Rust so both sync and async commands write the same provider JSON shape.
- Serialize background provider writes to avoid concurrent `openclaw.json` overwrite races.

### 2. Async Completion / Failure Signaling

- Emit a workspace provider-save success event after the background write finishes.
- Emit a workspace provider-save failure event with `providerKey` and error details when the background job fails.
- Let `WorkspaceClonePage` listen for those events, refresh `savedProviders` on success, and forward the outcome into the modal layer.

### 3. Optimistic Modal Save UX

- In `WorkspaceCloneModelConfigModal`, insert a pending card immediately after the user clicks save.
- Editing an existing provider should optimistically update that card in place while persistence is in flight.
- Pending cards show a visible `同步中` state and never trigger model switching.
- On async success, replace the pending card with the refreshed real provider data.
- On async failure, roll back the optimistic card change, keep the user draft visible, and show an error prompt.
- Saving provider config from the modal must no longer refresh or rewrite the current default model state.

### 4. Card Grid / Footer Layout Repair

- Replace the card strip’s horizontal auto-flow with an explicit wrapping grid:
  - 3 columns on desktop
  - 2 columns on medium widths
  - 1 column on narrow screens
- Remove the saved-card row’s horizontal overflow dependency.
- Add the necessary `min-width: 0`, wrapping, and shrink rules so the form shell and footer buttons stay inside the modal when card count grows.
- Slightly widen the model-config modal surface so 3 desktop cards fit without collapsing.

## Constraints

- Do not break any existing Tauri command names, parameter shapes, or return types used by the settings page.
- The workspace modal save path must not switch the active model.
- Delete flow stays synchronous in this phase.

## Acceptance Criteria

- Clicking save in the workspace model-config modal inserts the new card immediately and exits `保存中` quickly.
- The card shows a pending sync state until the background write completes.
- Saving provider config does not switch the current workspace model and does not move the `当前` badge unexpectedly.
- If the background write fails, the optimistic card is rolled back and the user sees the failure.
- With 4, 5, or 6 saved cards, the top area wraps cleanly and the footer buttons remain inside the modal.

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- `npm run tauri dev`
- Manual regression:
  - create a new custom provider and confirm the card appears immediately;
  - confirm the card transitions from pending to real after async completion;
  - verify the current model does not change;
  - verify a failed write rolls back the optimistic card;
  - verify 4+ cards wrap cleanly and footer actions stay visible.
